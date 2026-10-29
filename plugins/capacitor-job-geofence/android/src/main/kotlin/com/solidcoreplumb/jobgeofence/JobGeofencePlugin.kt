package com.solidcoreplumb.jobgeofence

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONObject
import java.time.ZoneId

@CapacitorPlugin(
    name = "JobGeofence",
    permissions = [
        Permission(
            strings = [Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION],
            alias = "location",
        ),
        Permission(
            strings = [Manifest.permission.ACCESS_BACKGROUND_LOCATION],
            alias = "background",
        ),
        Permission(
            strings = [Manifest.permission.POST_NOTIFICATIONS],
            alias = "notifications",
        ),
    ],
)
class JobGeofencePlugin : Plugin() {
    private var enteredReceiver: BroadcastReceiver? = null

    override fun load() {
        super.load()
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                val jobId = intent?.getStringExtra(GeofenceStore.EXTRA_JOB_ID) ?: return
                val jobName = intent.getStringExtra(GeofenceStore.EXTRA_JOB_NAME) ?: "this job"
                notifyListeners("arrival", arrivalPayload(jobId, jobName, false))
            }
        }
        enteredReceiver = receiver
        val filter = IntentFilter(GeofenceStore.ACTION_ENTERED)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            context.registerReceiver(receiver, filter)
        }
        captureOpenIntent(activity?.intent)
    }

    override fun handleOnDestroy() {
        enteredReceiver?.let { receiver ->
            try {
                context.unregisterReceiver(receiver)
            } catch (_: Exception) {
                // Already unregistered.
            }
        }
        enteredReceiver = null
        super.handleOnDestroy()
    }

    override fun handleOnNewIntent(intent: Intent?) {
        super.handleOnNewIntent(intent)
        captureOpenIntent(intent)
    }

    @PluginMethod
    fun checkAccess(call: PluginCall) {
        call.resolve(accessPayload())
    }

    @PluginMethod
    fun requestAccess(call: PluginCall) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "afterFineLocation")
            return
        }
        afterFineLocation(call)
    }

    @PermissionCallback
    private fun afterFineLocation(call: PluginCall) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.resolve(accessPayload())
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            getPermissionState("background") != PermissionState.GRANTED
        ) {
            requestPermissionForAlias("background", call, "afterBackground")
            return
        }
        afterBackground(call)
    }

    @PermissionCallback
    private fun afterBackground(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            getPermissionState("notifications") != PermissionState.GRANTED
        ) {
            requestPermissionForAlias("notifications", call, "afterNotifications")
            return
        }
        call.resolve(accessPayload())
    }

    @PermissionCallback
    private fun afterNotifications(call: PluginCall) {
        call.resolve(accessPayload())
    }

    @PluginMethod
    fun sync(call: PluginCall) {
        val sites = parseSites(call.getArray("sites"))
        val hours = parseHours(call.getObject("workHours"))
        val store = GeofenceStore(context)
        store.save(sites, hours)
        GeofenceController.reconcile(context) { result ->
            result.fold(
                onSuccess = { outcome ->
                    val payload = JSObject()
                    payload.put("monitoring", outcome.monitoring)
                    payload.put("dropped", outcome.dropped)
                    payload.put("active", outcome.active)
                    call.resolve(payload)
                },
                onFailure = { error ->
                    call.reject(error.message ?: "Could not register job-site geofences.")
                },
            )
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        GeofenceController.stop(context) {
            call.resolve()
        }
    }

    @PluginMethod
    fun consumePendingArrival(call: PluginCall) {
        val pending = GeofenceStore(context).consumePendingOpen()
        val payload = JSObject()
        if (pending == null) {
            payload.put("jobId", JSONObject.NULL)
            payload.put("jobName", JSONObject.NULL)
            payload.put("open", false)
        } else {
            payload.put("jobId", pending.first)
            payload.put("jobName", pending.second)
            payload.put("open", true)
        }
        call.resolve(payload)
    }

    private fun captureOpenIntent(intent: Intent?) {
        val jobId = intent?.getStringExtra(GeofenceStore.EXTRA_JOB_ID) ?: return
        val jobName = intent.getStringExtra(GeofenceStore.EXTRA_JOB_NAME) ?: "this job"
        GeofenceStore(context).setPendingOpen(jobId, jobName)
        notifyListeners("arrival", arrivalPayload(jobId, jobName, true))
        intent.removeExtra(GeofenceStore.EXTRA_JOB_ID)
    }

    private fun accessPayload(): JSObject {
        val payload = JSObject()
        payload.put("location", permissionWord("location"))
        val notifications = if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            "granted"
        } else {
            permissionWord("notifications")
        }
        payload.put("notifications", notifications)
        return payload
    }

    private fun permissionWord(alias: String): String {
        return when (getPermissionState(alias)) {
            PermissionState.GRANTED -> "granted"
            PermissionState.DENIED -> "denied"
            else -> "prompt"
        }
    }

    private fun arrivalPayload(jobId: String, jobName: String, open: Boolean): JSObject {
        val payload = JSObject()
        payload.put("jobId", jobId)
        payload.put("jobName", jobName)
        payload.put("open", open)
        return payload
    }

    private fun parseSites(raw: JSArray?): List<JobSite> {
        if (raw == null) return emptyList()
        val sites = ArrayList<JobSite>()
        for (index in 0 until raw.length()) {
            val row = raw.optJSONObject(index) ?: continue
            val id = row.optString("id")
            val latitude = row.optDouble("latitude", Double.NaN)
            val longitude = row.optDouble("longitude", Double.NaN)
            if (id.isBlank() || latitude.isNaN() || longitude.isNaN()) continue
            if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) continue
            val radius = row.optDouble("radiusMeters", 90.0).toFloat()
            val safeRadius = if (radius < 1f) 90f else radius
            val name = row.optString("name").replace(Regex("\\s+"), " ").trim().ifBlank { "this job" }
            sites.add(JobSite(id, name, latitude, longitude, safeRadius))
        }
        return sites
    }

    private fun parseHours(raw: JSObject?): WorkHours {
        if (raw == null) return WorkHours.defaults()
        val zone = try {
            ZoneId.of(raw.optString("timeZone", "America/Phoenix").ifBlank { "America/Phoenix" })
        } catch (_: Exception) {
            ZoneId.of("America/Phoenix")
        }
        val start = raw.optInt("startHour", 6)
        val end = raw.optInt("endHour", 16)
        if (start < 0 || end <= start || end > 23) return WorkHours.defaults()
        val weekdays = if (raw.has("weekdaysOnly")) raw.optBoolean("weekdaysOnly", true) else true
        return WorkHours(zone, start, end, weekdays)
    }
}

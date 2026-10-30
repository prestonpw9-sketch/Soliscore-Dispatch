package com.solidcoreplumb.jobgeofence

import android.Manifest
import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import org.json.JSONArray
import java.util.concurrent.atomic.AtomicBoolean
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
        // While-in-use only. Waiting here for "Allow all the time" stalls Start
        // on Android 11+ because that prompt often never calls back.
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "afterWhileInUse")
            return
        }
        call.resolve(accessPayload())
    }

    @PermissionCallback
    private fun afterWhileInUse(call: PluginCall) {
        call.resolve(accessPayload())
    }

    @PluginMethod
    @SuppressLint("MissingPermission")
    fun getCurrentPosition(call: PluginCall) {
        if (!locationServicesEnabled()) {
            call.reject("services-off")
            return
        }
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("denied")
            return
        }
        val highAccuracy = call.getBoolean("enableHighAccuracy", true) ?: true
        val timeoutMs = (call.getInt("timeout", 15_000) ?: 15_000).toLong().coerceAtLeast(1L)
        val maximumAge = (call.getInt("maximumAge", 0) ?: 0).toLong().coerceAtLeast(0L)
        val client = try {
            LocationServices.getFusedLocationProviderClient(context)
        } catch (_: Exception) {
            call.reject("unavailable")
            return
        }
        val settled = AtomicBoolean(false)
        val timer = Handler(Looper.getMainLooper())
        val token = CancellationTokenSource()
        var lastKnown: Location? = null
        fun freshEnough(location: Location?): Boolean {
            if (location == null || maximumAge <= 0L) return false
            return System.currentTimeMillis() - location.time <= maximumAge
        }
        fun finishOk(location: Location) {
            if (!settled.compareAndSet(false, true)) return
            timer.removeCallbacksAndMessages(null)
            token.cancel()
            val payload = JSObject()
            payload.put("latitude", location.latitude)
            payload.put("longitude", location.longitude)
            payload.put("accuracy", if (location.hasAccuracy()) location.accuracy.toDouble() else JSONObject.NULL)
            payload.put("speed", if (location.hasSpeed()) location.speed.toDouble() else JSONObject.NULL)
            payload.put("time", location.time)
            call.resolve(payload)
        }
        fun finishErr(message: String) {
            if (!settled.compareAndSet(false, true)) return
            timer.removeCallbacksAndMessages(null)
            token.cancel()
            call.reject(message)
        }
        // Arm the deadline before any Play Services task. lastLocation and
        // getCurrentLocation can both hang, and a timer posted inside their
        // listener would never be scheduled.
        val timeout = Runnable {
            token.cancel()
            val cached = lastKnown?.takeIf { freshEnough(it) }
            if (cached != null) finishOk(cached) else finishErr("timeout")
        }
        timer.postDelayed(timeout, timeoutMs)
        client.lastLocation.addOnCompleteListener { task ->
            if (settled.get()) return@addOnCompleteListener
            val last = if (task.isSuccessful) task.result else null
            lastKnown = last
            if (last != null && freshEnough(last)) {
                finishOk(last)
                return@addOnCompleteListener
            }
            val priority = if (highAccuracy) {
                Priority.PRIORITY_HIGH_ACCURACY
            } else {
                Priority.PRIORITY_BALANCED_POWER_ACCURACY
            }
            client.getCurrentLocation(priority, token.token).addOnCompleteListener { freshTask ->
                if (settled.get()) return@addOnCompleteListener
                val fresh = if (freshTask.isSuccessful) freshTask.result else null
                val cached = last?.takeIf { freshEnough(it) }
                when {
                    fresh != null -> finishOk(fresh)
                    cached != null -> finishOk(cached)
                    freshTask.exception == null -> finishErr("unavailable")
                    else -> finishErr("timeout")
                }
            }
        }
    }

    private fun locationServicesEnabled(): Boolean {
        val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            manager.isLocationEnabled
        } else {
            @Suppress("DEPRECATION")
            manager.isProviderEnabled(LocationManager.GPS_PROVIDER) || manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
        }
    }

    @PluginMethod
    fun requestBackgroundAccess(call: PluginCall) {
        // Resolve before the system dialog so a missing callback cannot stall.
        call.resolve(accessPayload())
        val host = activity ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            getPermissionState("location") == PermissionState.GRANTED &&
            getPermissionState("background") != PermissionState.GRANTED
        ) {
            host.requestPermissions(arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION), 4101)
        }
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

    @PluginMethod
    fun startShiftTracking(call: PluginCall) {
        val sites = JSONArray()
        call.getObject("shop")?.let { sites.put(clampedSite(it)) }
        val extra = call.getArray("sites")
        if (extra != null) {
            for (index in 0 until extra.length()) {
                val row = extra.optJSONObject(index) ?: continue
                sites.put(clampedSite(row))
            }
        }
        context.getSharedPreferences("job_geofence", android.content.Context.MODE_PRIVATE)
            .edit()
            .putString("shift_sites", sites.toString())
            .apply()
        val intent = Intent(context, ShiftTrackingService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
        call.resolve()
    }

    @PluginMethod
    fun stopShiftTracking(call: PluginCall) {
        val intent = Intent(context, ShiftTrackingService::class.java)
            .setAction(ShiftTrackingService.ACTION_STOP)
        context.startService(intent)
        call.resolve()
    }

    @PluginMethod
    fun drainSamples(call: PluginCall) {
        val payload = JSObject()
        payload.put("samples", ShiftSampleQueue.drain(context))
        call.resolve(payload)
    }

    @PluginMethod
    fun getBattery(call: PluginCall) {
        val payload = JSObject()
        val percent = ShiftSampleQueue.batteryPercent(context)
        if (percent == null) payload.put("percent", JSONObject.NULL) else payload.put("percent", percent)
        call.resolve(payload)
    }

    private fun clampedSite(row: JSONObject): JSONObject {
        val radius = row.optDouble("radiusMeters", 90.0)
        val clamped = radius.coerceIn(30.0, 200.0)
        return JSONObject()
            .put("id", row.optString("id").ifBlank { "site" })
            .put("name", row.optString("name"))
            .put("latitude", row.optDouble("latitude"))
            .put("longitude", row.optDouble("longitude"))
            .put("radiusMeters", clamped)
    }

    private fun parseHours(raw: JSObject?): WorkHours {
        if (raw == null) return WorkHours.defaults()
        val zone = try {
            ZoneId.of(raw.optString("timeZone", "America/Phoenix").ifBlank { "America/Phoenix" })
        } catch (_: Exception) {
            ZoneId.of("America/Phoenix")
        }
        val start = raw.optInt("startHour", 6)
        val end = raw.optInt("endHour", 17)
        if (start < 0 || end <= start || end > 23) return WorkHours.defaults()
        val weekdays = if (raw.has("weekdaysOnly")) raw.optBoolean("weekdaysOnly", true) else true
        return WorkHours(zone, start, end, weekdays)
    }
}

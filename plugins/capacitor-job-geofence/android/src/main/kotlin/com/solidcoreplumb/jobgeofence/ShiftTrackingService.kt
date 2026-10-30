package com.solidcoreplumb.jobgeofence

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityRecognitionResult
import com.google.android.gms.location.DetectedActivity
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONArray

/**
 * Foreground shift tracker. High-accuracy fixes only while the phone is moving.
 * Parked time uses a slow balanced request plus geofence wakes.
 */
class ShiftTrackingService : Service() {
    private var moving = false
    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val location = result.lastLocation ?: return
            ShiftSampleQueue.append(applicationContext, location)
            val fast = location.hasSpeed() && location.speed >= METERS_PER_SECOND_10_MPH
            if (fast != moving) {
                moving = fast
                restartUpdates()
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopWatching()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_MOVING -> {
                moving = true
                restartUpdates()
            }
            ACTION_PARKED -> {
                moving = false
                restartUpdates()
            }
            else -> {
                startInForeground()
                registerGeofences()
                restartUpdates()
                requestActivityUpdates()
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        stopWatching()
        super.onDestroy()
    }

    private fun startInForeground() {
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "Shift tracking", NotificationManager.IMPORTANCE_LOW)
            channel.description = "Shows while a shift is clocked in. Location is recorded only during the shift."
            manager?.createNotificationChannel(channel)
        }
        val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("Shift in progress")
            .setContentText("Location is recorded only while you are clocked in.")
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    @SuppressLint("MissingPermission")
    private fun restartUpdates() {
        val client = LocationServices.getFusedLocationProviderClient(this)
        client.removeLocationUpdates(callback)
        val interval = if (moving) MOVING_INTERVAL_MS else PARKED_INTERVAL_MS
        val priority = if (moving) Priority.PRIORITY_HIGH_ACCURACY else Priority.PRIORITY_BALANCED_POWER_ACCURACY
        val request = LocationRequest.Builder(priority, interval)
            .setMinUpdateIntervalMillis(if (moving) 5_000L else 60_000L)
            .setWaitForAccurateLocation(false)
            .build()
        client.requestLocationUpdates(request, callback, mainLooper)
    }

    @SuppressLint("MissingPermission")
    private fun registerGeofences() {
        val raw = getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_SITES, null) ?: return
        val array = try {
            JSONArray(raw)
        } catch (_: Exception) {
            return
        }
        val fences = ArrayList<Geofence>()
        for (index in 0 until array.length()) {
            val row = array.optJSONObject(index) ?: continue
            val id = row.optString("id")
            if (id.isBlank()) continue
            fences.add(
                Geofence.Builder()
                    .setRequestId(id.take(100))
                    .setCircularRegion(row.getDouble("latitude"), row.getDouble("longitude"), row.optDouble("radiusMeters", 90.0).toFloat())
                    .setExpirationDuration(Geofence.NEVER_EXPIRE)
                    .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT)
                    .build(),
            )
            if (fences.size == 100) break
        }
        val client = LocationServices.getGeofencingClient(this)
        client.removeGeofences(geofenceIntent(this))
        if (fences.isEmpty()) return
        val request = GeofencingRequest.Builder()
            .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
            .addGeofences(fences)
            .build()
        client.addGeofences(request, geofenceIntent(this))
    }

    @SuppressLint("MissingPermission")
    private fun requestActivityUpdates() {
        val intent = Intent(this, ShiftActivityReceiver::class.java)
        val pending = PendingIntent.getBroadcast(
            this,
            8,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
        )
        ActivityRecognition.getClient(this).requestActivityUpdates(60_000L, pending)
    }

    @SuppressLint("MissingPermission")
    private fun stopWatching() {
        LocationServices.getFusedLocationProviderClient(this).removeLocationUpdates(callback)
        LocationServices.getGeofencingClient(this).removeGeofences(geofenceIntent(this))
        val intent = Intent(this, ShiftActivityReceiver::class.java)
        val pending = PendingIntent.getBroadcast(
            this,
            8,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
        )
        ActivityRecognition.getClient(this).removeActivityUpdates(pending)
    }

    companion object {
        const val ACTION_STOP = "com.solidcoreplumb.jobgeofence.SHIFT_STOP"
        const val ACTION_MOVING = "com.solidcoreplumb.jobgeofence.SHIFT_MOVING"
        const val ACTION_PARKED = "com.solidcoreplumb.jobgeofence.SHIFT_PARKED"
        private const val CHANNEL_ID = "shift-tracking"
        private const val NOTIFICATION_ID = 42
        private const val PREFS = "job_geofence"
        private const val KEY_SITES = "shift_sites"
        private const val MOVING_INTERVAL_MS = 10_000L
        private const val PARKED_INTERVAL_MS = 120_000L
        private const val METERS_PER_SECOND_10_MPH = 4.4704f

        fun geofenceIntent(context: Context): PendingIntent {
            val intent = Intent(context, ShiftGeofenceReceiver::class.java)
            return PendingIntent.getBroadcast(
                context,
                7,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            )
        }
    }
}

class ShiftGeofenceReceiver : BroadcastReceiver() {
    @SuppressLint("MissingPermission")
    override fun onReceive(context: Context, intent: Intent?) {
        val event = if (intent == null) null else GeofencingEvent.fromIntent(intent)
        if (event == null || event.hasError()) return
        val pending = goAsync()
        LocationServices.getFusedLocationProviderClient(context)
            .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
            .addOnCompleteListener {
                val location = it.result
                if (location != null) ShiftSampleQueue.append(context, location)
                pending.finish()
            }
    }
}

class ShiftActivityReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent == null || !ActivityRecognitionResult.hasResult(intent)) return
        val result = ActivityRecognitionResult.extractResult(intent) ?: return
        val probable = result.mostProbableActivity
        val moving = probable.confidence >= 50 && (
            probable.type == DetectedActivity.IN_VEHICLE || probable.type == DetectedActivity.ON_BICYCLE
            )
        val parked = probable.type == DetectedActivity.STILL && probable.confidence >= 70
        val action = when {
            moving -> ShiftTrackingService.ACTION_MOVING
            parked -> ShiftTrackingService.ACTION_PARKED
            else -> return
        }
        context.startService(Intent(context, ShiftTrackingService::class.java).setAction(action))
    }
}

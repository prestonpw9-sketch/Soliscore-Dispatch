package com.solidcoreplumb.jobgeofence

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import java.time.Instant

object GeofenceController {
    data class SyncOutcome(val monitoring: Int, val dropped: Int, val active: Boolean)

    fun reconcile(context: Context, done: (Result<SyncOutcome>) -> Unit) {
        val store = GeofenceStore(context)
        val sites = store.readSites()
        if (sites.isEmpty()) {
            remove(context) {
                WorkHoursScheduler.cancel(context)
                done(Result.success(SyncOutcome(0, 0, false)))
            }
            return
        }
        val hours = store.workHours()
        val active = WorkHoursCalendar.isWithin(Instant.now(), hours)
        if (!active) {
            remove(context) {
                WorkHoursScheduler.scheduleNext(context)
                done(Result.success(SyncOutcome(0, 0, false)))
            }
            return
        }
        add(context, sites) { result ->
            WorkHoursScheduler.scheduleNext(context)
            done(result)
        }
    }

    fun stop(context: Context, done: () -> Unit) {
        val store = GeofenceStore(context)
        store.clearSites()
        remove(context) {
            WorkHoursScheduler.cancel(context)
            done()
        }
    }

    @SuppressLint("MissingPermission")
    private fun add(context: Context, sites: List<JobSite>, done: (Result<SyncOutcome>) -> Unit) {
        val kept = sites.take(GeofenceStore.ANDROID_LIMIT)
        val dropped = sites.size - kept.size
        val geofences = kept.map { site ->
            Geofence.Builder()
                .setRequestId(site.id.take(100))
                .setCircularRegion(site.latitude, site.longitude, site.radiusMeters)
                .setExpirationDuration(Geofence.NEVER_EXPIRE)
                .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER)
                .build()
        }
        val request = GeofencingRequest.Builder()
            .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
            .addGeofences(geofences)
            .build()
        LocationServices.getGeofencingClient(context)
            .addGeofences(request, geofenceIntent(context))
            .addOnSuccessListener {
                done(Result.success(SyncOutcome(kept.size, dropped, true)))
            }
            .addOnFailureListener { error ->
                done(Result.failure(error))
            }
    }

    private fun remove(context: Context, done: () -> Unit) {
        LocationServices.getGeofencingClient(context)
            .removeGeofences(geofenceIntent(context))
            .addOnCompleteListener { done() }
    }

    private fun geofenceIntent(context: Context): PendingIntent {
        val intent = Intent(context, GeofenceBroadcastReceiver::class.java)
        return PendingIntent.getBroadcast(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
        )
    }
}

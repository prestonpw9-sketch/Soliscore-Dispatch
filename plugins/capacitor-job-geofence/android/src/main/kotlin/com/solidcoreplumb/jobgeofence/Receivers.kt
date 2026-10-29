package com.solidcoreplumb.jobgeofence

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent
import java.time.Instant

class GeofenceBroadcastReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent == null) return
        val event = GeofencingEvent.fromIntent(intent) ?: return
        if (event.hasError()) return
        if (event.geofenceTransition != Geofence.GEOFENCE_TRANSITION_ENTER) return

        val app = context.applicationContext
        val store = GeofenceStore(app)
        val hours = store.workHours()
        val now = Instant.now()
        if (!WorkHoursCalendar.isWithin(now, hours)) {
            GeofenceController.reconcile(app) { }
            return
        }

        val day = WorkHoursCalendar.dayKey(now, hours)
        val triggering = event.triggeringGeofences ?: return
        for (fence in triggering) {
            val jobId = fence.requestId
            if (store.alreadyNotified(day, jobId)) continue
            store.markNotified(day, jobId)
            val jobName = store.siteName(jobId)
            ArrivalNotifier.show(app, jobId, jobName)
            app.sendBroadcast(
                Intent(GeofenceStore.ACTION_ENTERED)
                    .setPackage(app.packageName)
                    .putExtra(GeofenceStore.EXTRA_JOB_ID, jobId)
                    .putExtra(GeofenceStore.EXTRA_JOB_NAME, jobName),
            )
        }
    }
}

class WorkHoursReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        when (intent?.action) {
            WorkHoursScheduler.ACTION_START, WorkHoursScheduler.ACTION_STOP ->
                GeofenceController.reconcile(context.applicationContext) { }
            else -> Unit
        }
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return
        GeofenceController.reconcile(context.applicationContext) { }
    }
}

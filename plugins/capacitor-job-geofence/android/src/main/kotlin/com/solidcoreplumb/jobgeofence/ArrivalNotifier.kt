package com.solidcoreplumb.jobgeofence

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

object ArrivalNotifier {
    private const val CHANNEL_ID = "job-site-arrival"

    fun show(context: Context, jobId: String, jobName: String) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Job site arrival",
                NotificationManager.IMPORTANCE_HIGH,
            )
            channel.description = "Reminds you to update your time card when you arrive at a job site."
            manager.createNotificationChannel(channel)
        }

        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(GeofenceStore.EXTRA_JOB_ID, jobId)
            putExtra(GeofenceStore.EXTRA_JOB_NAME, jobName)
        } ?: return

        val tap = PendingIntent.getActivity(
            context,
            jobId.hashCode(),
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(context, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(context)
        }
        builder
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("Job site")
            .setContentText("You're at $jobName, update your time card?")
            .setAutoCancel(true)
            .setContentIntent(tap)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            @Suppress("DEPRECATION")
            builder.setPriority(Notification.PRIORITY_HIGH)
        }
        manager.notify(jobId.hashCode(), builder.build())
    }
}

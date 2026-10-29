package com.solidcoreplumb.jobgeofence

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import java.time.Instant

object WorkHoursScheduler {
    const val ACTION_START = "com.solidcoreplumb.jobgeofence.START"
    const val ACTION_STOP = "com.solidcoreplumb.jobgeofence.STOP"

    fun scheduleNext(context: Context) {
        cancel(context)
        val store = GeofenceStore(context)
        if (!store.hasSites()) return
        val boundary = WorkHoursCalendar.nextBoundary(Instant.now(), store.workHours())
        val action = if (boundary.action == "stop") ACTION_STOP else ACTION_START
        val alarm = context.getSystemService(AlarmManager::class.java) ?: return
        val pending = pending(context, action)
        val whenMs = boundary.at.toEpochMilli()
        val canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarm.canScheduleExactAlarms()
        if (canExact) {
            alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, whenMs, pending)
        } else {
            alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, whenMs, pending)
        }
    }

    fun cancel(context: Context) {
        val alarm = context.getSystemService(AlarmManager::class.java) ?: return
        alarm.cancel(pending(context, ACTION_START))
        alarm.cancel(pending(context, ACTION_STOP))
    }

    private fun pending(context: Context, action: String): PendingIntent {
        val intent = Intent(context, WorkHoursReceiver::class.java).setAction(action)
        val requestCode = if (action == ACTION_STOP) 2 else 1
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}

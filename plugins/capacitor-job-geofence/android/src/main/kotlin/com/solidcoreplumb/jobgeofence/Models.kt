package com.solidcoreplumb.jobgeofence

import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime

data class JobSite(
    val id: String,
    val name: String,
    val latitude: Double,
    val longitude: Double,
    val radiusMeters: Float,
)

data class WorkHours(
    val timeZone: ZoneId,
    val startHour: Int,
    val endHour: Int,
    val weekdaysOnly: Boolean,
) {
    companion object {
        fun defaults(): WorkHours = WorkHours(
            timeZone = ZoneId.of("America/Phoenix"),
            startHour = 6,
            endHour = 16,
            weekdaysOnly = true,
        )
    }
}

data class Boundary(val at: Instant, val action: String)

/**
 * Keep in step with src/lib/geofence/workHours.ts.
 * Start hour is inclusive, end hour is exclusive, weekdays are Monday–Friday.
 */
object WorkHoursCalendar {
    fun isWithin(now: Instant, hours: WorkHours): Boolean {
        val zoned = now.atZone(hours.timeZone)
        if (!isWorkday(zoned.dayOfWeek, hours)) return false
        return zoned.hour >= hours.startHour && zoned.hour < hours.endHour
    }

    fun dayKey(now: Instant, hours: WorkHours): String {
        val zoned = now.atZone(hours.timeZone)
        return "%04d-%02d-%02d".format(zoned.year, zoned.monthValue, zoned.dayOfMonth)
    }

    fun nextBoundary(now: Instant, hours: WorkHours): Boundary {
        val zoned = now.atZone(hours.timeZone)
        if (isWithin(now, hours)) {
            return Boundary(atHour(zoned, hours.endHour).toInstant(), "stop")
        }
        if (isWorkday(zoned.dayOfWeek, hours) && zoned.hour < hours.startHour) {
            return Boundary(atHour(zoned, hours.startHour).toInstant(), "start")
        }
        var cursor = zoned
        for (step in 1..8) {
            cursor = zoned.plusDays(step.toLong())
            if (isWorkday(cursor.dayOfWeek, hours)) {
                return Boundary(atHour(cursor, hours.startHour).toInstant(), "start")
            }
        }
        return Boundary(atHour(cursor, hours.startHour).toInstant(), "start")
    }

    private fun isWorkday(day: DayOfWeek, hours: WorkHours): Boolean {
        if (!hours.weekdaysOnly) return true
        return day != DayOfWeek.SATURDAY && day != DayOfWeek.SUNDAY
    }

    private fun atHour(zoned: ZonedDateTime, hour: Int): ZonedDateTime {
        return zoned.withHour(hour).withMinute(0).withSecond(0).withNano(0)
    }
}

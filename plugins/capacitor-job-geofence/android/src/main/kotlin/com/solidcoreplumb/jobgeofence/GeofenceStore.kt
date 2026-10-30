package com.solidcoreplumb.jobgeofence

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.time.ZoneId

class GeofenceStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun save(sites: List<JobSite>, hours: WorkHours) {
        val array = JSONArray()
        for (site in sites) {
            array.put(JSONObject()
                .put("id", site.id)
                .put("name", site.name)
                .put("latitude", site.latitude)
                .put("longitude", site.longitude)
                .put("radiusMeters", site.radiusMeters.toDouble()))
        }
        prefs.edit()
            .putString(KEY_SITES, array.toString())
            .putString(KEY_ZONE, hours.timeZone.id)
            .putInt(KEY_START, hours.startHour)
            .putInt(KEY_END, hours.endHour)
            .putBoolean(KEY_WEEKDAYS, hours.weekdaysOnly)
            .apply()
    }

    fun hasSites(): Boolean = readSites().isNotEmpty()

    fun readSites(): List<JobSite> {
        val raw = prefs.getString(KEY_SITES, null) ?: return emptyList()
        return try {
            val array = JSONArray(raw)
            val sites = ArrayList<JobSite>(array.length())
            for (index in 0 until array.length()) {
                val row = array.getJSONObject(index)
                val id = row.optString("id")
                if (id.isBlank()) continue
                sites.add(JobSite(
                    id = id,
                    name = row.optString("name").ifBlank { "this job" },
                    latitude = row.getDouble("latitude"),
                    longitude = row.getDouble("longitude"),
                    radiusMeters = row.optDouble("radiusMeters", 90.0).toFloat(),
                ))
            }
            sites
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun siteName(id: String): String {
        return readSites().firstOrNull { it.id == id }?.name ?: "this job"
    }

    fun workHours(): WorkHours {
        val zoneId = prefs.getString(KEY_ZONE, null)
        val zone = try {
            if (zoneId.isNullOrBlank()) ZoneId.of("America/Phoenix") else ZoneId.of(zoneId)
        } catch (_: Exception) {
            ZoneId.of("America/Phoenix")
        }
        val start = prefs.getInt(KEY_START, 6)
        val end = prefs.getInt(KEY_END, 17)
        if (start < 0 || end <= start || end > 23) return WorkHours.defaults()
        return WorkHours(zone, start, end, prefs.getBoolean(KEY_WEEKDAYS, true))
    }

    fun clearSites() {
        prefs.edit().remove(KEY_SITES).apply()
    }

    fun alreadyNotified(day: String, jobId: String): Boolean {
        if (prefs.getString(KEY_NOTIFIED_DAY, "") != day) return false
        val ids = prefs.getStringSet(KEY_NOTIFIED_IDS, emptySet()) ?: emptySet()
        return ids.contains(jobId)
    }

    fun markNotified(day: String, jobId: String) {
        val editor = prefs.edit()
        val ids = if (prefs.getString(KEY_NOTIFIED_DAY, "") == day) {
            HashSet(prefs.getStringSet(KEY_NOTIFIED_IDS, emptySet()) ?: emptySet())
        } else {
            HashSet()
        }
        ids.add(jobId)
        editor.putString(KEY_NOTIFIED_DAY, day)
        editor.putStringSet(KEY_NOTIFIED_IDS, ids)
        editor.apply()
    }

    fun setPendingOpen(jobId: String, jobName: String) {
        prefs.edit()
            .putString(KEY_PENDING_ID, jobId)
            .putString(KEY_PENDING_NAME, jobName)
            .putBoolean(KEY_PENDING_OPEN, true)
            .apply()
    }

    fun consumePendingOpen(): Pair<String, String>? {
        val id = prefs.getString(KEY_PENDING_ID, null) ?: return null
        if (!prefs.getBoolean(KEY_PENDING_OPEN, false)) return null
        val name = prefs.getString(KEY_PENDING_NAME, null) ?: "this job"
        prefs.edit()
            .remove(KEY_PENDING_ID)
            .remove(KEY_PENDING_NAME)
            .putBoolean(KEY_PENDING_OPEN, false)
            .apply()
        return id to name
    }

    companion object {
        private const val PREFS = "job_geofence"
        private const val KEY_SITES = "sites"
        private const val KEY_ZONE = "zone"
        private const val KEY_START = "start"
        private const val KEY_END = "end"
        private const val KEY_WEEKDAYS = "weekdays"
        private const val KEY_NOTIFIED_DAY = "notified_day"
        private const val KEY_NOTIFIED_IDS = "notified_ids"
        private const val KEY_PENDING_ID = "pending_id"
        private const val KEY_PENDING_NAME = "pending_name"
        private const val KEY_PENDING_OPEN = "pending_open"
        const val EXTRA_JOB_ID = "jobgeofence.jobId"
        const val EXTRA_JOB_NAME = "jobgeofence.jobName"
        const val ACTION_ENTERED = "com.solidcoreplumb.jobgeofence.ENTERED"
        const val ANDROID_LIMIT = 100
    }
}

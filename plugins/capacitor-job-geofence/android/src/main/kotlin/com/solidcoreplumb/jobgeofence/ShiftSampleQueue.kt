package com.solidcoreplumb.jobgeofence

import android.content.Context
import android.location.Location
import android.os.BatteryManager
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import org.json.JSONArray
import org.json.JSONObject

object ShiftSampleQueue {
    private const val PREFS = "job_geofence"
    private const val KEY = "shift_samples"
    private const val MAX = 1000

    fun append(context: Context, location: Location) {
        val sample = JSONObject()
            .put("at", location.time)
            .put("latitude", location.latitude)
            .put("longitude", location.longitude)
        if (location.hasSpeed()) sample.put("speedMps", location.speed.toDouble())
        else sample.put("speedMps", JSONObject.NULL)
        val battery = batteryPercent(context)
        if (battery == null) sample.put("batteryPercent", JSONObject.NULL)
        else sample.put("batteryPercent", battery)
        synchronized(this) {
            val array = read(context)
            array.put(sample)
            while (array.length() > MAX) array.remove(0)
            write(context, array)
        }
    }

    fun drain(context: Context): JSArray {
        val out = JSArray()
        synchronized(this) {
            val array = read(context)
            for (index in 0 until array.length()) {
                val row = array.optJSONObject(index) ?: continue
                val sample = JSObject()
                sample.put("at", row.optLong("at"))
                sample.put("latitude", row.optDouble("latitude"))
                sample.put("longitude", row.optDouble("longitude"))
                if (row.isNull("speedMps")) sample.put("speedMps", JSONObject.NULL)
                else sample.put("speedMps", row.optDouble("speedMps"))
                if (row.isNull("batteryPercent")) sample.put("batteryPercent", JSONObject.NULL)
                else sample.put("batteryPercent", row.optInt("batteryPercent"))
                out.put(sample)
            }
            write(context, JSONArray())
        }
        return out
    }

    fun batteryPercent(context: Context): Int? {
        val manager = context.getSystemService(BatteryManager::class.java) ?: return null
        val percent = manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        if (percent < 0 || percent > 100) return null
        return percent
    }

    private fun read(context: Context): JSONArray {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return JSONArray()
        return try {
            JSONArray(raw)
        } catch (_: Exception) {
            JSONArray()
        }
    }

    private fun write(context: Context, array: JSONArray) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY, array.toString())
            .apply()
    }
}

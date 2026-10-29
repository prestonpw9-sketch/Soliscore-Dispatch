import CoreLocation
import Foundation
import UIKit

enum ShiftSampleQueue {
    private static let key = "shiftSamples"
    private static let maxCount = 1000

    static func append(_ location: CLLocation) {
        var rows = UserDefaults.standard.array(forKey: key) as? [[String: Any]] ?? []
        var row: [String: Any] = [
            "at": location.timestamp.timeIntervalSince1970 * 1000,
            "latitude": location.coordinate.latitude,
            "longitude": location.coordinate.longitude
        ]
        if location.speed >= 0 {
            row["speedMps"] = location.speed
        }
        if let battery = batteryPercent() {
            row["batteryPercent"] = battery
        }
        rows.append(row)
        if rows.count > maxCount {
            rows.removeFirst(rows.count - maxCount)
        }
        UserDefaults.standard.set(rows, forKey: key)
    }

    static func drain() -> [[String: Any]] {
        let rows = UserDefaults.standard.array(forKey: key) as? [[String: Any]] ?? []
        UserDefaults.standard.removeObject(forKey: key)
        return rows
    }

    static func batteryPercent() -> Int? {
        UIDevice.current.isBatteryMonitoringEnabled = true
        let level = UIDevice.current.batteryLevel
        if level < 0 { return nil }
        return Int((level * 100).rounded())
    }
}

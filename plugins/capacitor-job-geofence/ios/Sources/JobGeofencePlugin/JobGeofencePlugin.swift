import Capacitor
import CoreLocation
import Foundation
import UserNotifications

private let iosRegionLimit = 20

struct StoredSite {
    let id: String
    let name: String
    let latitude: Double
    let longitude: Double
    let radiusMeters: Double
}

struct StoredHours {
    let timeZone: TimeZone
    let startHour: Int
    let endHour: Int
    let weekdaysOnly: Bool

    static let fallback = StoredHours(
        timeZone: TimeZone(identifier: "America/Phoenix") ?? .current,
        startHour: 6,
        endHour: 16,
        weekdaysOnly: true
    )
}

/// Start hour is inclusive, end hour is exclusive, weekdays are Monday–Friday.
/// Keep in step with src/lib/geofence/workHours.ts.
enum WorkHoursClock {
    static func isWithin(_ date: Date, hours: StoredHours) -> Bool {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = hours.timeZone
        let parts = calendar.dateComponents([.hour, .weekday], from: date)
        let hour = parts.hour ?? 0
        let weekday = parts.weekday ?? 1
        if hours.weekdaysOnly && (weekday == 1 || weekday == 7) {
            return false
        }
        return hour >= hours.startHour && hour < hours.endHour
    }

    static func dayKey(_ date: Date, hours: StoredHours) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = hours.timeZone
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }
}

@objc(JobGeofencePlugin)
public class JobGeofencePlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate, UNUserNotificationCenterDelegate {
    public let identifier = "JobGeofencePlugin"
    public let jsName = "JobGeofence"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumePendingArrival", returnType: CAPPluginReturnPromise)
    ]

    private let manager = CLLocationManager()
    private let defaults = UserDefaults.standard
    private var pendingAccessCall: CAPPluginCall?
    private var askedNotifications = false
    private var notificationsGranted = false
    private var timer: Timer?
    private var sites: [StoredSite] = []
    private var hours = StoredHours.fallback

    override public func load() {
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.pausesLocationUpdatesAutomatically = true
        UNUserNotificationCenter.current().delegate = self
        restore()
        if !sites.isEmpty {
            startArming()
            reconcile()
        }
    }

    @objc func checkAccess(_ call: CAPPluginCall) {
        call.resolve(accessPayload())
    }

    @objc func requestAccess(_ call: CAPPluginCall) {
        pendingAccessCall = call
        let status = manager.authorizationStatus
        if status == .notDetermined {
            manager.requestAlwaysAuthorization()
        }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, _ in
            DispatchQueue.main.async {
                self.askedNotifications = true
                self.notificationsGranted = granted
                self.finishAccessRequest()
            }
        }
        if status != .notDetermined {
            finishAccessRequest()
        }
    }

    @objc func sync(_ call: CAPPluginCall) {
        sites = parseSites(call.getArray("sites"))
        hours = parseHours(call.getObject("workHours"))
        persist()
        if sites.isEmpty {
            stopMonitoring()
            call.resolve([
                "monitoring": 0,
                "dropped": 0,
                "active": false
            ])
            return
        }
        startArming()
        let outcome = reconcile()
        call.resolve([
            "monitoring": outcome.monitoring,
            "dropped": outcome.dropped,
            "active": outcome.active
        ])
    }

    @objc func stop(_ call: CAPPluginCall) {
        sites = []
        persist()
        stopMonitoring()
        call.resolve()
    }

    @objc func consumePendingArrival(_ call: CAPPluginCall) {
        guard defaults.bool(forKey: "pendingOpen"),
              let jobId = defaults.string(forKey: "pendingId") else {
            call.resolve([
                "jobId": NSNull(),
                "jobName": NSNull(),
                "open": false
            ])
            return
        }
        let jobName = defaults.string(forKey: "pendingName") ?? "this job"
        defaults.removeObject(forKey: "pendingId")
        defaults.removeObject(forKey: "pendingName")
        defaults.set(false, forKey: "pendingOpen")
        call.resolve([
            "jobId": jobId,
            "jobName": jobName,
            "open": true
        ])
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        finishAccessRequest()
        if !sites.isEmpty {
            reconcile()
        }
    }

    public func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        guard WorkHoursClock.isWithin(Date(), hours: hours) else {
            stopRegions()
            return
        }
        guard let site = sites.first(where: { $0.id == region.identifier }) else { return }
        notifyArrival(jobId: site.id, jobName: site.name, open: false)
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        guard WorkHoursClock.isWithin(Date(), hours: hours) else {
            stopRegions()
            return
        }
        for site in monitoredSites() where !alreadyNotified(site.id) {
            let target = CLLocation(latitude: site.latitude, longitude: site.longitude)
            if location.distance(from: target) <= site.radiusMeters {
                notifyArrival(jobId: site.id, jobName: site.name, open: false)
            }
        }
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        NSLog("Job geofence location error: \(error.localizedDescription)")
    }

    public func locationManager(_ manager: CLLocationManager, monitoringDidFailFor region: CLRegion?, withError error: Error) {
        NSLog("Job geofence region failed: \(error.localizedDescription)")
    }

    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }

    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let info = response.notification.request.content.userInfo
        if let jobId = info["jobId"] as? String {
            let jobName = info["jobName"] as? String ?? "this job"
            defaults.set(jobId, forKey: "pendingId")
            defaults.set(jobName, forKey: "pendingName")
            defaults.set(true, forKey: "pendingOpen")
            notifyListeners("arrival", data: [
                "jobId": jobId,
                "jobName": jobName,
                "open": true
            ])
        }
        completionHandler()
    }

    private func finishAccessRequest() {
        guard let call = pendingAccessCall else { return }
        if manager.authorizationStatus == .notDetermined || !askedNotifications {
            return
        }
        pendingAccessCall = nil
        call.resolve(accessPayload())
    }

    private func accessPayload() -> PluginCallResultData {
        let location: String
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            location = "granted"
        case .denied, .restricted:
            location = "denied"
        case .notDetermined:
            location = "prompt"
        @unknown default:
            location = "prompt"
        }
        let notifications = notificationsGranted ? "granted" : (askedNotifications ? "denied" : "prompt")
        return ["location": location, "notifications": notifications]
    }

    private func startArming() {
        if CLLocationManager.significantLocationChangeMonitoringAvailable() {
            manager.startMonitoringSignificantLocationChanges()
        }
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            self?.reconcile()
        }
    }

    @discardableResult
    private func reconcile() -> (monitoring: Int, dropped: Int, active: Bool) {
        let active = WorkHoursClock.isWithin(Date(), hours: hours)
        if !active {
            stopRegions()
            return (0, 0, false)
        }
        let chosen = monitoredSites()
        let dropped = max(0, sites.count - chosen.count)
        let wanted = Set(chosen.map { $0.id })
        for region in manager.monitoredRegions where !wanted.contains(region.identifier) {
            manager.stopMonitoring(for: region)
        }
        if manager.authorizationStatus == .authorizedAlways {
            manager.allowsBackgroundLocationUpdates = true
        }
        for site in chosen {
            let cap = manager.maximumRegionMonitoringDistance
            let radius = cap > 0 ? min(max(site.radiusMeters, 1), cap) : max(site.radiusMeters, 1)
            let region = CLCircularRegion(
                center: CLLocationCoordinate2D(latitude: site.latitude, longitude: site.longitude),
                radius: radius,
                identifier: site.id
            )
            region.notifyOnEntry = true
            region.notifyOnExit = false
            manager.startMonitoring(for: region)
        }
        if manager.authorizationStatus == .authorizedAlways || manager.authorizationStatus == .authorizedWhenInUse {
            manager.requestLocation()
        }
        return (chosen.count, dropped, true)
    }

    private func monitoredSites() -> [StoredSite] {
        return Array(sites.prefix(iosRegionLimit))
    }

    private func stopMonitoring() {
        timer?.invalidate()
        timer = nil
        manager.stopMonitoringSignificantLocationChanges()
        stopRegions()
    }

    private func stopRegions() {
        for region in manager.monitoredRegions {
            manager.stopMonitoring(for: region)
        }
    }

    private func notifyArrival(jobId: String, jobName: String, open: Bool) {
        let day = WorkHoursClock.dayKey(Date(), hours: hours)
        if alreadyNotified(jobId, day: day) {
            return
        }
        markNotified(jobId, day: day)
        let content = UNMutableNotificationContent()
        content.title = "Job site"
        content.body = "You're at \(jobName), update your time card?"
        content.sound = .default
        content.userInfo = ["jobId": jobId, "jobName": jobName]
        let request = UNNotificationRequest(identifier: "arrival-\(jobId)-\(day)", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
        notifyListeners("arrival", data: [
            "jobId": jobId,
            "jobName": jobName,
            "open": open
        ])
    }

    private func alreadyNotified(_ jobId: String, day: String? = nil) -> Bool {
        let today = day ?? WorkHoursClock.dayKey(Date(), hours: hours)
        guard defaults.string(forKey: "notifiedDay") == today else { return false }
        let ids = defaults.stringArray(forKey: "notifiedIds") ?? []
        return ids.contains(jobId)
    }

    private func markNotified(_ jobId: String, day: String) {
        var ids = defaults.string(forKey: "notifiedDay") == day
            ? (defaults.stringArray(forKey: "notifiedIds") ?? [])
            : []
        ids.append(jobId)
        defaults.set(day, forKey: "notifiedDay")
        defaults.set(ids, forKey: "notifiedIds")
    }

    private func persist() {
        let encoded: [[String: Any]] = sites.map { site in
            [
                "id": site.id,
                "name": site.name,
                "latitude": site.latitude,
                "longitude": site.longitude,
                "radiusMeters": site.radiusMeters
            ]
        }
        defaults.set(encoded, forKey: "sites")
        defaults.set(hours.timeZone.identifier, forKey: "zone")
        defaults.set(hours.startHour, forKey: "startHour")
        defaults.set(hours.endHour, forKey: "endHour")
        defaults.set(hours.weekdaysOnly, forKey: "weekdaysOnly")
    }

    private func restore() {
        let rows = defaults.array(forKey: "sites") as? [[String: Any]] ?? []
        sites = rows.compactMap(siteFromDefaults)
        let zoneId = defaults.string(forKey: "zone") ?? "America/Phoenix"
        hours = StoredHours(
            timeZone: TimeZone(identifier: zoneId) ?? StoredHours.fallback.timeZone,
            startHour: defaults.object(forKey: "startHour") as? Int ?? 6,
            endHour: defaults.object(forKey: "endHour") as? Int ?? 16,
            weekdaysOnly: defaults.object(forKey: "weekdaysOnly") as? Bool ?? true
        )
    }

    private func parseSites(_ raw: JSArray?) -> [StoredSite] {
        guard let raw else { return [] }
        return raw.compactMap { item in
            guard let row = item as? JSObject else { return nil }
            return makeSite(
                id: row["id"] as? String,
                name: row["name"] as? String,
                latitude: doubleValue(row["latitude"]),
                longitude: doubleValue(row["longitude"]),
                radius: doubleValue(row["radiusMeters"])
            )
        }
    }

    private func siteFromDefaults(_ row: [String: Any]) -> StoredSite? {
        return makeSite(
            id: row["id"] as? String,
            name: row["name"] as? String,
            latitude: doubleValue(row["latitude"]),
            longitude: doubleValue(row["longitude"]),
            radius: doubleValue(row["radiusMeters"])
        )
    }

    private func makeSite(
        id: String?,
        name: String?,
        latitude: Double?,
        longitude: Double?,
        radius: Double?
    ) -> StoredSite? {
        guard let id, !id.isEmpty, let latitude, let longitude else { return nil }
        guard latitude >= -90, latitude <= 90, longitude >= -180, longitude <= 180 else { return nil }
        let cleanName = name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let meters = radius ?? 90
        return StoredSite(
            id: id,
            name: cleanName.isEmpty ? "this job" : cleanName,
            latitude: latitude,
            longitude: longitude,
            radiusMeters: meters < 1 ? 90 : meters
        )
    }

    private func parseHours(_ raw: JSObject?) -> StoredHours {
        guard let raw else { return StoredHours.fallback }
        let zoneName = raw["timeZone"] as? String ?? "America/Phoenix"
        let start = intValue(raw["startHour"] as Any?) ?? 6
        let end = intValue(raw["endHour"] as Any?) ?? 16
        if start < 0 || end <= start || end > 23 {
            return StoredHours.fallback
        }
        let weekdays = raw["weekdaysOnly"] as? Bool ?? true
        return StoredHours(
            timeZone: TimeZone(identifier: zoneName) ?? StoredHours.fallback.timeZone,
            startHour: start,
            endHour: end,
            weekdaysOnly: weekdays
        )
    }

    private func doubleValue(_ value: Any?) -> Double? {
        if let number = value as? Double { return number }
        if let number = value as? NSNumber { return number.doubleValue }
        if let text = value as? String { return Double(text) }
        return nil
    }

    private func doubleValue(_ value: JSValue?) -> Double? {
        return doubleValue(value as Any?)
    }

    private func intValue(_ value: Any?) -> Int? {
        if let number = value as? Int { return number }
        if let number = value as? NSNumber { return number.intValue }
        return nil
    }
}

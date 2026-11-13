import Capacitor
import CoreLocation
import CoreMotion
import Foundation
import UIKit
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
        endHour: 17,
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
        CAPPluginMethod(name: "requestBackgroundAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumePendingArrival", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startShiftTracking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopShiftTracking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "drainSamples", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getBattery", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCurrentPosition", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setClockInReminder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelClockInReminder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "skipClockInReminderToday", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openClockAlarms", returnType: CAPPluginReturnPromise)
    ]

    private let manager = CLLocationManager()
    private let motion = CMMotionActivityManager()
    private var shiftActive = false
    private var highFrequency = false
    private var pendingPositionCall: CAPPluginCall?
    private var pendingPositionTimeout: DispatchWorkItem?
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
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appBecameActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
        restoreSkippedReminder()
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
        let status = manager.authorizationStatus
        if status == .notDetermined {
            pendingAccessCall = call
            manager.requestWhenInUseAuthorization()
            return
        }
        call.resolve(accessPayload())
    }

    @objc func requestBackgroundAccess(_ call: CAPPluginCall) {
        // Resolve first. The Always prompt must not hold Start.
        call.resolve(accessPayload())
        if manager.authorizationStatus == .authorizedWhenInUse {
            manager.requestAlwaysAuthorization()
        }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, _ in
            DispatchQueue.main.async {
                self.askedNotifications = true
                self.notificationsGranted = granted
            }
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

    @objc func startShiftTracking(_ call: CAPPluginCall) {
        let shop = call.getObject("shop")
        var tracked: [StoredSite] = []
        if let shop, let site = makeSite(
            id: shop["id"] as? String ?? "shop",
            name: shop["name"] as? String,
            latitude: doubleValue(shop["latitude"]),
            longitude: doubleValue(shop["longitude"]),
            radius: doubleValue(shop["radiusMeters"])
        ) {
            tracked.append(site)
        }
        tracked.append(contentsOf: parseSites(call.getArray("sites")))
        sites = tracked
        shiftActive = true
        if manager.authorizationStatus == .authorizedAlways {
            manager.allowsBackgroundLocationUpdates = true
        }
        if CLLocationManager.significantLocationChangeMonitoringAvailable() {
            manager.startMonitoringSignificantLocationChanges()
        }
        setHighFrequency(false)
        reconcile()
        if CMMotionActivityManager.isActivityAvailable() {
            motion.startActivityUpdates(to: .main) { [weak self] activity in
                guard let self, let activity else { return }
                let moving = activity.automotive || activity.cycling
                if activity.stationary {
                    self.setHighFrequency(false)
                } else if moving {
                    self.setHighFrequency(true)
                }
            }
        }
        call.resolve()
    }

    @objc func stopShiftTracking(_ call: CAPPluginCall) {
        shiftActive = false
        highFrequency = false
        motion.stopActivityUpdates()
        manager.stopUpdatingLocation()
        stopMonitoring()
        call.resolve()
    }

    @objc func drainSamples(_ call: CAPPluginCall) {
        let samples = ShiftSampleQueue.drain().map { row -> [String: Any] in
            var sample: [String: Any] = [
                "at": row["at"] ?? 0,
                "latitude": row["latitude"] ?? 0,
                "longitude": row["longitude"] ?? 0
            ]
            if let speed = row["speedMps"] {
                sample["speedMps"] = speed
            } else {
                sample["speedMps"] = NSNull()
            }
            if let battery = row["batteryPercent"] {
                sample["batteryPercent"] = battery
            } else {
                sample["batteryPercent"] = NSNull()
            }
            return sample
        }
        call.resolve(["samples": samples])
    }

    @objc func getCurrentPosition(_ call: CAPPluginCall) {
        if !CLLocationManager.locationServicesEnabled() {
            call.reject("services-off")
            return
        }
        let status = manager.authorizationStatus
        if status == .denied || status == .restricted {
            call.reject("denied")
            return
        }
        let highAccuracy = call.getBool("enableHighAccuracy", true)
        let timeoutMs = call.getDouble("timeout", 15000)
        let maximumAge = call.getDouble("maximumAge", 0)
        if maximumAge > 0, let last = manager.location,
           Date().timeIntervalSince(last.timestamp) * 1000 <= maximumAge {
            call.resolve(locationPayload(last))
            return
        }
        pendingPositionTimeout?.cancel()
        pendingPositionCall = call
        manager.desiredAccuracy = highAccuracy ? kCLLocationAccuracyBest : kCLLocationAccuracyHundredMeters
        let work = DispatchWorkItem { [weak self] in
            guard let self, let pending = self.pendingPositionCall else { return }
            self.pendingPositionCall = nil
            if maximumAge > 0, let last = self.manager.location,
               Date().timeIntervalSince(last.timestamp) * 1000 <= maximumAge {
                pending.resolve(self.locationPayload(last))
            } else {
                pending.reject("timeout")
            }
        }
        pendingPositionTimeout = work
        DispatchQueue.main.asyncAfter(deadline: .now() + timeoutMs / 1000, execute: work)
        if status == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
        manager.requestLocation()
    }

    @objc func getBattery(_ call: CAPPluginCall) {
        if let percent = ShiftSampleQueue.batteryPercent() {
            call.resolve(["percent": percent])
        } else {
            call.resolve(["percent": NSNull()])
        }
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
        if let pending = pendingPositionCall {
            pendingPositionCall = nil
            pendingPositionTimeout?.cancel()
            pendingPositionTimeout = nil
            pending.resolve(locationPayload(location))
        }
        if shiftActive {
            ShiftSampleQueue.append(location)
            let moving = location.speed >= 4.4704
            setHighFrequency(moving)
            notifyListeners("sample", data: samplePayload(location))
            return
        }
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
        if let pending = pendingPositionCall {
            pendingPositionCall = nil
            pendingPositionTimeout?.cancel()
            pendingPositionTimeout = nil
            let denied = (error as? CLError)?.code == .denied
            pending.reject(denied ? "denied" : "unavailable")
            return
        }
        NSLog("Job geofence location error: \(error.localizedDescription)")
    }

    private func locationPayload(_ location: CLLocation) -> [String: Any] {
        var payload: [String: Any] = [
            "latitude": location.coordinate.latitude,
            "longitude": location.coordinate.longitude,
            "time": location.timestamp.timeIntervalSince1970 * 1000
        ]
        if location.horizontalAccuracy >= 0 {
            payload["accuracy"] = location.horizontalAccuracy
        } else {
            payload["accuracy"] = NSNull()
        }
        if location.speed >= 0 {
            payload["speed"] = location.speed
        } else {
            payload["speed"] = NSNull()
        }
        return payload
    }

    public func locationManager(_ manager: CLLocationManager, monitoringDidFailFor region: CLRegion?, withError error: Error) {
        NSLog("Job geofence region failed: \(error.localizedDescription)")
    }

    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Clock-in reminder while a shift is already running: stay quiet.
        if notification.request.content.userInfo["clockInReminder"] as? Bool == true && shiftActive {
            completionHandler([])
            return
        }
        completionHandler([.banner, .sound])
    }

    // MARK: Clock-in reminder
    //
    // iPhone apps can't add alarms to the Clock app, so the opt-in reminder
    // (at the time the worker picked, 6:00 AM by default) is one repeating
    // calendar notification per weekday. Setting it again replaces them. Apple
    // weekday numbers: 1 = Sunday … 7 = Saturday.

    private static let reminderPrefix = "clockin-reminder-"
    private static let reminderKey = "clockInReminder"
    private static let reminderSkipKey = "clockInReminderSkip"

    @objc func setClockInReminder(_ call: CAPPluginCall) {
        let hour = min(max(call.getInt("hour", 6), 0), 23)
        let minute = min(max(call.getInt("minute", 0), 0), 59)
        let title = call.getString("title", "Clock in")
        let body = call.getString("body", "Time to clock in. Open ITDG Dispatch and tap Start.")
        // JS sends 1 = Monday … 7 = Sunday.
        var weekdays = (call.getArray("weekdays") ?? []).compactMap { intValue($0 as Any?) }
            .filter { $0 >= 1 && $0 <= 7 }
            .map { $0 % 7 + 1 }
        if weekdays.isEmpty {
            weekdays = [2, 3, 4, 5, 6]
        }
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            DispatchQueue.main.async {
                self.askedNotifications = true
                self.notificationsGranted = granted
                guard granted else {
                    call.reject("notifications-denied")
                    return
                }
                self.removeReminderRequests()
                self.defaults.removeObject(forKey: Self.reminderSkipKey)
                let config: [String: Any] = [
                    "hour": hour,
                    "minute": minute,
                    "weekdays": weekdays,
                    "title": title,
                    "body": body
                ]
                self.defaults.set(config, forKey: Self.reminderKey)
                for weekday in weekdays {
                    self.addReminderRequest(weekday: weekday, config: config)
                }
                call.resolve(["method": "notification"])
            }
        }
    }

    @objc func cancelClockInReminder(_ call: CAPPluginCall) {
        removeReminderRequests()
        defaults.removeObject(forKey: Self.reminderKey)
        defaults.removeObject(forKey: Self.reminderSkipKey)
        call.resolve(["removed": true])
    }

    /// Already clocked in before the reminder: drop today's. It is re-added
    /// once today's time has passed (next app launch or return to the app).
    @objc func skipClockInReminderToday(_ call: CAPPluginCall) {
        restoreSkippedReminder()
        guard let config = defaults.dictionary(forKey: Self.reminderKey) else {
            call.resolve(["skipped": false])
            return
        }
        let now = Date()
        let calendar = Calendar.current
        let weekday = calendar.component(.weekday, from: now)
        let weekdays = config["weekdays"] as? [Int] ?? []
        guard weekdays.contains(weekday), let due = todayAt(config, now: now), now < due else {
            call.resolve(["skipped": false])
            return
        }
        UNUserNotificationCenter.current().removePendingNotificationRequests(
            withIdentifiers: [Self.reminderPrefix + String(weekday)]
        )
        defaults.set(["day": localDayKey(now), "weekday": weekday], forKey: Self.reminderSkipKey)
        call.resolve(["skipped": true])
    }

    @objc func openClockAlarms(_ call: CAPPluginCall) {
        call.reject("unsupported")
    }

    @objc private func appBecameActive() {
        restoreSkippedReminder()
    }

    private func restoreSkippedReminder() {
        guard let skip = defaults.dictionary(forKey: Self.reminderSkipKey) else { return }
        guard let config = defaults.dictionary(forKey: Self.reminderKey),
              let weekday = skip["weekday"] as? Int else {
            defaults.removeObject(forKey: Self.reminderSkipKey)
            return
        }
        let now = Date()
        let sameDay = (skip["day"] as? String) == localDayKey(now)
        if sameDay, let due = todayAt(config, now: now), now < due {
            return
        }
        // Today's time has passed, so the repeating trigger next fires next week.
        addReminderRequest(weekday: weekday, config: config)
        defaults.removeObject(forKey: Self.reminderSkipKey)
    }

    private func addReminderRequest(weekday: Int, config: [String: Any]) {
        var match = DateComponents()
        match.weekday = weekday
        match.hour = config["hour"] as? Int ?? 6
        match.minute = config["minute"] as? Int ?? 0
        let content = UNMutableNotificationContent()
        content.title = config["title"] as? String ?? "Clock in"
        content.body = config["body"] as? String ?? "Time to clock in."
        content.sound = .default
        content.userInfo = ["clockInReminder": true]
        let trigger = UNCalendarNotificationTrigger(dateMatching: match, repeats: true)
        let request = UNNotificationRequest(
            identifier: Self.reminderPrefix + String(weekday),
            content: content,
            trigger: trigger
        )
        UNUserNotificationCenter.current().add(request)
    }

    private func removeReminderRequests() {
        let ids = (1...7).map { Self.reminderPrefix + String($0) }
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ids)
        center.removeDeliveredNotifications(withIdentifiers: ids)
    }

    private func todayAt(_ config: [String: Any], now: Date) -> Date? {
        return Calendar.current.date(
            bySettingHour: config["hour"] as? Int ?? 6,
            minute: config["minute"] as? Int ?? 0,
            second: 0,
            of: now
        )
    }

    private func localDayKey(_ date: Date) -> String {
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
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
        if manager.authorizationStatus == .notDetermined {
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

    private func setHighFrequency(_ enabled: Bool) {
        guard shiftActive else { return }
        highFrequency = enabled
        if enabled {
            manager.desiredAccuracy = kCLLocationAccuracyBest
            manager.distanceFilter = 15
            manager.startUpdatingLocation()
        } else {
            manager.stopUpdatingLocation()
            manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
            if CLLocationManager.significantLocationChangeMonitoringAvailable() {
                manager.startMonitoringSignificantLocationChanges()
            }
        }
    }

    private func samplePayload(_ location: CLLocation) -> [String: Any] {
        var payload: [String: Any] = [
            "at": location.timestamp.timeIntervalSince1970 * 1000,
            "latitude": location.coordinate.latitude,
            "longitude": location.coordinate.longitude
        ]
        if location.speed >= 0 {
            payload["speedMps"] = location.speed
        } else {
            payload["speedMps"] = NSNull()
        }
        if let battery = ShiftSampleQueue.batteryPercent() {
            payload["batteryPercent"] = battery
        } else {
            payload["batteryPercent"] = NSNull()
        }
        return payload
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
            endHour: defaults.object(forKey: "endHour") as? Int ?? 17,
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
        let end = intValue(raw["endHour"] as Any?) ?? 17
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

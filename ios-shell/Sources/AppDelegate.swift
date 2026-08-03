import BrazeKit
import UIKit
import UserNotifications

@main
final class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
  var window: UIWindow?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Unbuffered stdout so print()s appear live under `simctl launch --console`
    // (stdout is block-buffered when piped, and terminate kills before flush).
    setvbuf(stdout, nil, _IONBF, 0)

    BrazeManager.shared.configure()
    UNUserNotificationCenter.current().delegate = self

    requestNotificationsOnLaunch(application)

    let window = UIWindow(frame: UIScreen.main.bounds)
    window.rootViewController = WebViewController()
    window.makeKeyAndVisible()
    self.window = window
    return true
  }

  func application(
    _ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    if (window?.rootViewController as? WebViewController)?.handleInternalRoute(
      url.absoluteString, source: "ios_url"
    ) == true {
      return true
    }

    guard url.scheme == "braze-demo", url.host == "command",
      let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
      let encoded = components.queryItems?.first(where: { $0.name == "payload" })?.value,
      let data = Data(base64URLEncoded: encoded),
      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return false }
    (window?.rootViewController as? WebViewController)?.executeDemoCommand(json)
    return true
  }

  // MARK: - APNs registration

  func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    BrazeManager.shared.braze?.notifications.register(deviceToken: deviceToken)
    UserDefaults.standard.set(true, forKey: PushDefaults.apnsTokenRegistered)
    UserDefaults.standard.set(deviceToken.count, forKey: PushDefaults.apnsTokenLength)
    UserDefaults.standard.removeObject(forKey: PushDefaults.apnsRegistrationError)
    print("[push] registered APNs device token (\(deviceToken.count) bytes)")
    postLauncherTelemetry(
      type: "apns_token",
      label: "APNs device token registered",
      status: "success",
      payload: pushDiagnosticsPayload())
  }

  func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    UserDefaults.standard.set(false, forKey: PushDefaults.apnsTokenRegistered)
    UserDefaults.standard.set(error.localizedDescription, forKey: PushDefaults.apnsRegistrationError)
    print("[push] failed to register: \(error.localizedDescription)")
    postLauncherTelemetry(
      type: "apns_token",
      label: "APNs device token registration failed",
      status: "error",
      payload: pushDiagnosticsPayload(),
      result: ["error": error.localizedDescription])
  }

  // MARK: - UNUserNotificationCenterDelegate

  /// Notification tapped (background / lock screen).
  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let content = response.notification.request.content
    let info = content.userInfo
    let uri = (info["uri"] as? String) ?? ((info["ab"] as? [String: Any])?["uri"] as? String)
    postLauncherTelemetry(
      type: "push_opened",
      label: "iOS native push opened",
      status: "success",
      payload: [
        "title": content.title,
        "bodyPresent": !content.body.isEmpty,
        "deeplink": uri ?? "",
        "displayMode": "native_opened",
        "signedBuildRequired": true,
      ])
    if let braze = BrazeManager.shared.braze,
      braze.notifications.handleUserNotification(
        response: response, withCompletionHandler: completionHandler)
    {
      return
    }
    completionHandler()
  }

  /// Foreground presentation for real APNs/Braze push. Keep this native so a
  /// real push behaves like the OS notification users already understand.
  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    let content = notification.request.content
    let info = content.userInfo
    let uri = (info["uri"] as? String) ?? ((info["ab"] as? [String: Any])?["uri"] as? String)
    postLauncherTelemetry(
      type: "push_received",
      label: "iOS foreground push presented natively",
      status: "success",
      payload: [
        "title": content.title,
        "bodyPresent": !content.body.isEmpty,
        "deeplink": uri ?? "",
        "displayMode": "native_foreground",
        "signedBuildRequired": true,
      ])
    completionHandler([.banner, .sound, .list])
  }

  private func requestNotificationsOnLaunch(_ application: UIApplication) {
    UNUserNotificationCenter.current().getNotificationSettings { settings in
      let status = Self.authorizationStatusName(settings.authorizationStatus)
      UserDefaults.standard.set(status, forKey: PushDefaults.authorizationStatus)
      if settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional {
        DispatchQueue.main.async { application.registerForRemoteNotifications() }
        self.postLauncherTelemetry(
          type: "push_permission",
          label: "iOS notification permission already granted",
          status: "success",
          payload: self.pushDiagnosticsPayload().merging(["autoLaunch": true]) { _, new in new })
        return
      }
      let prompted = UserDefaults.standard.bool(forKey: PushDefaults.autoPromptAttempted)
      guard settings.authorizationStatus == .notDetermined, !prompted else {
        self.postLauncherTelemetry(
          type: "push_permission",
          label: "iOS notification permission not granted",
          status: "info",
          payload: self.pushDiagnosticsPayload().merging([
            "autoLaunch": true,
            "promptAlreadyAttempted": prompted,
          ]) { _, new in new })
        return
      }
      UserDefaults.standard.set(true, forKey: PushDefaults.autoPromptAttempted)
      UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) {
        granted, error in
        let nextStatus = granted ? "granted" : "denied"
        UserDefaults.standard.set(nextStatus, forKey: PushDefaults.authorizationStatus)
        if granted {
          DispatchQueue.main.async { application.registerForRemoteNotifications() }
        }
        self.postLauncherTelemetry(
          type: "push_permission",
          label: "iOS notification permission \(nextStatus)",
          status: granted ? "success" : "info",
          payload: self.pushDiagnosticsPayload().merging(["autoLaunch": true]) { _, new in new },
          result: error.map { ["error": $0.localizedDescription] })
      }
    }
  }

  private func pushDiagnosticsPayload() -> [String: Any] {
    [
      "permission": UserDefaults.standard.string(forKey: PushDefaults.authorizationStatus) ?? "unknown",
      "tokenPresent": UserDefaults.standard.bool(forKey: PushDefaults.apnsTokenRegistered),
      "tokenLength": UserDefaults.standard.integer(forKey: PushDefaults.apnsTokenLength),
      "registrationError": UserDefaults.standard.string(forKey: PushDefaults.apnsRegistrationError) ?? "",
      "sdkDeviceId": BrazeManager.shared.braze?.deviceId ?? "",
      "externalId": BrazeManager.shared.activeExternalId,
      "signedBuildRequired": true,
    ]
  }

  private func postLauncherTelemetry(
    type: String,
    label: String,
    status: String,
    payload: Any = [:],
    result: Any? = nil
  ) {
    let target = Config.launcherCallbackUrl
    guard !target.isEmpty, let url = URL(string: target) else { return }
    var body: [String: Any] = [
      "platform": "ios",
      "type": type,
      "label": label,
      "status": status,
      "externalId": BrazeManager.shared.activeExternalId,
      "payload": payload,
    ]
    if let result { body["result"] = result }
    guard JSONSerialization.isValidJSONObject(body),
      let data = try? JSONSerialization.data(withJSONObject: body)
    else { return }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.timeoutInterval = 1.5
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = data
    URLSession.shared.dataTask(with: request).resume()
  }

  private static func authorizationStatusName(_ status: UNAuthorizationStatus) -> String {
    switch status {
    case .authorized, .provisional, .ephemeral:
      return "granted"
    case .denied:
      return "denied"
    case .notDetermined:
      return "default"
    @unknown default:
      return "unknown"
    }
  }

  private enum PushDefaults {
    static let autoPromptAttempted = "braze.demo.ios.autoPushPromptAttempted"
    static let authorizationStatus = "braze.demo.ios.pushAuthorizationStatus"
    static let apnsTokenRegistered = "braze.demo.ios.apnsTokenRegistered"
    static let apnsTokenLength = "braze.demo.ios.apnsTokenLength"
    static let apnsRegistrationError = "braze.demo.ios.apnsRegistrationError"
  }
}

private extension Data {
  init?(base64URLEncoded value: String) {
    var base64 = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    let padding = base64.count % 4
    if padding > 0 { base64.append(String(repeating: "=", count: 4 - padding)) }
    self.init(base64Encoded: base64)
  }
}

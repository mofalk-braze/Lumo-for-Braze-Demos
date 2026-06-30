import UIKit
import UserNotifications
import WebKit

/// Hosts the web template in a safe-area WKWebView and implements the bridge:
/// JS → native (WKScriptMessageHandler) and native → JS (evaluateJavaScript into
/// window.__brazeBridge.receive). The contract matches src/braze/bridge.ts.
final class WebViewController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler {
  private var webView: WKWebView!

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .white

    let contentController = WKUserContentController()
    contentController.add(WeakScriptMessageHandler(self), name: "brazeBridge")

    let config = WKWebViewConfiguration()
    config.userContentController = contentController
    config.defaultWebpagePreferences.allowsContentJavaScript = true

    webView = WKWebView(frame: .zero, configuration: config)
    webView.translatesAutoresizingMaskIntoConstraints = false
    webView.navigationDelegate = self
    webView.scrollView.bounces = false
    view.addSubview(webView)
    NSLayoutConstraint.activate([
      webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
      webView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
      webView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
      webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
    ])

    BrazeManager.shared.onContentCards = { [weak self] cards in
      DispatchQueue.main.async {
        self?.send("contentCards", payload: cards)
        self?.postLauncherTelemetry(
          type: "content_cards",
          label: "iOS Content Cards updated",
          status: "success",
          payload: ["count": cards.count],
          result: cards)
      }
    }

    // Ignore cache so a fresh web build is always loaded against the dev server.
    webView.load(URLRequest(url: BrazeManager.shared.activeWebURL, cachePolicy: .reloadIgnoringLocalCacheData))
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    reportLoadFailure(error)
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    reportLoadFailure(error)
  }

  // MARK: - JS → native

  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
    let payload = body["payload"] as? [String: Any]
    print("[bridge ←] \(action) \(payload ?? [:])")
    handle(action: action, payload: payload)
  }

  private func handle(action: String, payload: [String: Any]?) {
    let braze = BrazeManager.shared
    postLauncherTelemetry(
        type: "bridge_action",
        label: "web -> native: \(action)",
        status: "info",
        payload: [
          "action": action,
          "payload": payload ?? [:],
          "sync": payload?["sync"] as? [String: Any] ?? braze.syncEnvelope(authority: "web", reason: "manual"),
        ])
    switch action {
    case "webReady":
      send("ready", payload: nil)
      sendConnection()
      send("profiles", payload: braze.profilesPayload())
      reportPushStatus(reason: "webReady")
      postLauncherTelemetry(
        type: "runtime_ready",
        label: "iOS runtime ready",
        status: "success",
        payload: [
          "sourceUrl": braze.activeWebURL.absoluteString,
          "runtime": braze.runtimePayload(),
          "diagnostics": deviceDiagnosticsPayload(permission: nil),
          "sync": payload?["sync"] as? [String: Any] ?? braze.syncEnvelope(authority: "native", reason: "default"),
        ],
        result: braze.runtimePayload())
    case "saveCredentialProfile":
      if let p = payload, let name = p["name"] as? String,
        let key = p["apiKey"] as? String, let endpoint = p["endpoint"] as? String {
        let id = (p["id"] as? String) ?? UUID().uuidString
        let ext = (p["externalId"] as? String) ?? ""
        let webURL = (p["webURL"] as? String) ?? ""
        braze.saveProfile(
          CredentialProfile(
            id: id, name: name, apiKey: key, endpoint: endpoint, externalId: ext, webURL: webURL))
        reloadWeb()
      }
    case "selectCredentialProfile":
      if let id = payload?["id"] as? String {
        braze.selectProfile(id: id)
        reloadWeb()
      }
    case "listProfiles":
      send("profiles", payload: braze.profilesPayload())
    case "changeUser":
      if let id = payload?["externalId"] as? String {
        let sync = payload?["sync"] as? [String: Any]
        braze.changeUser(id, sync: sync)
        sendConnection(sync: sync ?? braze.syncEnvelope(authority: "web", reason: "manual"))
        requestPushReadiness(reason: "change_user")
        postLauncherTelemetry(
          type: "change_user",
          label: "Changed iOS SDK user",
          status: "success",
          externalId: id,
          payload: ["externalId": id, "sync": sync ?? braze.syncEnvelope(authority: "web", reason: "manual")])
      }
    case "setCustomAttribute":
      if let key = payload?["key"] as? String, let value = payload?["value"] {
        braze.setCustomAttribute(key: key, value: value)
        postLauncherTelemetry(
          type: "sdk_attribute",
          label: "Set iOS SDK attribute",
          status: "success",
          payload: ["key": key, "value": value])
      }
    case "logCustomEvent":
      if let name = payload?["name"] as? String {
        braze.logCustomEvent(name, properties: payload?["properties"] as? [String: Any])
        postLauncherTelemetry(
          type: "sdk_event",
          label: "Logged iOS SDK event",
          status: "success",
          payload: ["name": name, "properties": payload?["properties"] as? [String: Any] ?? [:]])
      }
    case "logPurchase":
      if let pid = payload?["productId"] as? String {
        let price = (payload?["price"] as? NSNumber)?.doubleValue ?? 0
        let currency = payload?["currency"] as? String ?? "USD"
        let qty = (payload?["quantity"] as? NSNumber)?.intValue ?? 1
        braze.logPurchase(
          productId: pid, price: price, currency: currency, quantity: qty,
          properties: payload?["properties"] as? [String: Any])
        postLauncherTelemetry(
          type: "sdk_purchase",
          label: "Logged iOS SDK purchase",
          status: "success",
          payload: payload ?? [:])
      }
    case "requestContentCardsRefresh":
      braze.requestContentCardsRefresh()
      postLauncherTelemetry(
        type: "content_cards_refresh",
        label: "Requested iOS Content Cards refresh",
        status: "success")
    case "logContentCardImpression":
      if let id = payload?["cardId"] as? String {
        braze.logImpression(cardId: id)
        postLauncherTelemetry(
          type: "content_card_impression",
          label: "iOS Content Card impression",
          status: "success",
          payload: ["cardId": id])
      }
    case "logContentCardClick":
      if let id = payload?["cardId"] as? String {
        braze.logClick(cardId: id)
        postLauncherTelemetry(
          type: "content_card_click",
          label: "iOS Content Card click",
          status: "success",
          payload: ["cardId": id])
      }
    case "requestPushPermission":
      requestPush()
    case "requestPushReadiness":
      requestPushReadiness(reason: payload?["reason"] as? String ?? "bridge")
    default:
      print("[bridge] unknown action: \(action)")
    }
  }

  func executeDemoCommand(_ command: [String: Any]) {
    let action = command["action"] as? String ?? ""
    let payload = command["payload"] as? [String: Any] ?? [:]
    let externalId = (command["externalId"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? BrazeManager.shared.activeExternalId
    let callbackUrl = command["callbackUrl"] as? String ?? ""
    let commandSync = BrazeManager.shared.syncEnvelope(authority: "control_room", reason: "command")
    let needsBraze = ["changeUser", "logCustomEvent", "setCustomAttribute", "logPurchase", "requestContentCardsRefresh", "requestPushReadiness"].contains(action)
    guard !needsBraze || BrazeManager.shared.isConfigured else {
      postLauncherTelemetry(
        type: "demo_command",
        label: "iOS demo command failed",
        status: "error",
        externalId: externalId,
        payload: command,
        result: ["error": "Braze is not configured for the active iOS profile"],
        callbackUrl: callbackUrl)
      return
    }

    if !externalId.isEmpty && action != "changeUser" {
      BrazeManager.shared.changeUser(externalId, sync: commandSync)
      sendConnection(sync: commandSync)
    }

    switch action {
    case "changeUser":
      BrazeManager.shared.changeUser(externalId, sync: commandSync)
      sendConnection(sync: commandSync)
      requestPushReadiness(reason: "change_user")
    case "logCustomEvent":
      guard let name = payload["name"] as? String, !name.isEmpty else {
        postCommandError("Missing event name", command: command, externalId: externalId, callbackUrl: callbackUrl)
        return
      }
      BrazeManager.shared.logCustomEvent(name, properties: payload["properties"] as? [String: Any])
    case "setCustomAttribute":
      if let attributes = payload["attributes"] as? [String: Any] {
        attributes.forEach { key, value in BrazeManager.shared.setCustomAttribute(key: key, value: value) }
      } else if let key = payload["key"] as? String, !key.isEmpty, let value = payload["value"] {
        BrazeManager.shared.setCustomAttribute(key: key, value: value)
      } else {
        postCommandError("Missing attribute key", command: command, externalId: externalId, callbackUrl: callbackUrl)
        return
      }
    case "logPurchase":
      guard let productId = payload["productId"] as? String, !productId.isEmpty else {
        postCommandError("Missing productId", command: command, externalId: externalId, callbackUrl: callbackUrl)
        return
      }
      let price = (payload["price"] as? NSNumber)?.doubleValue ?? 0
      let currency = payload["currency"] as? String ?? "USD"
      let quantity = (payload["quantity"] as? NSNumber)?.intValue ?? 1
      BrazeManager.shared.logPurchase(
        productId: productId,
        price: price,
        currency: currency,
        quantity: quantity,
        properties: payload["properties"] as? [String: Any])
    case "requestContentCardsRefresh":
      BrazeManager.shared.requestContentCardsRefresh()
    case "requestPushPermission":
      requestPush()
    case "requestPushReadiness":
      requestPushReadiness(reason: payload["reason"] as? String ?? "command")
    case "navigate":
      let route = (payload["route"] as? String) ?? (payload["uri"] as? String) ?? "/"
      send("navigate", rawJSON: jsonString(route))
    case "foregroundPush":
      deliverForegroundPush(
        title: payload["title"] as? String ?? Config.demoPackName,
        body: payload["body"] as? String ?? "",
        uri: payload["uri"] as? String)
    default:
      postCommandError("Unsupported demo command action: \(action)", command: command, externalId: externalId, callbackUrl: callbackUrl)
      return
    }

    postLauncherTelemetry(
      type: "demo_command",
      label: "Executed iOS demo command",
      status: "success",
      externalId: externalId,
      payload: command,
      result: ["sync": commandSync],
      callbackUrl: callbackUrl)
  }

  private func postCommandError(_ error: String, command: [String: Any], externalId: String, callbackUrl: String) {
    postLauncherTelemetry(
      type: "demo_command",
      label: "iOS demo command failed",
      status: "error",
      externalId: externalId,
      payload: command,
      result: ["error": error],
      callbackUrl: callbackUrl)
  }

  private func requestPush() {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) {
      [weak self] granted, _ in
      DispatchQueue.main.async {
        UIApplication.shared.registerForRemoteNotifications()
        self?.send("pushPermission", rawJSON: granted ? "\"granted\"" : "\"denied\"")
        UserDefaults.standard.set(granted ? "granted" : "denied", forKey: PushDefaults.authorizationStatus)
        self?.postLauncherTelemetry(
          type: "push_permission",
          label: "iOS notification permission \(granted ? "granted" : "denied")",
          status: granted ? "success" : "info",
          payload: self?.deviceDiagnosticsPayload(permission: granted ? "granted" : "denied") ?? [:])
      }
    }
  }

  private func reportPushStatus(reason: String) {
    UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
      let permission = Self.authorizationStatusName(settings.authorizationStatus)
      UserDefaults.standard.set(permission, forKey: PushDefaults.authorizationStatus)
      DispatchQueue.main.async {
        self?.send("pushPermission", rawJSON: self?.jsonString(permission) ?? "\"default\"")
        self?.postLauncherTelemetry(
          type: "push_permission",
          label: "iOS notification permission \(permission)",
          status: permission == "granted" ? "success" : "info",
          payload: self?.deviceDiagnosticsPayload(permission: permission, reason: reason) ?? [:])
      }
    }
  }

  private func requestPushReadiness(reason: String) {
    UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
      let permission = Self.authorizationStatusName(settings.authorizationStatus)
      UserDefaults.standard.set(permission, forKey: PushDefaults.authorizationStatus)
      let tokenPresent = UserDefaults.standard.bool(forKey: PushDefaults.apnsTokenRegistered)
      DispatchQueue.main.async {
        if permission == "granted" {
          UIApplication.shared.registerForRemoteNotifications()
        }
        let status = tokenPresent ? "success" : (permission == "granted" ? "warning" : "error")
        let label: String
        if tokenPresent {
          label = "APNs device token registered"
        } else if permission == "granted" {
          label = "APNs token registration requested"
        } else {
          label = "APNs token not ready"
        }
        self?.postLauncherTelemetry(
          type: "apns_token",
          label: label,
          status: status,
          payload: self?.deviceDiagnosticsPayload(permission: permission, reason: reason) ?? [:],
          result: tokenPresent ? nil : ["error": permission == "granted" ? "Waiting for APNs registration callback" : "Push permission is not granted"])
      }
    }
  }

  private func deviceDiagnosticsPayload(permission: String?, reason: String = "runtime") -> [String: Any] {
    [
      "platform": "ios",
      "reason": reason,
      "sdkDeviceId": BrazeManager.shared.braze?.deviceId ?? "",
      "externalId": BrazeManager.shared.activeExternalId,
      "push": [
        "permission": permission ?? UserDefaults.standard.string(forKey: PushDefaults.authorizationStatus) ?? "unknown",
        "tokenPresent": UserDefaults.standard.bool(forKey: PushDefaults.apnsTokenRegistered),
        "tokenLength": UserDefaults.standard.integer(forKey: PushDefaults.apnsTokenLength),
        "registrationError": UserDefaults.standard.string(forKey: PushDefaults.apnsRegistrationError) ?? "",
        "signedBuildRequired": true,
      ],
    ]
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

  /// Reload the web layer after a workspace change so it re-runs its handshake
  /// (attributes/events/CC refresh) against the freshly re-initialized SDK.
  private func reloadWeb() {
    webView.load(URLRequest(url: BrazeManager.shared.activeWebURL, cachePolicy: .reloadIgnoringLocalCacheData))
  }

  /// Called by AppDelegate when a REAL push arrives while the app is foreground —
  /// the web layer renders it as a branded in-app banner (active brand's logo).
  func deliverForegroundPush(title: String, body: String, uri: String?) {
    var payload: [String: Any] = ["title": title, "body": body]
    if let uri = uri { payload["uri"] = uri }
    send("push", payload: payload)
  }

  private func reportLoadFailure(_ error: Error) {
    print("[webview] load failed: \(error.localizedDescription)")
    sendConnection(loadError: error.localizedDescription)
  }

  private func sendConnection(loadError: String? = nil, sync: [String: Any]? = nil) {
    let braze = BrazeManager.shared
    var payload: [String: Any] = [
      "connected": braze.isConfigured,
      "label": braze.connectionLabel,
      "externalId": braze.activeExternalId,
      "sync": braze.syncEnvelope(authority: "native", reason: "default"),
      "setupNeeded": !braze.isConfigured,
      "runtime": braze.runtimePayload(),
      "sourceUrl": braze.activeWebURL.absoluteString,
      "sourceOverride": braze.sourceOverrideActive,
    ]
    if let sync { payload["sync"] = sync }
    if let loadError { payload["loadError"] = loadError }
    send("connection", payload: payload)
  }

  // MARK: - native → JS

  func send(_ action: String, payload: Any?) {
    var json = "null"
    if let payload, let data = try? JSONSerialization.data(withJSONObject: payload),
      let str = String(data: data, encoding: .utf8) {
      json = str
    }
    send(action, rawJSON: json)
  }

  func send(_ action: String, rawJSON: String) {
    let js = "window.__brazeBridge && window.__brazeBridge.receive(\"\(action)\", \(rawJSON));"
    webView.evaluateJavaScript(js, completionHandler: nil)
  }

  private func postLauncherTelemetry(
    type: String,
    label: String,
    status: String,
    externalId: String = BrazeManager.shared.activeExternalId,
    payload: Any = [:],
    result: Any? = nil,
    callbackUrl: String = ""
  ) {
    let target = callbackUrl.isEmpty ? Config.launcherCallbackUrl : callbackUrl
    guard !target.isEmpty, let url = URL(string: target) else { return }
    var body: [String: Any] = [
      "platform": "ios",
      "type": type,
      "label": label,
      "status": status,
      "externalId": externalId,
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

  private func jsonString(_ value: Any) -> String {
    guard JSONSerialization.isValidJSONObject([value]),
      let data = try? JSONSerialization.data(withJSONObject: [value]),
      let wrapped = String(data: data, encoding: .utf8)
    else { return "null" }
    return String(wrapped.dropFirst().dropLast())
  }

  private enum PushDefaults {
    static let authorizationStatus = "braze.demo.ios.pushAuthorizationStatus"
    static let apnsTokenRegistered = "braze.demo.ios.apnsTokenRegistered"
    static let apnsTokenLength = "braze.demo.ios.apnsTokenLength"
    static let apnsRegistrationError = "braze.demo.ios.apnsRegistrationError"
  }
}

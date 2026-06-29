import BrazeKit
import BrazeUI
import UIKit

/// Owns the Braze Swift SDK — the integration spine. The web UI never touches
/// Braze directly; it goes through the bridge → here. In-app messages render via
/// the SDK's native UI; push is real APNs; Content Cards are real CC data.
///
/// Credentials come from `CredentialStore` (UserDefaults). The web setup screen
/// manages profiles through the bridge; switching a profile re-initializes Braze.
final class BrazeManager {
  static let shared = BrazeManager()

  private(set) var braze: Braze?
  private var inAppMessageUI: BrazeInAppMessageUI?
  private var cardsSubscription: Braze.Cancellable?
  private var cardsById: [String: Braze.ContentCard] = [:]
  private let syncSessionId = UUID().uuidString
  private var lastIdentitySyncSignature = ""
  private var hasAppliedSdkIdentity = false
  private var currentSdkExternalId = ""

  /// Set by the web view controller to forward normalized cards to the web layer.
  var onContentCards: (([[String: Any]]) -> Void)?

  var isConfigured: Bool { braze != nil }
  var activeExternalId: String {
    currentSdkExternalId.isEmpty ? (CredentialStore.shared.activeProfile?.externalId ?? "") : currentSdkExternalId
  }

  /// The web demo URL for the active profile (falls back to the Config default).
  var activeWebURL: URL {
    if let s = CredentialStore.shared.activeProfile?.webURL, !s.isEmpty, let u = URL(string: s) {
      return u
    }
    return Config.webURL
  }

  var sourceOverrideActive: Bool {
    guard let s = CredentialStore.shared.activeProfile?.webURL else { return false }
    return !s.isEmpty
  }

  var connectionLabel: String {
    guard let p = CredentialStore.shared.activeProfile, braze != nil else {
      return "No workspace — open Setup"
    }
    return "\(p.name) · \(p.endpoint)"
  }

  /// Profiles serialized for the web setup screen.
  func profilesPayload() -> [[String: Any]] {
    let activeId = CredentialStore.shared.activeProfileId
    return CredentialStore.shared.profiles.map {
      [
        "id": $0.id, "name": $0.name, "apiKey": $0.apiKey, "endpoint": $0.endpoint,
        "externalId": $0.externalId, "webURL": $0.webURL, "active": $0.id == activeId,
      ]
    }
  }

  func runtimePayload() -> [String: Any] {
    [
      "schemaVersion": 1,
      "id": Config.demoPackId,
      "name": Config.demoPackName,
      "configHash": Config.demoConfigHash,
      "generatedAt": Config.demoGeneratedAt,
      "sourceMode": Config.demoSourceMode,
      "deviceId": braze?.deviceId ?? "",
      "externalId": activeExternalId,
      "pushPermission": UserDefaults.standard.string(forKey: "braze.demo.ios.pushAuthorizationStatus") ?? "unknown",
      "pushTokenPresent": UserDefaults.standard.bool(forKey: "braze.demo.ios.apnsTokenRegistered"),
      "expectedSources": [
        "browser": Config.browserWebURL,
        "android": Config.androidWebURL,
        "ios": Config.iosWebURL,
      ],
    ]
  }

  // MARK: - Lifecycle

  @MainActor
  func configure() {
    CredentialStore.shared.seedIfEmpty()
    if let profile = CredentialStore.shared.activeProfile {
      reinitialize(with: profile)
    } else {
      print("[BrazeManager] No saved workspace — waiting for setup via the web screen.")
    }
  }

  /// (Re)create the Braze instance for a profile. Tears down any previous one.
  @MainActor
  func reinitialize(with profile: CredentialProfile) {
    guard !profile.apiKey.isEmpty, !profile.endpoint.isEmpty else { return }
    cardsSubscription?.cancel()
    cardsSubscription = nil
    cardsById.removeAll()
    onContentCards?([])
    currentSdkExternalId = ""

    let configuration = Braze.Configuration(apiKey: profile.apiKey, endpoint: profile.endpoint)
    configuration.logger.level = .info
    let braze = Braze(configuration: configuration)
    self.braze = braze

    let iam = BrazeInAppMessageUI()
    braze.inAppMessagePresenter = iam
    self.inAppMessageUI = iam

    cardsSubscription = braze.contentCards.subscribeToUpdates { [weak self] cards in
      self?.handleCards(cards)
    }

    lastIdentitySyncSignature = ""
    hasAppliedSdkIdentity = false
    // Native owns the demo identity.
    if !profile.externalId.isEmpty {
      changeUser(profile.externalId, sync: syncEnvelope(authority: "native", reason: "profile_select"))
    }
    braze.requestImmediateDataFlush()
    print("[BrazeManager] Configured for \(profile.endpoint) (user \(profile.externalId)).")
  }

  /// Save/update a profile, make it active, and re-init. Returns updated profiles.
  @MainActor
  func saveProfile(_ profile: CredentialProfile) {
    let saved = CredentialStore.shared.save(profile)
    reinitialize(with: saved)
  }

  @MainActor
  func selectProfile(id: String) {
    CredentialStore.shared.select(id: id)
    if let p = CredentialStore.shared.activeProfile { reinitialize(with: p) }
  }

  // MARK: - User

  func changeUser(
    _ externalId: String,
    sync: [String: Any]? = nil,
    authority: String = "native",
    reason: String = "manual"
  ) {
    let id = externalId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !id.isEmpty else { return }
    let syncPayload = sync ?? syncEnvelope(authority: authority, reason: reason)
    let signature = identitySyncSignature(externalId: id, sync: syncPayload)
    if hasAppliedSdkIdentity && signature == lastIdentitySyncSignature { return }

    braze?.changeUser(userId: id)
    if id != currentSdkExternalId {
      cardsById.removeAll()
      onContentCards?([])
    }
    currentSdkExternalId = id
    lastIdentitySyncSignature = signature
    hasAppliedSdkIdentity = true
    braze?.requestImmediateDataFlush()
  }

  func syncEnvelope(authority: String, reason: String) -> [String: Any] {
    [
      "protocol": "braze-demo-sync/v1",
      "sessionId": syncSessionId,
      "runtimeId": Config.demoPackId,
      "configHash": Config.demoConfigHash,
      "authority": authority,
      "reason": reason,
      "timestamp": Int(Date().timeIntervalSince1970 * 1000),
    ]
  }

  private func identitySyncSignature(externalId: String, sync: [String: Any]) -> String {
    [
      externalId,
      sync["protocol"] as? String ?? "braze-demo-sync/v1",
      sync["sessionId"] as? String ?? syncSessionId,
      sync["runtimeId"] as? String ?? Config.demoPackId,
      sync["configHash"] as? String ?? Config.demoConfigHash,
      sync["authority"] as? String ?? "",
      sync["reason"] as? String ?? "",
    ].joined(separator: "|")
  }

  func setCustomAttribute(key: String, value: Any) {
    guard let user = braze?.user else { return }
    if let num = value as? NSNumber {
      if CFGetTypeID(num) == CFBooleanGetTypeID() {
        user.setCustomAttribute(key: key, value: num.boolValue)
      } else if CFNumberIsFloatType(num as CFNumber) {
        user.setCustomAttribute(key: key, value: num.doubleValue)
      } else {
        user.setCustomAttribute(key: key, value: num.intValue)
      }
    } else if let str = value as? String {
      user.setCustomAttribute(key: key, value: str)
    } else if let arr = value as? [String] {
      user.setCustomAttribute(key: key, array: arr)
    }
    braze?.requestImmediateDataFlush()
  }

  // MARK: - Events

  func logCustomEvent(_ name: String, properties: [String: Any]?) {
    braze?.logCustomEvent(name: name, properties: properties)
    braze?.requestImmediateDataFlush()
  }

  func logPurchase(productId: String, price: Double, currency: String, quantity: Int, properties: [String: Any]?) {
    braze?.logPurchase(
      productId: productId, currency: currency, price: price, quantity: quantity, properties: properties)
    braze?.requestImmediateDataFlush()
  }

  // MARK: - Content Cards

  func requestContentCardsRefresh() {
    braze?.contentCards.requestRefresh { _ in }
  }

  func logImpression(cardId: String) {
    guard let braze, let card = cardsById[cardId] else { return }
    card.logImpression(using: braze)
  }

  func logClick(cardId: String) {
    guard let braze, let card = cardsById[cardId] else { return }
    card.logClick(using: braze)
  }

  private func handleCards(_ cards: [Braze.ContentCard]) {
    cardsById.removeAll()
    var out: [[String: Any]] = []
    for card in cards where card.control == nil && !card.removed {
      let data = card.data
      let extras = stringExtras(data.extras)
      var dict: [String: Any] = [
        "id": data.id,
        "title": card.title ?? "",
        "extras": extras,
        "placement": extras["placement"] ?? "inbox",
      ]
      if let desc = card.description { dict["description"] = desc }
      if let img = card.imageURL?.absoluteString { dict["imageUrl"] = img }
      if case let .some(.url(url, _)) = card.clickAction { dict["url"] = url.absoluteString }
      cardsById[data.id] = card
      out.append(dict)
    }
    onContentCards?(out)
  }

  /// Braze extras are typed `[String: Any]`; stringify so they are JSON-safe and
  /// match the web NormalizedCard's `extras: Record<string, string>`.
  private func stringExtras(_ extras: [String: Any]) -> [String: String] {
    var out: [String: String] = [:]
    for (key, value) in extras { out[key] = "\(value)" }
    return out
  }
}

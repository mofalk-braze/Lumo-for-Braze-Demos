import BrazeKit
import BrazeUI
import UIKit

/// Owns the Braze Swift SDK — the integration spine. The web UI never touches
/// Braze directly; it goes through the bridge → here. In-app messages render via
/// the SDK's native UI; push is real APNs; Content Cards are real CC data.
///
/// Credentials come from `CredentialStore` (UserDefaults). The web setup screen
/// manages profiles through the bridge; switching a profile re-initializes Braze.
final class BrazeManager: BrazeDelegate {
  static let shared = BrazeManager()

  private(set) var braze: Braze?
  private var inAppMessageUI: BrazeInAppMessageUI?
  private var cardsSubscription: Braze.Cancellable?
  private var cardsById: [String: Braze.ContentCard] = [:]
  private var contentCards: [Braze.ContentCard] = []
  private let syncSessionId = UUID().uuidString
  private var lastIdentitySyncSignature = ""
  private var hasAppliedSdkIdentity = false
  private var currentSdkExternalId = ""
  private var configuredProfileId: String?
  private(set) var activeDisplayName = UserDefaults.standard.string(forKey: "braze.demo.activeDisplayName") ?? ""

  /// Set by the web view controller to forward normalized cards to the web layer.
  var onContentCards: (([[String: Any]]) -> Void)?
  /// Gives the product shell first refusal on Braze URL actions. Returning true
  /// means the app handled the route and Braze should not open it externally.
  var onOpenURL: ((Braze.URLContext) -> Bool)?

  var isConfigured: Bool {
    guard braze != nil,
      let activeProfileId = CredentialStore.shared.activeProfile?.id
    else { return false }
    return configuredProfileId == activeProfileId
  }
  var activeExternalId: String {
    if !currentSdkExternalId.isEmpty { return currentSdkExternalId }
    guard let profile = CredentialStore.shared.activeProfile else { return "" }
    let remembered = rememberedExternalId(for: profile)
    return remembered.isEmpty ? profile.externalId : remembered
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
    guard let p = CredentialStore.shared.activeProfile, isConfigured else {
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
      "schemaVersion": 2,
      "id": Config.demoPackId,
      "name": Config.demoPackName,
      "configHash": Config.demoConfigHash,
      "runtimeHashVersion": 2,
      "runtimeHash": Config.demoRuntimeHash,
      "generatedAt": Config.demoGeneratedAt,
      "sourceMode": Config.demoSourceMode,
      "sdkConfigured": isConfigured,
      "sdkCredentialContextFingerprint": CredentialStore.shared.activeSdkCredentialContextFingerprint,
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
    if CredentialStore.shared.reconcileGeneratedSeed() {
      clearRememberedIdentity()
    }
    if let profile = CredentialStore.shared.activeProfile {
      reinitialize(with: profile)
    } else {
      print("[BrazeManager] No saved workspace — waiting for setup via the web screen.")
    }
  }

  /// (Re)create the Braze instance for a profile. Tears down any previous one.
  @MainActor
  func reinitialize(with profile: CredentialProfile) {
    cardsSubscription?.cancel()
    cardsSubscription = nil
    cardsById.removeAll()
    contentCards.removeAll()
    onContentCards?([])
    braze = nil
    inAppMessageUI = nil
    configuredProfileId = nil
    currentSdkExternalId = ""
    hasAppliedSdkIdentity = false
    lastIdentitySyncSignature = ""
    guard !profile.apiKey.isEmpty, !profile.endpoint.isEmpty else { return }

    let configuration = Braze.Configuration(apiKey: profile.apiKey, endpoint: profile.endpoint)
    configuration.logger.level = .info
    configuration.sessionTimeout = TimeInterval(Config.sessionTimeoutSeconds)
    configuration.triggerMinimumTimeInterval = TimeInterval(Config.triggerMinimumTimeIntervalSeconds)
    let braze = Braze(configuration: configuration)
    braze.delegate = self
    self.braze = braze
    configuredProfileId = profile.id

    let iam = BrazeInAppMessageUI()
    braze.inAppMessagePresenter = iam
    self.inAppMessageUI = iam

    cardsSubscription = braze.contentCards.subscribeToUpdates { [weak self] cards in
      self?.handleCards(cards)
    }

    // Native owns the demo identity. A remembered identity for this profile wins over its seed.
    let startupExternalId = rememberedExternalId(for: profile).isEmpty
      ? profile.externalId
      : rememberedExternalId(for: profile)
    if !startupExternalId.isEmpty {
      changeUser(startupExternalId, sync: syncEnvelope(authority: "native", reason: "profile_select"))
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
    displayName: String? = nil,
    authority: String = "native",
    reason: String = "manual"
  ) {
    let id = externalId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !id.isEmpty else { return }
    if let displayName {
      activeDisplayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
      UserDefaults.standard.set(activeDisplayName, forKey: "braze.demo.activeDisplayName")
    }
    let syncPayload = sync ?? syncEnvelope(authority: authority, reason: reason)
    let signature = identitySyncSignature(externalId: id, sync: syncPayload)
    if hasAppliedSdkIdentity && signature == lastIdentitySyncSignature { return }

    braze?.changeUser(userId: id)
    if id != currentSdkExternalId {
      cardsById.removeAll()
      contentCards.removeAll()
      onContentCards?([])
    }
    currentSdkExternalId = id
    rememberAppliedIdentity(id)
    lastIdentitySyncSignature = signature
    hasAppliedSdkIdentity = true
    braze?.requestImmediateDataFlush()
  }

  /// Remembers the last applied identity against the profile it belongs to, so relaunching keeps
  /// the operator's chosen persona instead of snapping back to the Config.swift seed. Scoping it
  /// to the profile id means switching or reseeding a profile still starts on that profile's user.
  private func rememberAppliedIdentity(_ externalId: String) {
    guard let profileId = CredentialStore.shared.activeProfile?.id else { return }
    UserDefaults.standard.set(externalId, forKey: Self.rememberedExternalIdKey)
    UserDefaults.standard.set(profileId, forKey: Self.rememberedProfileIdKey)
  }

  private func rememberedExternalId(for profile: CredentialProfile) -> String {
    guard UserDefaults.standard.string(forKey: Self.rememberedProfileIdKey) == profile.id else { return "" }
    return UserDefaults.standard.string(forKey: Self.rememberedExternalIdKey) ?? ""
  }

  private func clearRememberedIdentity() {
    UserDefaults.standard.removeObject(forKey: Self.rememberedExternalIdKey)
    UserDefaults.standard.removeObject(forKey: Self.rememberedProfileIdKey)
  }

  private static let rememberedExternalIdKey = "braze.demo.activeExternalId"
  private static let rememberedProfileIdKey = "braze.demo.activeExternalIdProfileId"

  func syncEnvelope(authority: String, reason: String) -> [String: Any] {
    [
      "protocol": "braze-demo-sync/v1",
      "sessionId": syncSessionId,
      "runtimeId": Config.demoPackId,
      "configHash": Config.demoConfigHash,
      "runtimeHash": Config.demoRuntimeHash,
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
      sync["runtimeHash"] as? String ?? Config.demoRuntimeHash,
      sync["authority"] as? String ?? "",
      sync["reason"] as? String ?? "",
    ].joined(separator: "|")
  }

  func setCustomAttribute(key: String, value: Any) {
    guard let user = braze?.user else { return }
    if value is NSNull {
      user.unsetCustomAttribute(key: key)
    } else if let num = value as? NSNumber {
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
    } else if let arr = value as? [[String: Any]] {
      let nested = arr.map { dictionary in
        Dictionary(uniqueKeysWithValues: dictionary.map { ($0.key, Optional($0.value)) })
      }
      user.setCustomAttribute(key: key, array: nested)
    } else if let dictionary = value as? [String: Any] {
      let nested = Dictionary(uniqueKeysWithValues: dictionary.map { ($0.key, Optional($0.value)) })
      user.setCustomAttribute(key: key, dictionary: nested)
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

  // MARK: - URL routing

  @MainActor
  func braze(_ braze: Braze, shouldOpenURL context: Braze.URLContext) -> Bool {
    // Braze owns click analytics before this delegate decision. Returning false
    // only suppresses the default external URL opener for routes handled in-app.
    return !(onOpenURL?(context) ?? false)
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

  func dismissContentCard(cardId: String) -> Bool {
    guard let card = cardsById[cardId] else { return false }
    card.context?.logDismissed()
    contentCards.removeAll { $0.data.id == cardId }
    cardsById.removeValue(forKey: cardId)
    onContentCards?(normalizeCards(contentCards))
    braze?.requestImmediateDataFlush()
    return true
  }

  private func handleCards(_ cards: [Braze.ContentCard]) {
    contentCards = cards.filter { $0.control == nil && !$0.removed }
    onContentCards?(normalizeCards(contentCards))
  }

  private func normalizeCards(_ cards: [Braze.ContentCard]) -> [[String: Any]] {
    cardsById.removeAll()
    var out: [[String: Any]] = []
    for card in cards {
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
    return out
  }

  /// Braze extras are typed `[String: Any]`; stringify so they are JSON-safe and
  /// match the web NormalizedCard's `extras: Record<string, string>`.
  private func stringExtras(_ extras: [String: Any]) -> [String: String] {
    var out: [String: String] = [:]
    for (key, value) in extras { out[key] = "\(value)" }
    return out
  }
}

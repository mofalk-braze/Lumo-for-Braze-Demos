import CryptoKit
import Foundation

/// A saved Braze workspace credential profile. `externalId` is authoritative for
/// `changeUser` — native owns the demo user identity.
struct CredentialProfile: Codable, Equatable {
  var id: String
  var name: String
  var apiKey: String
  var endpoint: String
  var externalId: String
  /// Explicit web source override. Leave empty for the generated runtime source.
  var webURL: String

  init(
    id: String = UUID().uuidString, name: String, apiKey: String, endpoint: String,
    externalId: String, webURL: String
  ) {
    self.id = id
    self.name = name
    self.apiKey = apiKey
    self.endpoint = endpoint
    self.externalId = externalId
    self.webURL = webURL
  }

  // Tolerate profiles saved before `webURL` existed (defaults to "").
  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    name = try c.decode(String.self, forKey: .name)
    apiKey = try c.decode(String.self, forKey: .apiKey)
    endpoint = try c.decode(String.self, forKey: .endpoint)
    externalId = try c.decode(String.self, forKey: .externalId)
    webURL = Self.normalizeWebURL((try? c.decode(String.self, forKey: .webURL)) ?? "")
  }

  static func normalizeWebURL(_ value: String) -> String {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return "" }
    guard let url = URL(string: trimmed), url.scheme == "http" else { return "" }
    let host = url.host ?? ""
    return ["localhost", "127.0.0.1"].contains(host) ? trimmed : ""
  }
}

/// The generated, pack-owned workspace seed compiled through the ignored
/// `Config.swift`. Its stored marker is a one-way fingerprint, never a second
/// copy of the SDK credentials.
struct GeneratedCredentialSeed: Equatable {
  let packId: String
  let packName: String
  let configHash: String
  let apiKey: String
  let endpoint: String
  let externalId: String

  static var current: GeneratedCredentialSeed {
    GeneratedCredentialSeed(
      packId: Config.demoPackId,
      packName: Config.demoPackName,
      configHash: Config.demoConfigHash,
      apiKey: Config.brazeAPIKey,
      endpoint: Config.brazeEndpoint,
      externalId: Config.demoExternalId)
  }

  var profileId: String {
    "generated:\(normalizedPackId)"
  }

  var profile: CredentialProfile? {
    let key = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
    let sdkEndpoint = endpoint.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !key.isEmpty, !sdkEndpoint.isEmpty else { return nil }
    return CredentialProfile(
      id: profileId,
      name: packName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        ? "Generated workspace"
        : packName.trimmingCharacters(in: .whitespacesAndNewlines),
      apiKey: key,
      endpoint: sdkEndpoint,
      externalId: externalId.trimmingCharacters(in: .whitespacesAndNewlines),
      webURL: "")
  }

  /// Changes when the generated workspace context changes, while revealing no
  /// API key or endpoint in UserDefaults diagnostics or exported state.
  var fingerprint: String {
    let parts = [
      "ios-generated-credential-seed/v1",
      normalizedPackId,
      configHash.trimmingCharacters(in: .whitespacesAndNewlines),
      apiKey.trimmingCharacters(in: .whitespacesAndNewlines),
      endpoint.trimmingCharacters(in: .whitespacesAndNewlines),
      externalId.trimmingCharacters(in: .whitespacesAndNewlines),
    ]
    let digest = SHA256.hash(data: Data(parts.joined(separator: "\u{0}").utf8))
    return digest.map { String(format: "%02x", $0) }.joined()
  }

  /// Safe runtime proof that the selected SDK credentials belong to this
  /// generated pack context. The plaintext key and endpoint never leave native.
  func sdkCredentialContextFingerprint(profile: CredentialProfile?) -> String {
    guard let profile else { return "" }
    let key = profile.apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
    let sdkEndpoint = profile.endpoint.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !key.isEmpty, !sdkEndpoint.isEmpty else { return "" }
    let parts = [
      "ios-sdk-credential-context/v1",
      normalizedPackId,
      configHash.trimmingCharacters(in: .whitespacesAndNewlines),
      key,
      sdkEndpoint,
    ]
    let digest = SHA256.hash(data: Data(parts.joined(separator: "\u{0}").utf8))
    return digest.map { String(format: "%02x", $0) }.joined()
  }

  private var normalizedPackId: String {
    let value = packId.trimmingCharacters(in: .whitespacesAndNewlines)
    return value.isEmpty ? "default" : value
  }
}

/// UserDefaults-backed list of credential profiles + the active selection. This is
/// the canonical credential store (the Swift SDK needs creds at init). The web
/// setup screen reads/writes it through the bridge. Survives app relaunches.
final class CredentialStore {
  static let shared = CredentialStore()

  private let profilesKey = "braze.demo.profiles"
  private let activeKey = "braze.demo.activeProfileId"
  private let generatedSeedFingerprintKey = "braze.demo.generatedSeedFingerprint"
  private let defaults: UserDefaults

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  var activeSdkCredentialContextFingerprint: String {
    GeneratedCredentialSeed.current.sdkCredentialContextFingerprint(profile: activeProfile)
  }

  var profiles: [CredentialProfile] {
    get {
      guard let data = defaults.data(forKey: profilesKey),
        let list = try? JSONDecoder().decode([CredentialProfile].self, from: data)
      else { return [] }
      return list
    }
    set {
      defaults.set(try? JSONEncoder().encode(newValue), forKey: profilesKey)
    }
  }

  var activeProfileId: String? {
    get { defaults.string(forKey: activeKey) }
    set {
      if let newValue {
        defaults.set(newValue, forKey: activeKey)
      } else {
        defaults.removeObject(forKey: activeKey)
      }
    }
  }

  var activeProfile: CredentialProfile? {
    guard let id = activeProfileId else { return nil }
    return profiles.first { $0.id == id }
  }

  /// Insert or update a profile (matched by id) and make it active.
  @discardableResult
  func save(_ profile: CredentialProfile) -> CredentialProfile {
    var profile = profile
    profile.webURL = CredentialProfile.normalizeWebURL(profile.webURL)
    var list = profiles
    if let idx = list.firstIndex(where: { $0.id == profile.id }) {
      list[idx] = profile
    } else {
      list.append(profile)
    }
    profiles = list
    activeProfileId = profile.id
    return profile
  }

  func select(id: String) {
    guard profiles.contains(where: { $0.id == id }) else { return }
    activeProfileId = id
  }

  /// Reconcile the compiled/generated workspace without erasing user-created
  /// profiles. A changed generated context takes over predictably. A changed
  /// context with no complete generated credentials clears the implicit active
  /// selection, so the current runtime cannot silently use a prior workspace;
  /// the operator may then explicitly select a saved profile.
  ///
  /// Returns true when the active workspace changed or was cleared.
  @discardableResult
  func reconcileGeneratedSeed(_ seed: GeneratedCredentialSeed = .current) -> Bool {
    let fingerprint = seed.fingerprint
    let previousFingerprint = defaults.string(forKey: generatedSeedFingerprintKey)
    var list = profiles
    let generatedProfile = seed.profile

    if let generatedProfile {
      let existingIndex =
        list.firstIndex(where: { $0.id == generatedProfile.id })
        ?? list.firstIndex(where: {
          $0.name == Self.legacyGeneratedSeedName
            && $0.apiKey == generatedProfile.apiKey
            && $0.endpoint == generatedProfile.endpoint
        })
      if let existingIndex {
        list[existingIndex] = generatedProfile
      } else {
        list.append(generatedProfile)
      }
      profiles = list
    }

    let activeId = activeProfileId
    let activeStillExists = activeId.map { id in list.contains(where: { $0.id == id }) } ?? false
    let generatedContextChanged = previousFingerprint != fingerprint
    var activeWorkspaceChanged = false

    if generatedContextChanged {
      activeProfileId = generatedProfile?.id
      activeWorkspaceChanged = true
    } else if !activeStillExists, let generatedProfile {
      activeProfileId = generatedProfile.id
      activeWorkspaceChanged = true
    } else if !activeStillExists {
      activeProfileId = nil
    }

    defaults.set(fingerprint, forKey: generatedSeedFingerprintKey)
    return activeWorkspaceChanged
  }

  /// JSON for export (web setup screen offers download/copy).
  func exportJSON() -> String {
    guard let data = try? JSONEncoder().encode(profiles),
      let str = String(data: data, encoding: .utf8)
    else { return "[]" }
    return str
  }

  func importJSON(_ json: String) {
    guard let data = json.data(using: .utf8),
      let list = try? JSONDecoder().decode([CredentialProfile].self, from: data)
    else { return }
    profiles = list
    if activeProfileId.map({ id in list.contains(where: { $0.id == id }) }) != true {
      activeProfileId = list.first?.id
    }
  }

  private static let legacyGeneratedSeedName = "Seed (Config.swift)"
}

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

/// UserDefaults-backed list of credential profiles + the active selection. This is
/// the canonical credential store (the Swift SDK needs creds at init). The web
/// setup screen reads/writes it through the bridge. Survives app relaunches.
final class CredentialStore {
  static let shared = CredentialStore()

  private let profilesKey = "braze.demo.profiles"
  private let activeKey = "braze.demo.activeProfileId"
  private let defaults = UserDefaults.standard

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
    set { defaults.set(newValue, forKey: activeKey) }
  }

  var activeProfile: CredentialProfile? {
    guard let id = activeProfileId else { return profiles.first }
    return profiles.first { $0.id == id } ?? profiles.first
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

  /// Seed from Config.swift on first run if no profiles exist yet (dev convenience).
  func seedIfEmpty() {
    guard profiles.isEmpty, !Config.brazeAPIKey.isEmpty, !Config.brazeEndpoint.isEmpty else { return }
    save(
      CredentialProfile(
        name: "Seed (Config.swift)",
        apiKey: Config.brazeAPIKey,
        endpoint: Config.brazeEndpoint,
        externalId: Config.demoExternalId,
        webURL: ""))
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
    if activeProfileId == nil { activeProfileId = list.first?.id }
  }
}

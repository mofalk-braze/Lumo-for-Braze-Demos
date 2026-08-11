import Foundation

// The production source reads these generated values through Config. Tests pass
// explicit seeds, so this stub contains only safe, non-authorizing defaults.
enum Config {
  static let demoPackId = "test-default"
  static let demoPackName = "Test default"
  static let demoConfigHash = "test-config"
  static let brazeAPIKey = ""
  static let brazeEndpoint = ""
  static let demoExternalId = "test-user"
}

enum TestFailure: Error, CustomStringConvertible {
  case assertion(String)

  var description: String {
    switch self {
    case .assertion(let message): return message
    }
  }
}

private func expect(_ condition: @autoclosure () -> Bool, _ message: String) throws {
  guard condition() else { throw TestFailure.assertion(message) }
}

private func seed(
  packId: String,
  configHash: String,
  apiKey: String,
  endpoint: String,
  externalId: String = "seed-user"
) -> GeneratedCredentialSeed {
  GeneratedCredentialSeed(
    packId: packId,
    packName: "Generated \(packId)",
    configHash: configHash,
    apiKey: apiKey,
    endpoint: endpoint,
    externalId: externalId)
}

private func withStore(_ body: (CredentialStore) throws -> Void) throws {
  let suite = "braze.demo.credential-tests.\(UUID().uuidString)"
  guard let defaults = UserDefaults(suiteName: suite) else {
    throw TestFailure.assertion("Could not create isolated UserDefaults suite")
  }
  defaults.removePersistentDomain(forName: suite)
  defer { defaults.removePersistentDomain(forName: suite) }
  try body(CredentialStore(defaults: defaults))
}

private func testGeneratedSeedTakeoverAndPreservation() throws {
  try withStore { store in
    let first = seed(
      packId: "pack-a", configHash: "config-a", apiKey: "sdk-a", endpoint: "endpoint-a")
    try expect(store.reconcileGeneratedSeed(first), "First generated seed should become active")
    try expect(store.activeProfileId == "generated:pack-a", "Generated id should be deterministic")

    let custom = CredentialProfile(
      id: "custom", name: "Custom", apiKey: "sdk-custom", endpoint: "endpoint-custom",
      externalId: "custom-user", webURL: "")
    store.save(custom)
    try expect(
      !store.reconcileGeneratedSeed(first), "Unchanged seed should preserve explicit selection")
    try expect(
      store.activeProfileId == custom.id, "Unchanged seed replaced a selected custom profile")

    let changedCredentials = seed(
      packId: "pack-a", configHash: "config-b", apiKey: "sdk-b", endpoint: "endpoint-b")
    try expect(
      store.reconcileGeneratedSeed(changedCredentials),
      "Changed generated credentials should take over the active workspace")
    try expect(
      store.activeProfileId == "generated:pack-a", "Changed same-pack seed was not selected")
    try expect(store.profiles.count == 2, "Same-pack seed update duplicated or erased a profile")
    try expect(
      store.profiles.first(where: { $0.id == "generated:pack-a" })?.apiKey == "sdk-b",
      "Same-pack generated profile was not updated")
    try expect(store.profiles.contains(custom), "Generated seed update erased a custom profile")

    let nextPack = seed(
      packId: "pack-b", configHash: "config-c", apiKey: "sdk-c", endpoint: "endpoint-c")
    try expect(store.reconcileGeneratedSeed(nextPack), "New pack seed should take over")
    try expect(store.activeProfileId == "generated:pack-b", "New pack seed was not selected")
    try expect(store.profiles.count == 3, "New pack seed should preserve prior profiles")
    try expect(store.profiles.contains(custom), "New pack seed erased a custom profile")
  }
}

private func testMissingGeneratedCredentialsFailClosed() throws {
  try withStore { store in
    let configured = seed(
      packId: "pack-a", configHash: "config-a", apiKey: "sdk-a", endpoint: "endpoint-a")
    _ = store.reconcileGeneratedSeed(configured)
    let custom = CredentialProfile(
      id: "custom", name: "Custom", apiKey: "sdk-custom", endpoint: "endpoint-custom",
      externalId: "custom-user", webURL: "")
    store.save(custom)
    let profileCount = store.profiles.count

    let unconfigured = seed(
      packId: "pack-b", configHash: "config-b", apiKey: "", endpoint: "")
    try expect(
      store.reconcileGeneratedSeed(unconfigured),
      "Changed context without generated credentials should clear the implicit workspace")
    try expect(
      store.activeProfileId == nil, "Prior workspace remained active for a new unconfigured pack")
    try expect(store.activeProfile == nil, "Active profile must not fall back implicitly")
    try expect(store.profiles.count == profileCount, "Fail-closed migration erased saved profiles")

    store.select(id: custom.id)
    try expect(
      !store.reconcileGeneratedSeed(unconfigured),
      "Unchanged context should preserve an explicit operator selection")
    try expect(
      store.activeProfileId == custom.id, "Explicit saved-profile selection was not preserved")
  }
}

private func testLegacyGeneratedSeedMigration() throws {
  try withStore { store in
    let legacy = CredentialProfile(
      id: "legacy-random-id", name: "Seed (Config.swift)", apiKey: "sdk-a",
      endpoint: "endpoint-a", externalId: "seed-user", webURL: "")
    let custom = CredentialProfile(
      id: "custom", name: "Custom", apiKey: "sdk-custom", endpoint: "endpoint-custom",
      externalId: "custom-user", webURL: "")
    store.profiles = [legacy, custom]
    store.activeProfileId = legacy.id

    let generated = seed(
      packId: "pack-a", configHash: "config-a", apiKey: "sdk-a", endpoint: "endpoint-a")
    try expect(
      store.reconcileGeneratedSeed(generated), "Legacy generated seed should migrate and activate")
    try expect(
      store.activeProfileId == "generated:pack-a", "Legacy seed did not get deterministic id")
    try expect(store.profiles.count == 2, "Legacy migration duplicated or erased a profile")
    try expect(
      !store.profiles.contains(where: { $0.id == legacy.id }), "Legacy random id survived migration"
    )
    try expect(store.profiles.contains(custom), "Legacy migration erased a custom profile")
  }
}

private func testFingerprintIsOneWayAndStable() throws {
  let generated = seed(
    packId: "pack-a", configHash: "config-a", apiKey: "sdk-sensitive",
    endpoint: "endpoint-sensitive")
  let fingerprint = generated.fingerprint
  try expect(fingerprint.count == 64, "Seed fingerprint should be a SHA-256 hex digest")
  try expect(
    fingerprint.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil,
    "Seed fingerprint contains unexpected characters")
  try expect(!fingerprint.contains("sdk-sensitive"), "Fingerprint exposed the SDK key")
  try expect(!fingerprint.contains("endpoint-sensitive"), "Fingerprint exposed the endpoint")
  try expect(fingerprint == generated.fingerprint, "Seed fingerprint should be deterministic")
  try expect(
    fingerprint
      != seed(
        packId: "pack-a", configHash: "config-a", apiKey: "sdk-other",
        endpoint: "endpoint-sensitive"
      ).fingerprint,
    "Credential change did not change the seed fingerprint")
}

private func testSdkCredentialContextFingerprintIsSafeAndWorkspaceBound() throws {
  let generated = seed(
    packId: "pack-a", configHash: "config-a", apiKey: "sdk-seed",
    endpoint: "endpoint-seed")
  let selected = CredentialProfile(
    id: "selected", name: "Selected", apiKey: "sdk-selected",
    endpoint: "endpoint-selected", externalId: "user", webURL: "")
  let fingerprint = generated.sdkCredentialContextFingerprint(profile: selected)

  try expect(fingerprint.count == 64, "SDK context fingerprint should be SHA-256 hex")
  try expect(
    fingerprint == "a2c8eecc73793179d31d794c18702ec3e8e18eb8921368c3c2ef0c1a261f8e41",
    "SDK context fingerprint drifted from the launcher contract")
  try expect(!fingerprint.contains("sdk-selected"), "SDK context fingerprint exposed the API key")
  try expect(!fingerprint.contains("endpoint-selected"), "SDK context fingerprint exposed the endpoint")
  try expect(
    fingerprint == generated.sdkCredentialContextFingerprint(profile: selected),
    "SDK context fingerprint should be deterministic")
  try expect(
    fingerprint != generated.sdkCredentialContextFingerprint(
      profile: CredentialProfile(
        id: selected.id, name: selected.name, apiKey: "sdk-other",
        endpoint: selected.endpoint, externalId: selected.externalId, webURL: "")),
    "A selected SDK workspace change did not change the context fingerprint")
  try expect(
    generated.sdkCredentialContextFingerprint(profile: nil).isEmpty,
    "Missing selected profile should not produce SDK context attestation")
}

@main
struct CredentialStoreTestRunner {
  static func main() throws {
    try testGeneratedSeedTakeoverAndPreservation()
    try testMissingGeneratedCredentialsFailClosed()
    try testLegacyGeneratedSeedMigration()
    try testFingerprintIsOneWayAndStable()
    try testSdkCredentialContextFingerprintIsSafeAndWorkspaceBound()
    print("CredentialStore tests passed.")
  }
}

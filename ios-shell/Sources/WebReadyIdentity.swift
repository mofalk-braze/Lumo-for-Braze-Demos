import Foundation

struct WebReadyIdentity {
  let protocolName: String
  let runtimeId: String
  let configHash: String
  let runtimeHash: String
}

struct IosRenderCorrelation: Equatable {
  let launcherInstanceId: String
  let executionId: String
  let callbackURL: String

  init?(launcherInstanceId: String, executionId: String, callbackURL: String) {
    let launcher = launcherInstanceId.trimmingCharacters(in: .whitespacesAndNewlines)
    let execution = executionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !launcher.isEmpty, !execution.isEmpty else { return nil }
    self.launcherInstanceId = launcher
    self.executionId = execution
    self.callbackURL = callbackURL.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  func attaching(to sync: [String: Any]?) -> [String: Any] {
    var attached = sync ?? [:]
    attached["launcherInstanceId"] = launcherInstanceId
    attached["executionId"] = executionId
    return attached
  }
}

/// Holds one launcher preparation until a terminal render result for the
/// navigation generation started by that preparation. Unbound or superseded
/// generations cannot borrow the correlation.
struct PendingIosRenderTransition {
  private(set) var correlation: IosRenderCorrelation?
  private(set) var generation: Int?

  mutating func begin(_ next: IosRenderCorrelation) {
    correlation = next
    generation = nil
  }

  mutating func bind(to generation: Int) {
    guard correlation != nil else { return }
    self.generation = generation
  }

  mutating func finish(generation: Int) -> IosRenderCorrelation? {
    guard self.generation == generation, let correlation else { return nil }
    self.correlation = nil
    self.generation = nil
    return correlation
  }
}

/// Binds JavaScript render proof to the native shell's generated runtime.
/// URL agreement alone cannot detect a stale web bundle at the same origin.
func webReadyIdentityRejection(
  reported sync: [String: Any]?,
  expected: WebReadyIdentity
) -> String? {
  let expectedFields = [
    ("protocol", expected.protocolName),
    ("runtimeId", expected.runtimeId),
    ("configHash", expected.configHash),
    ("runtimeHash", expected.runtimeHash),
  ]
  let missingExpected = expectedFields.filter { $0.1.isEmpty }.map(\.0)
  if !missingExpected.isEmpty {
    return "Native runtime identity is unavailable: \(missingExpected.joined(separator: ", "))."
  }
  guard let sync else { return "webReady sync identity is missing." }

  let reportedFields = [
    ("protocol", sync["protocol"] as? String ?? ""),
    ("runtimeId", sync["runtimeId"] as? String ?? ""),
    ("configHash", sync["configHash"] as? String ?? ""),
    ("runtimeHash", sync["runtimeHash"] as? String ?? ""),
  ]
  let missingReported = reportedFields.filter { $0.1.isEmpty }.map(\.0)
  if !missingReported.isEmpty {
    return "webReady sync identity is incomplete: \(missingReported.joined(separator: ", "))."
  }
  let mismatched = zip(reportedFields, expectedFields)
    .compactMap { reported, expected in reported.1 == expected.1 ? nil : expected.0 }
  if !mismatched.isEmpty {
    return "webReady sync identity does not match the native runtime: \(mismatched.joined(separator: ", "))."
  }
  return nil
}

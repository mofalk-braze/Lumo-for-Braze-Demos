import Foundation

enum WebReadyTestFailure: Error, CustomStringConvertible {
  case assertion(String)

  var description: String {
    switch self {
    case .assertion(let message): return message
    }
  }
}

private func expect(_ condition: @autoclosure () -> Bool, _ message: String) throws {
  guard condition() else { throw WebReadyTestFailure.assertion(message) }
}

private let expected = WebReadyIdentity(
  protocolName: "braze-demo-sync/v1",
  runtimeId: "lumo-default",
  configHash: "config-hash",
  runtimeHash: "runtime-hash")

private let matching: [String: Any] = [
  "protocol": "braze-demo-sync/v1",
  "runtimeId": "lumo-default",
  "configHash": "config-hash",
  "runtimeHash": "runtime-hash",
]

private func testMatchingIdentity() throws {
  try expect(
    webReadyIdentityRejection(reported: matching, expected: expected) == nil,
    "Matching deployment identity was rejected")
}

private func testMissingIdentity() throws {
  try expect(
    webReadyIdentityRejection(reported: nil, expected: expected)?.contains("missing") == true,
    "Missing sync identity was accepted")
  var incomplete = matching
  incomplete.removeValue(forKey: "runtimeHash")
  try expect(
    webReadyIdentityRejection(reported: incomplete, expected: expected)?.contains("runtimeHash") == true,
    "Missing runtimeHash was accepted")
}

private func testMismatchedIdentity() throws {
  for key in ["protocol", "runtimeId", "configHash", "runtimeHash"] {
    var mismatched = matching
    mismatched[key] = "wrong"
    try expect(
      webReadyIdentityRejection(reported: mismatched, expected: expected)?.contains(key) == true,
      "Mismatched \(key) was accepted")
  }
}

private func testMissingNativeIdentity() throws {
  let unavailable = WebReadyIdentity(
    protocolName: expected.protocolName,
    runtimeId: expected.runtimeId,
    configHash: expected.configHash,
    runtimeHash: "")
  try expect(
    webReadyIdentityRejection(reported: matching, expected: unavailable)?.contains("runtimeHash") == true,
    "Missing native runtimeHash did not fail closed")
}

private func testPendingRenderCorrelationIsGenerationBound() throws {
  guard let correlation = IosRenderCorrelation(
    launcherInstanceId: " launcher-current ",
    executionId: " execution-current ",
    callbackURL: " http://127.0.0.1:4177/api/device-events ")
  else { throw WebReadyTestFailure.assertion("Valid render correlation was rejected") }
  var transition = PendingIosRenderTransition()
  transition.begin(correlation)
  try expect(
    transition.finish(generation: 3) == nil,
    "An unbound render generation borrowed launcher correlation")
  transition.bind(to: 4)
  try expect(
    transition.finish(generation: 3) == nil,
    "A superseded render generation borrowed launcher correlation")
  let finished = transition.finish(generation: 4)
  try expect(finished == correlation, "The bound render generation lost its correlation")
  try expect(
    transition.finish(generation: 4) == nil,
    "A duplicate terminal render reused consumed correlation")
  let attached = correlation.attaching(to: matching)
  try expect(
    attached["runtimeHash"] as? String == "runtime-hash",
    "Attaching correlation changed deployment identity")
  try expect(
    attached["launcherInstanceId"] as? String == "launcher-current" &&
      attached["executionId"] as? String == "execution-current",
    "Render sync did not carry launcher/execution correlation")
}

private func testPendingRenderCorrelationRequiresBothIds() throws {
  try expect(
    IosRenderCorrelation(launcherInstanceId: "", executionId: "execution", callbackURL: "") == nil,
    "Missing launcher id was accepted")
  try expect(
    IosRenderCorrelation(launcherInstanceId: "launcher", executionId: "", callbackURL: "") == nil,
    "Missing execution id was accepted")
}

@main
struct WebReadyIdentityTestRunner {
  static func main() throws {
    try testMatchingIdentity()
    try testMissingIdentity()
    try testMismatchedIdentity()
    try testMissingNativeIdentity()
    try testPendingRenderCorrelationIsGenerationBound()
    try testPendingRenderCorrelationRequiresBothIds()
    print("WebReady identity tests passed.")
  }
}

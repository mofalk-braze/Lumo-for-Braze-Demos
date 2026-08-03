import Foundation

/// Canonical parser for product routes opened from Braze channels.
///
/// Accepted forms:
/// - `/account`
/// - `#/account`
/// - `braze-demo://route/account`
///
/// The route is intentionally not restricted to a screen allow-list. React owns
/// the route table, so new pack routes work without another native-shell change.
enum InternalRoute {
  private static let scheme = "braze-demo"
  private static let host = "route"
  private static let maximumLength = 2048

  static func parse(_ rawValue: String) -> String? {
    let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, !containsControlCharacter(trimmed) else { return nil }

    let route: String
    if trimmed.hasPrefix("/") {
      route = trimmed
    } else if trimmed.hasPrefix("#/") {
      route = String(trimmed.dropFirst())
    } else {
      guard let components = URLComponents(string: trimmed),
        components.scheme?.caseInsensitiveCompare(scheme) == .orderedSame,
        components.host?.caseInsensitiveCompare(host) == .orderedSame
      else { return nil }

      let path = components.percentEncodedPath.isEmpty ? "/" : components.percentEncodedPath
      let query = components.percentEncodedQuery.map { "?\($0)" } ?? ""
      let fragment = components.percentEncodedFragment.map { "#\($0)" } ?? ""
      route = path + query + fragment
    }

    return isSafe(route) ? route : nil
  }

  private static func isSafe(_ route: String) -> Bool {
    guard route.hasPrefix("/"), !route.hasPrefix("//"), route.count <= maximumLength,
      !containsControlCharacter(route)
    else { return false }

    let encodedPath = route.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)[0]
      .split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false)[0]
    let decodedPath = String(encodedPath).removingPercentEncoding ?? String(encodedPath)
    guard !decodedPath.contains("\\") else { return false }
    return decodedPath.split(separator: "/", omittingEmptySubsequences: false).allSatisfy { $0 != ".." }
  }

  private static func containsControlCharacter(_ value: String) -> Bool {
    value.unicodeScalars.contains { $0.value < 0x20 }
  }
}

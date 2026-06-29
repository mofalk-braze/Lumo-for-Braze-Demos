// TEMPLATE — copy this to `Sources/Config.swift` and fill in (or leave empty and
// use Control Room setup). `Sources/Config.swift` is git-ignored so real
// credentials never reach source control.
//
//   cp Config.example.swift Sources/Config.swift
//
// Leaving the creds empty is fine: the app boots with diagnostics and waits for
// workspace credentials from Control Room or an explicit local profile.

import Foundation

enum Config {
  /// DEV workspace SDK API key (not a REST key). Optional seed — leave "" to use
  /// Control Room or a local diagnostic profile instead.
  static let brazeAPIKey = ""

  /// SDK endpoint, e.g. "sdk.iad-03.braze.com" (no scheme). Optional seed.
  static let brazeEndpoint = ""

  /// The web template served by Vite. The Simulator reaches the host's localhost.
  static let webURL = URL(string: "http://localhost:5173")!

  static let demoPackId = "lumo-default"
  static let demoPackName = "Lumo"
  static let demoConfigHash = ""
  static let demoGeneratedAt = ""
  static let demoSourceMode = "vite-dev-server"
  static let browserWebURL = "http://localhost:5173"
  static let androidWebURL = "file:///android_asset/demo/index.html"
  static let iosWebURL = "http://localhost:5173"
  static let launcherCallbackUrl = ""
}

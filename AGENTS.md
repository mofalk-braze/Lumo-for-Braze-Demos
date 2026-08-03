# Project Instructions

- Maintain feature and capability parity between the iOS and Android demo-shell approaches. When changing pack application, runtime generation, asset packaging, launch flows, SDK bridge behavior, or Demo Cockpit controls for one platform, check the corresponding path on the other platform and either implement the analogous behavior or explicitly document why parity is not applicable.
- Treat demo packs as the source of truth. Applying a pack generates web runtime config, runtime manifests, synced assets, Android seed metadata, and iOS runtime defaults. Do not hand-edit generated runtime files.
- For an installed mobile app, treat its bundled runtime manifest's pack id as the target identity. Before changing a local customer pack, verify that identity and deploy only the same pack; never select a pack from a matching brand name or handoff directory.
- The Braze Demo Control Room is the only presenter/operator surface. Demo app UI must stay product-focused; non-product controls belong in the Control Room.
- Native shells own SDK execution. The web template talks to Braze only through the shared bridge contract; Android and iOS execute `changeUser`, events, purchases, push, and Content Cards through their native SDKs.
- Keep REST API keys host-only. Resolve them from Control Room session state or environment variables, and never write them into web assets, Android resources, iOS source, demo pack JSON, or committed files.
- Preserve SDK device identity by default. Any reset that clears app data, simulator/emulator state, or SDK storage must be an explicit recovery/testing action.
- Treat source URL overrides as advanced diagnostics. They must stay visible in runtime/connection diagnostics and, for shared internal use, should be limited to local development origins unless a deliberate debug escape hatch is added.
- Keep source distribution first. Team members should be able to clone the private repo, provide local credentials, run the Control Room locally, and build Android/iOS without relying on committed generated state.
- Before committing, run `npm run validate:demo-runtime` and `npm run security:scan`. If platform code or launch flows changed, also run the relevant Android and/or iOS build checks.

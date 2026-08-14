# Launch Links

Use this when a story involves push taps, email/SMS links, deep links, universal links, app links, custom event query parameters, or "open the app and trigger IAM".

## Intended Behavior

A launch-link story should:

1. Open the native shell.
2. Resolve the active demo user/profile.
3. Navigate the web product surface to a route when requested.
4. Log a native SDK custom event when requested.
5. Let Braze display any mobile IAM naturally from that SDK event.

## Link Shape

Custom scheme example:

```text
braze-demo://demo?route=/notifications&custom_event=next_delivery_heavy_package&prop_weight=42&prop_route_id=1005705
```

HTTPS link example for email/SMS or universal/app links:

```text
https://<demo-link-host>/demo?route=/notifications&custom_event=next_delivery_heavy_package&prop_weight=42
```

Parameter conventions:

- `route`: web route to navigate after launch
- `custom_event`: native SDK event name to log after identity is resolved
- `prop_<key>`: event property with the `prop_` prefix stripped
- optional `external_id`: target demo user when the story needs an explicit user

## Channel Guidance

- Custom schemes are useful for local push/IAM/Content Card demos.
- HTTPS universal links/app links are better for email/SMS because link wrapping and fallback behavior matter.
- iOS universal links require Associated Domains and an AASA file on the link host.
- Android app links require `ACTION_VIEW` intent filters and `assetlinks.json` on the link host.

## Implementation Rules

- Parse links in native code, not product web UI, when the story claims native push/IAM behavior.
- Queue event logging until identity and runtime sync metadata are available.
- Log `custom_event` through the native SDK only once per launch-link execution.
- Pass `prop_*` values as string properties unless the implementation already has a typed parser.
- Use Control Room to generate or test links; do not add link-builder controls to product screens.

## Failure Modes To Guard

- event fires before the user is resolved
- duplicate event logging from both push open and URL open callbacks
- web-only event logging used for a mobile IAM claim
- route navigation succeeds but native event is skipped silently
- custom scheme used in an email client where HTTPS universal links are required

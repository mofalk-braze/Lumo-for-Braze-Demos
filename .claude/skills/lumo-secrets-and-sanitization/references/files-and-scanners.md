# Local Files And Scanner Behavior

Use this reference for exact file classification and scanner interpretation.
The policy and workflow live in `../SKILL.md`.

## Contents

- [Tracked Public Material](#tracked-public-material)
- [Local And Ignored Material](#local-and-ignored-material)
- [Generated Credential Carriers](#generated-credential-carriers)
- [REST Key Resolution](#rest-key-resolution)
- [FCM Token Distinction](#fcm-token-distinction)
- [Secret Scan](#secret-scan)
- [Public Readiness](#public-readiness)
- [Verification Commands](#verification-commands)

## Tracked Public Material

| Path | Classification |
|---|---|
| `android-shell/app/google-services.json` | Firebase client configuration for `com.braze.demoshell`; public by design and embedded in the APK |
| `android-shell/local.properties.example` | Empty Android local-config template |
| `ios-shell/Config.example.swift` | Empty iOS local-config template |
| sanitized `demo-packs/` content | Public demo definitions and assets only |
| `.claude/skills/` | Sanitized source-distributed agent instructions and support files |

The scanner allowlist is intentionally narrower than "anything under these
directories." Verify exact allowlist code before adding a new exception.

## Local And Ignored Material

| Path or pattern | Contents |
|---|---|
| service-account JSON and other server-credential JSON | Firebase/Google private credentials |
| `android-shell/local.properties` and backups | Android SDK credentials plus generated seed metadata |
| `ios-shell/Sources/Config.swift` | iOS SDK credentials plus generated runtime defaults |
| any pack `secrets.properties` | Pack-local SDK, endpoint, sender, user, and optional legacy values |
| `.demo-packs/` | Customer/private packs, assets, app source, and handoff notes |
| `.env*` except the empty example | Environment-local configuration |
| `.p8`, `.p12`, provisioning profiles, certificates | APNs/signing material |
| `.jks`, `.keystore` | Android signing material |
| `.demo-launcher/` | Launcher state cache |
| machine-local Claude settings, launch files, archives | Local agent configuration, not project guidance |

Customer names, private assets, and customer-specific screenshots also stay
out of branches, commit messages, and tracked documentation.

## Generated Credential Carriers

Pack apply writes runtime metadata and credentials into ignored platform files
through `writeAndroidSeedConfig` and `writeIosRuntimeDefaults`.

Android preserves existing `braze.apiKey`, `braze.endpoint`, and
`firebase.senderId` values when the active pack does not supply replacements.
A pre-existing hand-written local-properties file can be backed up before the
first generated write; that backup remains secret.

iOS updates `Config.swift` only when the file exists. Its generated defaults
can overwrite local source values from the active pack and may blank fields
when the pack has no credentials. On-device values stored in UserDefaults have
a different lifecycle.

Consequences:

- do not commit either file;
- do not paste their contents into diagnostics or chat;
- do not delete them as routine cleanup;
- expect local churn after pack apply;
- change source configuration and re-apply instead of hand-editing generated
  runtime metadata.

## REST Key Resolution

The launcher resolves a REST key in this order:

1. Control Room session entry;
2. `BRAZE_REST_API_KEY_<PACK_ID>` where the pack id is uppercased and
   non-alphanumeric runs become underscores;
3. global `BRAZE_REST_API_KEY`;
4. legacy `braze.restApiKey` only when the explicit legacy environment switch
   is enabled.

Session entry lives only in launcher process memory. Prefer it or environment
variables; do not normalize the legacy file fallback into examples or handoff
instructions.

## FCM Token Distinction

A Firebase service account or server key authorizes push sending and is a
secret. An FCM registration token addresses one app install. It is not a
server credential, but it is install-specific, should not be shared, and is
invalidated by reinstall/reset workflows. Each teammate's app must mint and
register its own token in the workspace selected by that install's SDK
credentials.

## Secret Scan

`npm run security:scan` runs an available external scanner and the repository's
built-in working-tree checks. The built-in layer detects credential filenames,
private-key material, service-account private keys, bearer tokens, and
credential-like assignments. It scans Markdown and the project skill bundle.

Ignored credential carriers and exact public templates/client config have
targeted handling. Do not broaden exclusions to silence a real finding.
Scanner findings include file, line, and detector name; inspect the source
without printing its value.

## Public Readiness

`npm run public:check` additionally requires:

1. generated runtime validation;
2. secret-scan success;
3. no disallowed tracked sensitive path;
4. no credential-like content in tracked files;
5. no visible-untracked sensitive path;
6. `.demo-packs/` and other local carriers to remain ignored.

Passing `check:precommit` does not replace the separate public-readiness gate.

## Verification Commands

```sh
git check-ignore -v android-shell/local.properties \
  ios-shell/Sources/Config.swift .demo-packs
git ls-files | grep -iE \
  'google-services|local\.properties|Config\.(example\.)?swift|demo-packs/'
grep -n 'allowedSecretTemplates\|allowedClientConfigFiles' \
  tools/secret-scan.mjs
grep -n 'isAllowedTrackedFile\|isSensitivePath' \
  tools/public-readiness-check.mjs
grep -n 'sessionRestApiKeys\|BRAZE_REST_API_KEY\|ALLOW_LEGACY' \
  tools/demo-launcher.mjs
```

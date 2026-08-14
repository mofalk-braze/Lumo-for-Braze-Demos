---
name: lumo-secrets-and-sanitization
description: >-
  Secrets handling, sanitization rules, and the committed-vs-local file ledger
  for the Lumo Braze Demo Shells repo (public source + off-repo secrets). Use
  when anyone asks "can I commit this", "is this safe to push", "is
  google-services.json a secret", "where do I put my API key", "share the
  repo", "public release", "sanitize this pack", "handoff the service
  account", "rotate a key", or mentions a secret, credential, API key, Braze
  REST key, Braze SDK key, Firebase service account, FCM server key, APNs key,
  keystore, secrets.properties, local.properties, Config.swift, .env files, or
  .demo-packs/. Also use when a secret may have been committed (incident
  response), when interpreting security:scan or public:check failures, and
  before any AI agent writes example configs, docs, or skills that mention
  credentials.
---

# Lumo Secrets and Sanitization

This repo's distribution model is **public source + off-repo secrets**:
teammates clone the full source, and every credential travels outside Git.
One committed key breaks the model for everyone. This skill is the single
source of truth for what is committed vs local, how keys flow, how the
scanners enforce it, and what to do if something slips through.

Terms used below, defined once:

- **SDK key** (`braze.apiKey`): the Braze app-identifier key baked into a
  client app so the SDK can talk to Braze. Low-privilege but still local-only
  here, because each teammate uses their own workspace.
- **REST key** (`BRAZE_REST_API_KEY*`): a Braze workspace API key that can
  send campaigns and read user data. High-privilege. Host-only, never in any
  file that could be committed.
- **Firebase service account JSON**: a Google private key that lets Braze
  send FCM push for the shared Firebase project. The most sensitive artifact
  in this system.
- **FCM registration token**: a per-app-install device address for push. Not
  a server credential (see the dedicated section below).
- **Pack**: a demo pack (`demo-pack.json` + assets + ignored
  `secrets.properties`), the source of truth that "apply" turns into runtime
  config. **Control Room**: the local operator web UI served by
  `tools/demo-launcher.mjs`.

## The committed-vs-local ledger

Verified against `.gitignore`, `git ls-files`, `README.md` ("Local Secrets"),
and `docs/lumo-public-quickstart.md` ("What Comes From Git" / "What Must Stay
Outside Git").

### Committed (tracked in Git) — and why that is safe

| File | Why it is committed |
|---|---|
| `android-shell/app/google-services.json` | Firebase **client** config for package `com.braze.demoshell` (project `braze-sc-demo-shell`). It is embedded in every APK anyway; anyone with the app has it. It contains no server credential. Explicitly allowlisted in both scanners. |
| `ios-shell/Config.example.swift` | Template with **empty** credential fields. You copy it to `ios-shell/Sources/Config.swift` (which is ignored). Allowlisted as a secret template. |
| `android-shell/local.properties.example` | Same idea for Android: documented keys (`braze.apiKey=`, `braze.endpoint=`, `firebase.senderId=`, ...) with blank values. Allowlisted as a secret template. |
| `demo-packs/Lumo/demo-pack.json` | The sanitized public starter pack. Contains brand/content/config only — no credentials, no customer assets. Its sibling `demo-packs/Lumo/secrets.properties` is **ignored**, not committed. |
| `.claude/skills/` | Sanitized project runbooks and references that let a fresh agent set up, operate, and troubleshoot the repo. They contain placeholders and key names only, never local values. |

Nothing else credential-adjacent is allowed in the tree. The scanners treat
three paths as the complete allowlist — `android-shell/app/google-services.json`,
`android-shell/local.properties.example`, `ios-shell/Config.example.swift`
(`allowedSecretTemplates` + `allowedClientConfigFiles` in
`tools/secret-scan.mjs`; the same three in `isAllowedTrackedFile` in
`tools/public-readiness-check.mjs`). `demo-packs/Lumo/demo-pack.json` is
committed as ordinary sanitized content — it is not a scanner allowlist
entry, it simply contains no credentials.

### Local / ignored — never commit, never quote values

| Path / pattern | What it holds | `.gitignore` rule |
|---|---|---|
| Firebase service-account JSON (`**/firebase-service-account*.json`, `**/service-account*.json`, `**/braze-secrets*.json`) | Google private key for push sending | `android-shell/**/…*.json` patterns |
| Braze REST keys | Workspace API keys | Never in files at all — env vars or Control Room session only |
| Braze SDK keys + endpoints | Per-workspace app identifiers | Live only in ignored `secrets.properties`, `local.properties`, `Config.swift` |
| FCM server keys | Legacy push server credential | Never in files at all |
| APNs material: `*.p8`, `*.p12`, `*.mobileprovision`, `*.cer`, `*.certSigningRequest` | Apple push/signing | extension rules |
| Keystores: `android-shell/**/*.jks`, `**/*.keystore` | Android signing | extension rules |
| `android-shell/local.properties` (+ `local.properties.backup.*`) | SDK key/endpoint/sender id merged with generated seed metadata | explicit rules |
| `ios-shell/Sources/Config.swift` | Same for iOS | explicit rule (listed twice in `.gitignore`) |
| `demo-packs/*/secrets.properties` (and everything in `.demo-packs/`) | Pack credentials | explicit rules |
| `.env`, `.env.*` (except `.env.example`) | Env files | explicit rules |
| `.demo-packs/` (entire directory) | Customer / Claude-created packs | explicit rule |
| `Braze Design System (Collaborative)/` | Unsanitized design assets | explicit rule |
| `.demo-launcher/` | Launcher state cache (`state.json`) | explicit rule |
| `.claude/settings.local.json`, `.claude/launch.json`, `.claude/skills.zip` | Machine-local Claude configuration and obsolete/local archives | `.claude/*` with `.claude/skills/**` explicitly included |

Verify the ledger any time you doubt it:

```sh
git check-ignore -v android-shell/local.properties ios-shell/Sources/Config.swift .demo-packs
git ls-files | grep -iE 'google-services|local\.properties|Config\.(example\.)?swift|demo-packs/'
```

Expected: the first command prints a matching `.gitignore` rule for each path;
the second lists ONLY the four committed files (plus `demo-packs/README.md`).

## The critical nuance: two files are both secrets AND generated

`android-shell/local.properties` and `ios-shell/Sources/Config.swift` are
**secret carriers that get regenerated on every pack apply**
(`applyDemoPack()` in `tools/demo-pack-utils.mjs` calls
`writeAndroidSeedConfig` and `writeIosRuntimeDefaults`). Each apply merges
pack seed metadata (pack id, public `configHash`, deployment `runtimeHash` v2,
generated timestamp, and URLs) together with credentials into the same file.
Readiness requires `runtimeHash` because it also covers active assets and the
private app surface; `configHash` alone proves only public configuration.

Consequences — all four matter:

1. **Never commit them.** Generated-looking churn does not make them safe;
   the credentials ride along in the same file.
2. **Never quote their values** into chat, docs, commits, or skills — not
   even partially masked.
3. **Deleting them loses local credentials** until re-entered. The Android
   writer preserves existing `braze.apiKey` / `braze.endpoint` /
   `firebase.senderId` values when the pack's `secrets.properties` doesn't
   supply them (`secrets[...] || existing[...]` in `writeAndroidSeedConfig`),
   so apply is safe — but `rm local.properties` is not. A hand-written
   (non-generated-header) file is backed up to
   `local.properties.backup.<timestamp>` before the first generated write;
   those backups are ignored too and are equally secret.
4. **Don't be surprised by churn in them.** `git status` never shows them
   (ignored), but on disk they legitimately change every apply. Never
   hand-edit them to "fix" a demo — change the pack and re-apply.

iOS asymmetry worth knowing: `writeIosRuntimeDefaults` only runs if
`ios-shell/Sources/Config.swift` already exists, and it **overwrites**
`brazeAPIKey` / `brazeEndpoint` from the pack's `secrets.properties` (blank
if the pack has none) rather than preserving prior values. iOS credentials
entered via the in-app Setup screen live in UserDefaults and survive; values
only in `Config.swift` may be blanked by applying a pack without secrets.

## REST key conventions (how keys reach the Control Room)

REST keys are host-only, by policy: Control Room session entry or env vars,
never a file. The session entry is never persisted to disk — it lives in an
in-memory `Map` in the launcher process and disappears when the launcher
exits. The legacy `braze.restApiKey` fallback inside `secrets.properties` is
discouraged and off by default (`BRAZE_CONTROL_ROOM_ALLOW_LEGACY_REST_KEY=1`
required) because it puts a REST key in a file, one `.gitignore` mistake away
from a commit — prefer the session or env var options. Full resolution order
and the pack-id env var naming rule: `lumo-config-and-flags` §2 "Braze REST
keys" (the owning index for this fact).

Set env vars in your shell profile or the launcher's environment — never in a
committed file, never in `demo-pack.json`, never in web assets or native
resources (standing rule in `AGENTS.md`).

## FCM registration tokens are not secrets to protect — but don't share them

Two different things with "FCM" in the name:

- **FCM server key / service-account JSON** — server credential. Secret.
  Handoff protocol below.
- **FCM registration token** — per-install device address generated by each
  emulator/app install. Visible in Control Room diagnostics for debugging
  (token-present status per active install). It is not a credential, but it
  is per-install and useless on another machine: **never share, copy between
  machines, or commit one** (`README.md` "Sharing With Teammates",
  quickstart "Android Push"). A token from a different install is one of the
  documented causes of "push not arriving".

## Service-account handoff protocol (SolCon short-lived key)

Verified wording in `README.md` and `docs/lumo-public-quickstart.md`:

1. The Firebase service-account JSON is handed to a teammate **outside Git**,
   only when they need to configure Android push in their own Braze
   workspace (they upload it in Braze Android Push Settings themselves).
2. **Prefer a password manager or other audited secret handoff.**
3. Slack is a **last resort** only. If used: use a **short-lived SolCon
   key**, share it only with the small setup group, and **rotate/delete it
   after the event/setup**.
4. Never leave the JSON in the repo directory tree afterwards — even ignored
   locations accumulate risk. Store it wherever your password manager or
   keychain lives.

## Enforcement machinery — what the scanners actually check

### `npm run security:scan` (`tools/secret-scan.mjs`)

Runs an external scanner first — **gitleaks preferred, trufflehog second**
(`--redact` / filesystem mode) — then ALWAYS also runs the built-in
lightweight scan of the working tree. Built-in detectors:

| Detector | Trips on |
|---|---|
| Private key material | PEM `BEGIN ... PRIVATE KEY` blocks |
| Google service-account key | `"private_key"` JSON field with a PEM block |
| Bearer token | the word Bearer followed by a 20+ char token |
| Braze REST key assignment | `braze.restApiKey` or `BRAZE_REST_API_KEY*` assigned a 20+ char value |
| SDK/API key assignment | `apiKey` / `api_key` / `braze.apiKey` / `firebase.senderId` assigned a 20+ char value |
| Credential filename | any path containing `google-services.json`, `secrets.properties`, `Config.swift`, `.mobileprovision`, `.p8`, `.p12`, `.jks`, `.keystore` |

Exclusions and bypasses (read these before "fixing" a finding):

- Skipped dirs: `.git`, `.gradle`, `.idea`, `.demo-launcher`, `.demo-packs`,
  `build`, `DerivedData`, `dist`, `node_modules`, `Braze Design System
  (Collaborative)`. Note `.claude/` is NOT skipped — these skills are
  scanned, which is why examples here use angle-bracket placeholders.
- Ignored-credential paths (`local.properties`, its backups,
  `secrets.properties`, `Sources/Config.swift`, `.env*`) are skipped —
  they're allowed to hold real values locally.
- The two templates bypass line detectors when the line is empty or contains
  `YOUR_` / `REPLACE_` / `example` / `placeholder`;
  `android-shell/app/google-services.json` is exempted from the SDK/API-key
  detector only. Lines referencing `BuildConfig.` / `process.env` /
  `secrets[` / `placeholder` are skipped everywhere.

A finding is printed as `- <file>:<line> <detector name>`; exit code 1.

### `npm run public:check` (`tools/public-readiness-check.mjs`) — six gates

1. `npm run validate:demo-runtime` passes.
2. `npm run security:scan` passes.
3. **Tracked paths**: no tracked file matches sensitive patterns (`.env*`,
   `secrets.properties`, `Config.swift`, `local.properties`,
   service-account JSONs, `.p8/.p12/.mobileprovision/.jks/.keystore`,
   `Braze Design System (Collaborative)/`, `.demo-packs/`) except the three
   allowlisted files.
4. **Tracked content**: every tracked file is scanned for private-key
   material, service-account keys, and Braze REST/SDK key assignments.
5. **Visible untracked**: no `??`-status file in `git status` matches a
   sensitive pattern — sensitive files must be invisible to git, not merely
   uncommitted.
6. **`.demo-packs/` must be IGNORED, not untracked**: `git check-ignore -q
   .demo-packs` must succeed. "It shows up as untracked" is a failure.

Manual verification of gates 5–6:

```sh
git status --short --ignored
```

Expected: `.demo-packs/` (and `local.properties`, `Config.swift`, etc.)
appear with `!!` (ignored), never `??` (untracked).

### The gap you must not forget

`check:precommit` runs capability tests, runtime validation, the secret scan,
and the agent-skill distribution check, but it **does NOT** include
`public:check` (verified in `package.json`). Passing precommit does not mean the
tree is publishable. **Run `npm run public:check` before any commit** —
README.md "Commit Checks" lists it alongside `check:precommit` and the web
build with no before-commit/before-push distinction, and
`lumo-change-control-and-qa` Gate 1 requires it every time. Run it again before
publishing, pushing to a shared remote, or cutting any handoff (Gate 2), but
that is an *additional* checkpoint, not the first one.

## Incident runbook: "I think a secret was committed"

Order matters. Rotation comes before cleanup — **a committed key is
compromised even if the commit is removed later** (clones, reflogs, CI
caches, and forge storage all retain it).

1. **Stop. Do not push.** If it is only in local commits, the blast radius is
   this machine. If already pushed, treat the key as public.
2. **Identify the blob and its history:**

   ```sh
   git log --all --oneline -- <path-to-file>
   git grep -I --line-number '<distinctive-fragment>' $(git rev-list --all) 2>/dev/null | head
   ```

3. **Rotate the credential FIRST.** Braze dashboard for SDK/REST keys;
   Google Cloud console for service-account keys; Apple developer portal for
   APNs. Also rotate anything the leaked key could mint.
4. **Then clean up:** if unpushed, `git reset` / amend / rebase locally and
   re-run `npm run security:scan` and `npm run public:check` until clean. If
   pushed, history rewriting (e.g. `git filter-repo`) of a **shared repo is
   an owner decision — do not do it unilaterally.** Report to the repo owner
   (Mo Falk) with the blob/commit ids and let them coordinate the rewrite and
   force-push window.
5. **Verify** afterwards: scanners pass, `git status --short --ignored` shows
   sensitive paths as `!!`, and the rotated key works end-to-end.

## Rules for AI agents working in this repo

Binding, not advisory:

- You may READ `android-shell/local.properties`,
  `ios-shell/Sources/Config.swift`, any `secrets.properties`, and files under
  `.demo-packs/` to learn **structure and key names** only. **Never echo a
  value from them** into chat, commit messages, docs, skills, generated
  packs, or code — not truncated, not masked, not "just the prefix".
- Placeholders only, in `<ANGLE_BRACKET>` form:

  ```properties
  braze.apiKey=<YOUR_SDK_API_KEY>
  braze.endpoint=<YOUR_SDK_ENDPOINT>
  firebase.senderId=<YOUR_FCM_SENDER_ID>
  ```

- Name env vars abstractly (`BRAZE_REST_API_KEY_<PACK_ID>`) or with the
  known-safe example `BRAZE_REST_API_KEY_LUMO_DEFAULT` — never with a value.
- Never write credentials into `demo-pack.json`, web assets, Android
  resources, iOS source, or anything committed (standing rule, `AGENTS.md`).
- New customer/Claude-created packs go in `.demo-packs/`, not `demo-packs/`,
  unless the user explicitly asks for a sanitized public pack. No customer
  names/assets in commits, branches, screenshots, or public pack ids.
- Before claiming anything is safe to commit or publish, run and show output
  of `npm run security:scan` and `npm run public:check`.

## When NOT to use this skill

- **Which key does what functionally** (SDK key vs REST key behavior, push
  token lifecycle inside the app, bridge/REST mechanics) →
  `braze-integration-reference`.
- **Promotion checklist mechanics** for turning a local pack into a sanitized
  public pack → `lumo-demo-pack-authoring` (it links back here for the
  secrets rules).
- **Commit gates broadly** (what to run for which kind of change, evidence
  standards, native build checks) → `lumo-change-control-and-qa`.
- **Every config axis / env var / flag as a reference table** →
  `lumo-config-and-flags`.
- **Getting push working on a teammate machine** (which uses the handoff
  protocol as one step) → `lumo-push-readiness-campaign`.

## Provenance and maintenance

Verified 2026-07-03 against the live repo (git `main`, clean tree). Re-verify
before trusting, in case of drift:

- Ledger / ignore rules: `git check-ignore -v <path>` and read `.gitignore`.
- Committed allowlist: `git ls-files | grep -iE 'google-services|example|demo-packs/'`.
- Scanner behavior: read `tools/secret-scan.mjs` (detectors, `excludedDirs`,
  `allowedSecretTemplates`) and `tools/public-readiness-check.mjs`
  (`isAllowedTrackedFile`, `isSensitivePath`, the six gates).
- REST key resolution + session-only storage: `grep -n
  "sessionRestApiKeys\|BRAZE_REST_API_KEY\|ALLOW_LEGACY" tools/demo-launcher.mjs`.
- Generated-file merge/overwrite behavior: `writeAndroidSeedConfig` and
  `writeIosRuntimeDefaults` in `tools/demo-pack-utils.mjs`.
- Script definitions: `grep -n '"check:precommit"\|"public:check"\|"security:scan"' package.json`.
- Handoff protocol wording: `README.md` ("Sharing With Teammates") and
  `docs/lumo-public-quickstart.md` ("Android Push In Your Own Braze
  Workspace", "Public Release Checks").

### Open questions / candidates

- The repo has no documented owner-side procedure for executing a history
  rewrite (tooling choice, coordination steps). The runbook above stops at
  "escalate to the owner" deliberately.
- `.gitignore` lists `ios-shell/Sources/Config.swift` twice (lines 15 and 34)
  — harmless duplication, candidate cleanup only.

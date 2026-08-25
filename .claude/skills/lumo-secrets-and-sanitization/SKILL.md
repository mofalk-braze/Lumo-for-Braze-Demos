---
name: lumo-secrets-and-sanitization
description: >-
  Protect credentials and private customer material in the Lumo Braze Demo
  Shells repo. Use when a request explicitly handles Braze SDK or REST keys,
  Firebase service accounts, FCM/APNs credentials, keystores, local secret
  files, private `.demo-packs/`, pack sanitization, credential handoff or
  rotation, a credential-related security/public-check failure, or a suspected
  committed secret. Do not invoke for an ordinary commit with no credential or
  private-material concern; use lumo-change-control-and-qa for generic gates.
---

# Lumo Secrets and Sanitization

Enforce the distribution model: source and sanitized agent runbooks come from
Git; credentials and customer-specific material do not.

## Work Safely

1. Inspect paths, key names, and file structure without echoing credential
   values. Never paste a value into chat, tool output, docs, code, a diff, or a
   commit message—not even masked or truncated.
2. Classify each item using the destination rules below before writing it.
3. Keep customer-created packs in ignored `.demo-packs/`; use `demo-packs/`
   only for an explicitly sanitized public pack.
4. Run both repository scanners before saying material is safe to commit,
   share, or publish.
5. If a secret may be in Git history, stop normal work and follow the incident
   reference before cleanup.

## Destination Rules

| Material | Allowed destination |
|---|---|
| Braze SDK key, SDK endpoint, FCM sender id | Ignored pack `secrets.properties`, generated ignored Android/iOS local config, or the platform credential store |
| Braze REST key | Control Room session memory or host environment variable only |
| Braze REST endpoint | Local pack configuration; it is not itself a credential |
| Firebase service-account JSON | Off-repo secret storage; upload manually to the teammate's Braze workspace |
| FCM server key, APNs signing material, keystore | Off-repo secret storage only |
| FCM registration token | Current app-install runtime only; never share or commit |
| Customer pack, assets, notes, screenshots | Ignored `.demo-packs/` or another approved off-repo location |
| Sanitized skills/runbooks | Tracked `.claude/skills/` with placeholders only |

REST keys are host-only. Never write them into `demo-pack.json`,
`secrets.properties`, web assets, Android resources, iOS source, or another
file that could be committed. The legacy file fallback is disabled by default
and is not the supported handoff path.

Two generated files can carry live credentials:
`android-shell/local.properties` and `ios-shell/Sources/Config.swift`. Their
generated appearance does not make them committable. Do not quote them or
delete them casually; pack apply can update their runtime metadata and
credential behavior differs by platform.

Read
[references/files-and-scanners.md](references/files-and-scanners.md) when you
need the exhaustive committed/local ledger, generated-file behavior, REST key
resolution, or an explanation of a `security:scan`/`public:check` finding.

## Committed Exceptions

Do not infer safety from a filename. The intentional tracked exceptions are:

- `android-shell/app/google-services.json`: Firebase public client config,
  embedded in the APK; it is not a service-account credential.
- `android-shell/local.properties.example` and
  `ios-shell/Config.example.swift`: empty templates.
- the sanitized public starter pack and its ordinary public content.
- `.claude/skills/`: source-distributed guidance containing names and
  placeholders, never values.

Any other credential-adjacent tracked file requires investigation; do not
expand this allowlist casually.

## Safe Examples

Use empty values or angle-bracket placeholders only:

```properties
braze.apiKey=<YOUR_SDK_API_KEY>
braze.endpoint=<YOUR_SDK_ENDPOINT>
firebase.senderId=<YOUR_FCM_SENDER_ID>
```

Name REST-key environment variables without values, for example
`BRAZE_REST_API_KEY_<PACK_ID>`. Do not invent realistic-looking example keys.

## Verify Sanitization

Run from the repo root:

```sh
npm run security:scan
npm run public:check
git status --short --ignored
```

Require successful exits and named pass output. Sensitive local paths should
appear as ignored (`!!`), never visible untracked (`??`). These commands are
both required: `public:check` adds tracked-path, tracked-content,
visible-untracked, and ignore-state checks beyond the secret scan.

If a finding occurs, do not "fix" it by weakening a detector, adding a broad
exclusion, or committing a secret template with a realistic value. Read the
scanner reference, locate the owning source, and move/redact the material.

## Credential Handoff

Use an audited secret channel such as a password manager. Give each teammate
only the credential needed for their own workspace and setup step. If a
short-lived setup credential is used, rotate/delete it after the setup or
event. Never leave service-account material inside the repository tree after
handoff, even under an ignored path.

## Suspected Secret Incident

Do not push, publish, or continue ordinary cleanup. Read
[references/credential-incident.md](references/credential-incident.md) in
full and follow it in order. Rotation/revocation precedes history cleanup;
removing a commit does not make an exposed credential safe again.

## Routing Boundaries

- Generic commit/push gates and evidence → `lumo-change-control-and-qa`.
- Pack promotion mechanics after policy is understood →
  `lumo-demo-pack-authoring`.
- First-time teammate push setup → `lumo-push-readiness-campaign`.
- Runtime push regression → `lumo-debugging-playbook`.
- Key/bridge/push mechanics as factual reference →
  `braze-integration-reference`.

## Maintenance

Re-verify `.gitignore`, tracked files, scanner allowlists, and launcher REST
credential resolution before changing policy. Keep detailed mechanism in the
two direct references rather than duplicating it here.

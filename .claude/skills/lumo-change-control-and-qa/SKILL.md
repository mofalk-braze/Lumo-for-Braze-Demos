---
name: lumo-change-control-and-qa
description: >-
  Commit gates, QA evidence standards, and the definition of done for the Lumo
  Braze Demo Shells repo — which checks must run before any commit, which extra
  gates apply before publishing or handoff, when native Android/iOS builds are
  also required, the iOS/Android parity review rule, and what counts as
  evidence. Use when the user says "commit", "push", "PR", "before I commit",
  "is this safe to merge", "what checks do I run", "precommit", "validate",
  "QA", "definition of done", "evidence", "gate", "am I done", "ready to
  share", "handoff", or is about to commit, push, open a PR, publish the repo,
  or hand work to a teammate. Also use when an AI agent finishes ANY change in
  this repo and is deciding whether it can stop — run this skill's gates first.
---

# Lumo Change Control and QA

This skill defines how changes are gated in this repository: the commands that
must pass before a commit, the extra gates before publishing or handoff, and
what counts as evidence that a change works. This repo has **no unit test
suite** — the validation commands plus observed runtime behavior ARE the test
suite. That makes the gates below load-bearing, not ceremony.

Terms used throughout:

- **Pack** (demo pack): a `demo-pack.json` plus optional assets — the source of
  truth. Applying a pack generates runtime files for web, Android, and iOS.
- **configHash**: a hash of the applied pack's config, stamped into every
  generated runtime file so drift between them is detectable.
- **Bridge**: the message channel between the web UI and the native
  Android/iOS app (`BrazeDemoBridge.kt` on Android); "a bridge action" means a
  Braze SDK call the native shell executes on the web UI's behalf.

**This skill is binding for AI agents.** If you are an agent and you changed
anything in this repo, you may not report the work as done until the applicable
gates below have been run *in this session* and their pass lines observed.

## When NOT to use this skill

- What `validate:demo-runtime`, `security:scan`, `public:check`, or `doctor`
  actually inspect internally, and how to interpret their failures — see
  `lumo-diagnostics-and-tooling`.
- Secrets policy detail (what is committed vs local, env var conventions, the
  handoff protocol) — see `lumo-secrets-and-sanitization`.
- Why the invariants exist (generated files, bridge contract, Control Room as
  sole operator surface) — see `lumo-architecture-contract`.
- Building or changing demo stories, screens, packs-as-content, presets — use
  the `braze-demo-app-builder` skill or the `plugins/braze-demo-builder`
  plugin; see `lumo-plugin-workflow` for routing.
- Debugging a failing demo at runtime — see `lumo-debugging-playbook`.

## Gate 1 — before ANY commit

Run all three, from the repo root, every time, for every commit — including
docs-only, README-only, and "trivial" commits:

```sh
npm run check:precommit          # capability tests + runtime/secret/skill checks
npm run public:check
cd web-template && npm run build
```

Expected pass output (observe these exact lines; anything else is a failure):

| Command | Pass signal |
|---|---|
| `npm run check:precommit` | 99 capability/unit/HTTP tests pass, then runtime validation, secret scan, and agent-skill distribution all pass |
| `npm run public:check` | `Public readiness check passed.` |
| `cd web-template && npm run build` | `tsc -b && vite build` completes, exit code 0, no errors |

**IMPORTANT nuance — check:precommit does NOT include public:check.** Verified
in `package.json`: `check:precommit` runs `test:capabilities`,
`validate:demo-runtime`, `security:scan`, and `check:agent-skills`. The README's
"Commit Checks" section lists `public:check` as a separate command for exactly
this reason. Never assume "precommit passed" means "public readiness passed" —
they are different tools with different coverage. If you skip `public:check`,
nobody has checked public readiness.

These commands may not be skipped, mocked, run "mentally", or replaced with
"it passed last time". Sources of record: README.md "Commit Checks", CLAUDE.md
"Validation", AGENTS.md final bullet.

**Gate 1 addition for setup changes:** CLAUDE.md "Validation" requires
`npm run lumo:apply` before publishing **or committing setup changes**. If
your change touches packs, generators, tooling, or anything that feeds the
generated runtime, run `npm run lumo:apply` FIRST, then the three commands
above — otherwise you validate stale generated files against themselves while
they disagree with the source you just edited.

## Gate 2 — before publishing, sharing, or handoff

Everything in Gate 1, **plus** a fresh pack application first, so the generated
state you validate is actually regenerated from the current source of truth:

```sh
npm run lumo:apply               # fresh generation from the pack
npm run check:precommit
npm run public:check
cd web-template && npm run build
```

"Publishing/sharing/handoff" means: pushing to a shared remote, opening a PR,
tagging a release, zipping the repo for a teammate, or preparing a sanitized
public pack. Per CLAUDE.md, `lumo:apply` comes first in this sequence — and
CLAUDE.md applies the same requirement to *committing setup changes*, not only
publishing (see the Gate 1 addition above). Stale generated files can validate
green against themselves while disagreeing with the pack you just edited.

## Gate 3 — native builds (conditional, in ADDITION to Gates 1/2)

Validation commands do not compile native code. If your change touches native
territory, the platform build is part of the gate. Triggers verified against
CLAUDE.md and `plugins/braze-demo-builder/commands/demo-build.md`:

| You changed... | Also run |
|---|---|
| Android shell code, bridge (`BrazeDemoBridge.kt` etc.), push handling, `AndroidManifest.xml`, launch flow, SDK wiring | `cd android-shell && ./gradlew :app:compileDebugKotlin` |
| iOS shell code, bridge, `Info.plist`, push, launch flow, SDK wiring | `cd ios-shell && xcodegen generate && xcodebuild -project BrazeDemoShell.xcodeproj -scheme BrazeDemoShell -sdk iphonesimulator -derivedDataPath ./DerivedData CODE_SIGNING_ALLOWED=NO build` |

Pass signals: Gradle prints `BUILD SUCCESSFUL`; xcodebuild ends with
`** BUILD SUCCEEDED **`. A change that "obviously compiles" is not a category —
run the build.

## Gate 4 — platform parity (review gate, not a suggestion)

From AGENTS.md, verbatim obligation: when changing **pack application, runtime
generation, asset packaging, launch flows, SDK bridge behavior, or Demo
Cockpit/Control Room controls** for one platform, you must check the
corresponding path on the other platform and either:

1. implement the analogous behavior there, or
2. explicitly document, in the commit/PR description, why parity is not
   applicable.

Silence is a gate failure. "iOS is dev-mode only right now" can be a valid
parity-not-applicable reason — but it must be written down, not assumed.

## What counts as evidence

Claims about a change require evidence at the matching level. "Should work",
"looks right", or "the code path is straightforward" are not evidence.

| Claim | Required evidence |
|---|---|
| "Checks pass" | The actual pass lines from Gate 1/2/3, pasted or directly observed in this session |
| "The build works" | `BUILD SUCCESSFUL` / `** BUILD SUCCEEDED **` / vite exit 0, observed, not inferred |
| "The behavior works" (bridge action, event, screen, preset, push) | An observed launcher-client run with a correlated Activity Feed result and device diagnostics; require pack id, `runtimeHash`, rendered source, active user, and selected-pack credential-context agreement |
| "The generated files are consistent" | `npm run validate:demo-runtime` pass line (it checks id/configHash/runtimeHash agreement and active-pack-only assets across generated web runtime, dist, and packaged Android assets) |
| "No secrets leaked" | `npm run security:scan` AND `npm run public:check` pass lines |

There are no unit tests in this repo to hide behind or point to. If you did not
run the command or observe the runtime behavior, you do not know it works —
say so plainly rather than asserting success.

## Non-negotiables (with rationale)

These are standing rules from AGENTS.md/CLAUDE.md plus confirmed project-owner
discipline rules. They are not preferences.

1. **Never hand-edit generated files** — `activeDemoConfig.generated.ts`,
   `web-template/public/demo-runtime.json`, `web-template/public/demo-assets/`,
   `android-shell/.active-demo-pack`, iOS runtime defaults. Edit the pack, then
   re-apply (`npm run lumo:apply` or the Control Room). Hand edits are
   silently destroyed by the next apply and create runtime drift that
   `validate:demo-runtime` will flag — or worse, drift that surfaces mid-demo.
2. **Never demo from an un-applied or stale pack** — re-apply and confirm
   `runtimeHash` plus rendered-source agreement before
   presenting. Stale runtime drift has cost real demos.
3. **No presenter controls in product UI** — the Control Room is the only
   presenter/operator surface. Demo app UI stays product-focused; a visible
   "demo button" destroys the illusion the whole shell exists to create.
4. **REST keys never written to committed files** — REST keys are host-only:
   Control Room session state or env vars (`BRAZE_REST_API_KEY_<PACK_ID>` /
   `BRAZE_REST_API_KEY`). Never in web assets, Android resources, iOS source,
   pack JSON, or anything committed. Detail: `lumo-secrets-and-sanitization`.
5. **No casual app-data resets** — clearing app data, wiping the emulator, or
   erasing the simulator destroys the SDK device identity and push-token
   continuity that working push depends on. Resets are explicit
   recovery/testing actions only, never a debugging reflex.
6. **No customer names or assets in anything committed** — commits, branch
   names, screenshots, pack ids in the public tree. Customer packs live in
   `.demo-packs/` (ignored); they were deliberately purged from the public
   tree in June 2026. Do not reintroduce them.
7. **Demo packs default to `.demo-packs/`** — only sanitized public packs go
   in `demo-packs/`, and only when explicitly requested.

## Rationalization table

Agents and humans under time pressure produce these. Every one is wrong; here
is why:

| Rationalization | Reality |
|---|---|
| "It's just a doc change, skip the scans" | `security:scan` and `public:check` still required — docs and READMEs can leak keys, tokens, customer names, and internal URLs exactly as easily as code. Gate 1 has no docs-only exemption. |
| "Validate passed yesterday" | Generated state changed if any pack, tool, or template changed since. Validation is a statement about the tree *now*, not the tree then. Re-run it. |
| "I'll run public:check later / before the push" | Later means after the secret or customer name is already in a commit, where removing it requires history rewriting, not a file edit. Run it before the commit exists. |
| "The web build is slow, I'll skip it this once" | A broken `web-template/dist` bricks the Android asset packaging — the shell serves the built web app from packaged assets. You would be committing a change that cannot ship a working demo. |
| "Small Kotlin tweak, skip the Gradle build" | `:app:compileDebugKotlin` costs minutes. A broken demo shell in front of a prospect costs the meeting. There is no tweak small enough to be exempt from compiling. |
| "check:precommit passed, so I'm covered" | It does not run `public:check`. See Gate 1. |
| "No tests exist, so there's nothing to run" | Backwards. Because no tests exist, the validation commands and an observed runtime check are the *entire* safety net — skipping them means zero verification, not "the usual amount". |
| "I'll just quickly fix the generated file for the demo" | The next apply erases your fix, and until then the pack and runtime disagree. Fix the pack, re-apply. |

If you catch yourself constructing a new entry for this table, that is the
signal to stop and run the gates.

## Red flags — stop immediately if you are about to...

- Commit without having run Gate 1 in this session.
- Edit any `*.generated.*` file, `demo-runtime.json`, `.active-demo-pack`, or
  anything under `web-template/public/demo-assets/` by hand.
- Hardcode an API key, SDK key, user id, or endpoint "temporarily" — temporary
  hardcodings get committed; that is their entire failure mode.
- Rename a pack id — id changes ripple through generated files, env var names
  (`BRAZE_REST_API_KEY_<PACK_ID>`), Android seed metadata, and Control Room
  state; treat as a deliberate migration, not a rename.
- Report "done" (agent) or push (human) with any gate output unobserved.

## Change-size guidance

Prefer the smallest credible surface that achieves the goal:

1. **Pack change** (content, presets, assets, config) — cheapest, no code
   review surface, gates 1–2 only.
2. **Web change** (`web-template/`) — adds the web build to your blast radius.
3. **Native change** (`android-shell/`, `ios-shell/`) — adds Gate 3 and the
   Gate 4 parity obligation.

If the request is "build or change a demo story" (screens, journeys, events,
Content Cards, presets), do not implement it directly from this skill — route
to the `braze-demo-app-builder` skill (or `/braze-demo-builder:demo-build`
via the plugin), which owns that workflow. But its QA does NOT cover Gate 1:
the builder's qa-checklist runs only `validate:demo-runtime` + the web build
(+ native builds), and the plugin's demo-build runs `validate:demo-runtime` +
`security:scan` — neither runs `public:check`. After the build, return here
and run Gate 1 in full yourself.

## Definition of done (checklist)

A change is done when ALL of these are true:

- [ ] Gate 1 run in this session, all three pass lines observed
- [ ] If publishing/sharing/handoff: `npm run lumo:apply` ran first (Gate 2)
- [ ] If native code/manifest/launch-flow touched: platform build succeeded
      (Gate 3)
- [ ] If platform-affecting: parity implemented or non-applicability documented
      (Gate 4)
- [ ] Behavior changes verified by an observed run (Control Room action +
      Activity Feed entry + device diagnostics), not by reading the code
- [ ] No generated files hand-edited; no secrets or customer references in the
      diff (`git diff --staged` actually read, not skimmed)

## Provenance and maintenance

Verified 2026-07-03 against: `package.json` (script definitions), `README.md`
("Commit Checks"), `CLAUDE.md` ("Validation"), `AGENTS.md` (parity rule, final
commit-check bullet), `plugins/braze-demo-builder/commands/demo-build.md`
(native build commands), `tools/validate-demo-runtime.mjs`,
`tools/secret-scan.mjs`, `tools/public-readiness-check.mjs` (pass-line
strings), `web-template/package.json` (build script).

Re-verification commands for anything that may drift:

```sh
# Script names and check:precommit composition (must NOT include public:check)
grep -A2 '"check:precommit"' package.json && grep '"public:check"' package.json
# Commit-check doctrine in docs of record
grep -n -A8 "Commit Checks" README.md
grep -n -B2 -A10 "## Validation" CLAUDE.md
# Parity rule wording
grep -n "parity" AGENTS.md
# Native build commands as the plugin states them
grep -n "compileDebugKotlin\|xcodebuild" plugins/braze-demo-builder/commands/demo-build.md
# Pass-line strings
grep -n "passed" tools/validate-demo-runtime.mjs tools/secret-scan.mjs tools/public-readiness-check.mjs
```

### CI companion

`.github/workflows/source-distribution.yml` reruns skill distribution, fresh
pack generation, the source/public gates, the web build, and Android
unit/Kotlin compilation on a clean Ubuntu clone. It complements rather than
replaces the local pre-commit gates above.

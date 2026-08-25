# Gate Details And Evidence Standards

Read the section that matches the change under review. The owning workflow is
`../SKILL.md`; this reference supplies conditional detail rather than a second
gate sequence.

## Contents

- [Generated Runtime Changes](#generated-runtime-changes)
- [Native Gate Triggers](#native-gate-triggers)
- [Platform Parity Review](#platform-parity-review)
- [Evidence Matrix](#evidence-matrix)
- [Repository Invariants At Delivery](#repository-invariants-at-delivery)
- [Common Rationalizations](#common-rationalizations)

## Generated Runtime Changes

Treat these as generated-runtime-affecting:

- pack content or schema;
- pack application/generation tooling;
- web runtime configuration or asset packaging;
- Android seed metadata or iOS runtime defaults;
- private `app-source/` mirroring;
- runtime manifest, `configHash`, or `runtimeHash` logic.

Apply the pack before validating. Otherwise the tools can compare stale
generated files with one another instead of proving that current source
regenerates the delivered runtime.

Generated outputs include:

- `web-template/src/brand/activeDemoConfig.generated.ts`;
- `web-template/public/demo-runtime.json`;
- `web-template/public/demo-assets/`;
- Android `.active-demo-pack` and generated seed metadata;
- iOS generated runtime defaults.

Never repair these files directly. Change their source pack or generator and
apply again.

## Native Gate Triggers

Run Android unit tests and Kotlin compilation when changes touch:

- Android Kotlin/Java source;
- `AndroidManifest.xml` or Gradle SDK/resource wiring;
- JS-to-native bridge behavior;
- FCM/push handling or notification presentation;
- WebView source selection, render proof, launch, or emulator operation.

Run iOS contract tests when changes touch:

- credential/profile behavior;
- bridge actions or identity envelopes;
- runtime identity, render proof, or telemetry contracts.

Also generate and compile the iOS simulator project when changes touch Swift
source, `project.yml`, `Info.plist`, launch/build behavior, push registration,
or native dependency wiring.

A pack-only content change does not automatically require native compilation.
A generated value consumed by native code may require it when its shape or
contract changed.

## Platform Parity Review

The parity rule applies to:

- pack application;
- runtime generation;
- asset packaging;
- launch flows;
- SDK bridge behavior;
- Control Room/Demo Cockpit controls.

Inspect the corresponding Android and iOS path even if the requested change
mentions only one platform. Implement the analogous behavior or document a
specific non-applicability reason. Current differences such as iOS requiring
a development server or signed hardware for real push can justify asymmetry;
they do not justify skipping the review.

## Evidence Matrix

| Claim | Minimum evidence |
|---|---|
| Baseline gates pass | Current-session command output and zero exits |
| Android compiles/tests | Gradle unit-test and Kotlin compilation success |
| iOS contract holds | `npm run test:ios-contracts` success |
| iOS native build works | `xcodebuild` ends successfully |
| Web app builds | TypeScript/Vite build exits successfully |
| Generated files agree | Runtime validator success after a fresh apply |
| Repository is sanitized | Secret scan and public-readiness success |
| Screen renders correctly | Visual inspection of the intended runtime |
| SDK action works | Correlated Control Room action, Activity Feed result, and device telemetry |
| Correct pack is deployed | Bundled pack id and `runtimeHash` match the selected pack |
| Active user/workspace is correct | Device identity and selected-pack credential context agree |

Do not use code inspection as a substitute for runtime proof. It can explain
why an implementation should work, but not prove that the launcher, native
shell, SDK, workspace, and rendered source agree.

## Repository Invariants At Delivery

- Treat packs as source of truth and generate content for the active pack
  only.
- Preserve `configHash` as the public configuration fingerprint and
  `runtimeHash` v2 as deployment identity.
- Preserve native SDK ownership; the web template uses only the shared bridge.
- Keep REST keys host-only and customer packs under ignored `.demo-packs/`.
- Preserve SDK device identity unless a reset is an explicit recovery action.
- Keep presenter controls in the Control Room, not in product UI.
- Require bundled Android mode for rehearsal and handoff.
- Preserve monotonic native render evidence and launcher correlation.

## Common Rationalizations

| Rationalization | Required response |
|---|---|
| "It is only documentation." | Run the baseline. Markdown can leak credentials and break source-distributed guidance. |
| "The checks passed earlier." | Re-run for the exact tree being delivered. |
| "`check:precommit` passed, so public readiness is covered." | Run `public:check`; it is separate. |
| "The native change is tiny." | Run the applicable native test/build gate. |
| "The generated file is the quickest fix." | Fix the source pack/generator and re-apply. |
| "The other platform is behind anyway." | Record the concrete parity disposition. |
| "The code path is obvious." | Gather evidence at the level of the claim. |

## Source Checks

Re-verify facts rather than preserving stale prose:

```sh
grep -n '"test:capabilities"\|"check:precommit"\|"public:check"' package.json
grep -n -A18 "## Commit Checks" README.md
grep -n -A28 "## Validation" CLAUDE.md
grep -n "parity\|Before committing" AGENTS.md
```

---
name: lumo-change-control-and-qa
description: >-
  Run the commit, push, pull-request, release, and handoff gates for the Lumo
  Braze Demo Shells repo and report evidence at the level actually verified.
  Use when a request explicitly involves committing, pushing, opening a PR,
  publishing, sharing a handoff, deciding whether completed work is ready, or
  asking which validation gates apply. Do not invoke merely because a task
  edits the repo; the active lifecycle skill should route here when work
  reaches a delivery boundary. Credential or private-material handoff belongs
  to lumo-secrets-and-sanitization instead.
---

# Lumo Change Control and QA

Own the final delivery decision. Run the applicable gates in the current
session and report only what their output proves.

Terms:

- A **pack** is the source `demo-pack.json` plus optional assets and local
  `secrets.properties`; applying it regenerates downstream runtime files.
- `configHash` fingerprints public pack configuration.
- `runtimeHash` v2 fingerprints the active configuration, assets, and private
  app surface.

## Select the Gate

1. Inspect the request and the diff. Do not assume a change is docs-only or
   platform-neutral from its title.
2. Run the baseline for every commit or delivery boundary.
3. Add native checks when native code, bridge behavior, push, manifests,
   runtime identity, or launch flow changed.
4. Review Android/iOS parity when pack application, runtime generation, asset
   packaging, launch flows, SDK bridge behavior, or Control Room controls
   changed.
5. Require observed runtime evidence for behavioral claims.

Read [references/gates-and-evidence.md](references/gates-and-evidence.md)
when the change is native/platform-affecting, generated-runtime-affecting, or
when you need to decide what evidence supports a behavior claim. It contains
the detailed trigger matrix, evidence table, and failure rationalizations; do
not load it for a straightforward docs-only gate run.

## Baseline Commit and Delivery Gates

From the repo root, use the current source-of-truth sequence:

```sh
npm run lumo:apply
npm run check:precommit
npm run public:check
cd web-template && npm run build
```

`check:precommit` currently runs automated Node capability/unit/HTTP tests,
runtime validation, the secret scan, and the agent-skill distribution check.
Use the command's exit status and named pass output as evidence. Never encode
or assert a fixed test count: the suite evolves.

`check:precommit` does not include `public:check`; both are required. A direct
`node tools/check-agent-skills.mjs` run is useful when isolating skill failures,
but is not an additional proof if its invocation already passed inside
`check:precommit`.

For a push, PR, release, repository share, or teammate handoff, the apply must
be fresh for the exact source being delivered. Do not reuse output from an
earlier tree or another session.

Pass criteria:

- Every command exits successfully.
- Runtime, security, public-readiness, and skill-distribution checks print
  their named success result.
- The Vite/TypeScript build completes without errors.
- No output was mocked, inferred, or substituted with an earlier run.

## Conditional Native Gates

For Android shell, bridge, push, manifest, runtime-identity, or launch-flow
changes:

```sh
cd android-shell
./gradlew :app:testDebugUnitTest :app:compileDebugKotlin
```

Require Gradle success and passing Android unit-test output.

For iOS credential, bridge, or runtime-identity contract changes:

```sh
npm run test:ios-contracts
```

When iOS native source, launch flow, project configuration, or build behavior
changed, also generate and compile the simulator project:

```sh
cd ios-shell
xcodegen generate
xcodebuild -project BrazeDemoShell.xcodeproj \
  -scheme BrazeDemoShell -sdk iphonesimulator \
  -derivedDataPath ./DerivedData CODE_SIGNING_ALLOWED=NO build
```

If a listed native gate cannot run on the current host, state that limitation;
do not turn an unrun gate into a pass.

## Platform Parity Decision

For a platform-affecting change, record one of these outcomes:

1. The analogous Android and iOS behavior was implemented and verified.
2. Parity is not applicable, with the concrete reason stated in the handoff,
   commit, or PR description.

Silence is not a parity decision.

## Evidence Discipline

- Report command checks with the actual commands and their observed result.
- Report build success only after the relevant compiler/build command exits
  successfully.
- Report behavior success only after an observed launcher-to-device run with
  correlated Activity Feed/device evidence and matching pack identity.
- Report generated-runtime consistency only after runtime validation passes.
- Report repository sanitization only after both the secret and public checks
  pass.
- Say `not verified` when the matching level of evidence was not collected.

## Stop Conditions

Stop and correct the work before delivery if any of these is true:

- A gate fails or was not run.
- A generated runtime file was hand-edited instead of changing and applying
  the pack.
- A credential, customer name, private pack, or private asset appears in the
  diff.
- The installed app's bundled pack identity differs from the pack being
  changed or deployed.
- A native/platform change has no parity outcome.
- The requested claim is stronger than the observed evidence.

Use `lumo-secrets-and-sanitization` for credential incidents or a detailed
commit-safety review. Use `lumo-diagnostics-and-tooling` to interpret a
failing validation instrument; use `lumo-debugging-playbook` for a failing
runtime behavior.

## Definition of Done

- [ ] Fresh pack apply completed for the delivered tree.
- [ ] Baseline gates passed in this session.
- [ ] Applicable native tests/builds passed.
- [ ] Platform parity was implemented or explicitly dispositioned.
- [ ] Behavioral claims have matching observed evidence.
- [ ] The diff contains no hand-edited generated state, credentials, customer
      references, or private pack material.

## Maintenance

Re-check command composition in `package.json` and gate wording in
`README.md`, `CLAUDE.md`, and `AGENTS.md` before changing this workflow. Do not
hardcode test totals or duplicate implementation details owned by scripts.

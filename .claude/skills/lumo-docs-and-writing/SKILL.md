---
name: lumo-docs-and-writing
description: >-
  Documentation of record for the Lumo Braze Demo Shells repo — which doc owns
  which topic, where new docs go, the house writing style, and which docs must
  move when code changes. Use when someone says "update the docs", "update the
  README", "where do I document this", "write a guide", "write an onboarding
  doc", "add this to AGENTS.md", "house style", "doc style", "rename this
  script/doc", "is solcon-onboarding still current", "which doc covers X", or
  when any change touches npm scripts, pack schema, bootstrap flags, or
  invariants and the matching docs need to follow. Also use before creating any
  new .md file in this repo, and when checking whether a doc edit will pass
  security:scan or public:check.
---

# Lumo docs and writing

This skill owns the documentation of record: the inventory, where new content
goes, the house style, and the code-to-doc sync map. It does not own the facts
inside the docs — each doc and each sibling skill owns its own facts.

Standing rule from the authoring model: if this skill ever conflicts with a
committed doc (`README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/*`,
`demo-packs/README.md`), the committed doc wins. Fix the skill, not the doc.

## Docs inventory (verified 2026-08-25)

| Doc | Role | Notes |
|---|---|---|
| `README.md` | Front door: architecture summary, first run, diagnostics, plugin pointer, secrets model, teammate sharing, commit checks | Keep short; deep detail belongs in `docs/` |
| `AGENTS.md` | Agent/project rules: iOS-Android parity, packs as source of truth, no hand-editing generated files, Control Room as only operator surface, host-only REST keys, identity preservation, pre-commit validation | A rules file, not a manual — one bullet per rule |
| `CLAUDE.md` | Claude-session operating instructions: first-run commands, pack workspaces, plugin load, secrets rules, validation commands | Read automatically by Claude Code sessions |
| `docs/lumo-public-quickstart.md` | Canonical teammate setup: fresh machine flow, Claude setup, committed-vs-local ledger, Android push in own workspace, Zscaler/Pixel 10 emulator, public release checks | The doc to extend for setup/onboarding topics |
| `docs/build-your-first-demo.md` | Canonical post-setup workflow: shape one story, align app and dashboard contracts, create a neutral pack, prove native surfaces, troubleshoot, rehearse, and hand off | The user-facing guide from first prompt through first repeatable demo |
| `docs/demo-runtime-architecture.md` | Runtime spec: ownership, Control Room IA, runtime manifest, bridge sync contract, trust/push readiness, drift prevention | The doc to extend for new invariants and runtime behavior |
| `docs/solcon-onboarding.md` | LEGACY — kept for compatibility; first paragraph points to the quickstart | Do NOT extend. New setup content goes in the quickstart |
| `demo-packs/README.md` | Pack conventions: pack anatomy, required `demo-pack.json` fields, Content Card surfaces, `secrets.properties` shape, REST key resolution | The doc to extend for pack schema changes |
| `web-template/README.md` | Web shell specifics: run, runtime files, bridge contract | Platform-local detail only |
| `android-shell/README.md` | Android shell specifics: what it proves, setup, emulator | Platform-local detail only |
| `ios-shell/README.md` | iOS shell specifics: prerequisites, xcodegen, run | Platform-local detail only |
| `.claude/skills/` | Canonical source-distributed agent runbooks | Auto-discovered by Claude Code; validated by `tools/check-agent-skills.mjs` |
| `plugins/braze-demo-builder/` | Optional namespaced demo-build command | Compatibility entry point; see `lumo-plugin-workflow` |

Not documentation of record: `Braze Design System (Collaborative)/README.md`
(local-only reference dir, gitignored, excluded from scans).

## Where new content goes

| Content type | Destination |
|---|---|
| User-facing setup, operation, troubleshooting | `docs/` — usually extend `docs/lumo-public-quickstart.md`; new file only for a genuinely new topic |
| Runtime behavior, contracts, readiness rules | `docs/demo-runtime-architecture.md` |
| Pack schema, pack fields, pack conventions | `demo-packs/README.md` |
| Platform-specific build/run detail | That shell's own `README.md` |
| A new binding rule for agents/contributors | `AGENTS.md` — sparingly; one imperative bullet, and mirror the rationale in `docs/demo-runtime-architecture.md` if it is a runtime invariant |
| Claude-session behavior in this repo | `CLAUDE.md` |
| Agent workflow teammates must receive | The owning committed `.claude/skills/<skill>/` plus the matching doc of record when user-facing behavior changes |
| Demo discovery, target-belief, experience-blueprint, and scope workflow | `braze-solution-demo-campaign` owns agent behavior; the user-facing first-demo guide explains the outcome and invocation without duplicating the skill |
| Plugin command compatibility | `plugins/braze-demo-builder/`; route to the canonical project skill instead of duplicating operations knowledge |
| Machine-local Claude state | `.claude/settings.local.json`, `.claude/launch.json`, archives, and caches; keep ignored |
| Customer-specific notes | Nowhere committed. `.demo-packs/` or off-repo only |

If you see "should teammates get this?" → yes means committed doc or plugin;
no means this skill library. There is no third option.

## House style (derived by inspecting the committed docs)

- Headings: Title Case with every word capitalized, including short words —
  "Zscaler And Pixel 10 Emulator", "What Must Stay Outside Git",
  "Android Push In Your Own Braze Workspace". Match this, not sentence case.
- Voice: imperative and declarative. "Run these before committing." "Do not
  commit credentials." No marketing tone, no exclamation marks.
- Rules use explicit must/never phrasing: "must stay local", "never write
  them into web assets", "Do not hand-edit generated runtime files."
- Prose hard-wrapped at ~80 columns.
- Commands in fenced blocks tagged `sh` (top-level docs; shell READMEs
  occasionally use `bash` — prefer `sh` for new content). Plain-text
  Claude-command blocks use `text`.
- Paths, commands, filenames, env vars, and pack ids in backticks.
- Lists and short sections over long prose; tables sparingly (the committed
  docs use almost none — bulleted ledgers instead, e.g. "What Comes From
  Git" / "What Must Stay Outside Git").
- No customer or prospect names anywhere committed — docs, commit messages,
  branch names, screenshots, example pack ids. Use `Lumo` or generic examples;
  replace any legacy real-brand id when touching its owning document.
- Placeholders for credentials only: `braze.apiKey=` left empty (as in
  `demo-packs/README.md`) or `<YOUR_..._KEY>` style. Never a realistic-looking
  key, even fake — `security:scan` flags 20+ char values assigned to
  `braze.apiKey`/`apiKey`/`BRAZE_REST_API_KEY*` in ANY committed file,
  markdown included.

## Sync duties: when code changes, which doc moves

| Change | Docs that must move with it |
|---|---|
| npm script rename/add/remove (`package.json`) | `README.md` (First Run, Diagnostics, Commit Checks), `CLAUDE.md`, `docs/lumo-public-quickstart.md`, `docs/demo-runtime-architecture.md` (Drift Prevention), plus every `lumo-*` skill's Provenance section |
| Pack schema change (fields, surfaces, presets) | `demo-packs/README.md`, `tools/validate-demo-runtime.mjs` pack checks, and the build skill (`.claude/skills/braze-demo-app-builder/` + plugin twin) |
| Bootstrap script or flag change | `docs/lumo-public-quickstart.md`, `README.md` First Run, `CLAUDE.md`, shell READMEs that quote the bootstrap flow; `docs/solcon-onboarding.md` only if its pointer breaks |
| New invariant or contract rule | `AGENTS.md` (the rule) + `docs/demo-runtime-architecture.md` (the behavior/why) + `lumo-architecture-contract` skill |
| Secrets model change | `README.md` Local Secrets, quickstart ledger, `demo-packs/README.md`, `CLAUDE.md`, `lumo-secrets-and-sanitization` skill |
| Control Room / launcher UX change | `docs/demo-runtime-architecture.md` (Control Room IA), `lumo-run-and-operate` skill |
| Plugin workflow change | `plugins/braze-demo-builder/` text, `README.md` Agent Demo Build Workflow section, quickstart Claude Setup section |
| New-demo routing or blueprint contract | User-facing first-demo guide, `README.md` Agent Demo Build Workflow, `CLAUDE.md` skill routing, and `lumo-plugin-workflow`; keep implementation commands in their owning skills |

Grep before claiming done — find every doc that quotes the old name:

```sh
grep -rn "old-name" README.md AGENTS.md CLAUDE.md docs/ demo-packs/README.md \
  web-template/README.md android-shell/README.md ios-shell/README.md \
  plugins/ .claude/skills/
```

## How validation interacts with docs

Verified against the tools on 2026-07-03:

- `validate:demo-runtime` (`tools/validate-demo-runtime.mjs`) greps SOURCE
  files only — `web-template/src/braze/*`, Android/iOS shell sources,
  `tools/control-room-template.mjs`, `tools/demo-launcher.mjs`, and the
  Android shell scripts — for required patterns. It does not read any
  markdown. Doc renames and doc edits cannot break it. What DOES break it:
  renaming/moving any of those source files or the strings it pins (it
  hard-codes paths and regexes), which is why doc-driven "cleanup" renames
  of scripts must be treated as code changes, not doc changes.
- `security:scan` (`tools/secret-scan.mjs`) DOES scan markdown content. It
  walks the whole repo (excluding `.git`, `node_modules`, `dist`, `build`,
  `.demo-packs`, the design-system dir, images/binaries) and flags private
  key blocks, `Bearer` tokens, and key-like assignments in any file —
  including docs and this skill library. A doc example like
  `braze.apiKey=abc123...` (20+ chars) fails the scan. Keep values empty or
  angle-bracketed.
- `public:check` (`tools/public-readiness-check.mjs`) re-runs both of the
  above, then checks tracked and visible-untracked paths for sensitive
  names (`secrets.properties`, `local.properties`, `Config.swift`,
  service-account JSON, `.p8`/`.p12`/keystores, `.demo-packs/`). A doc
  cannot pass by being "just markdown" — never paste real values into one.

## Naming and rebrand caution (SolCon → Lumo)

The repo rebranded SolCon → Lumo (commit 9ff55c7) but both names survive on
purpose:

- `bootstrap-solcon.sh` is the real bootstrap script;
  `bootstrap-lumo.sh` is a committed pass-through wrapper that `exec`s it.
- `tools/doctor-solcon.mjs` is the real doctor; `npm run doctor`,
  `bootstrap:check`, and `lumo:doctor` all point at it.
- `docs/solcon-onboarding.md` deliberately keeps `bootstrap-solcon.sh`
  commands and stays as a legacy pointer.
- "SolCon" also appears in security prose (short-lived SolCon handoff keys)
  in `README.md` and the quickstart — that is terminology, not a leftover.

Do not "clean up" SolCon names unilaterally. A rename ripples through
`package.json` scripts, both bootstrap entry points, every doc that quotes
them, and the skills' provenance sections (see sync table above). If asked
to rename, scope it as a full sweep with the grep above and treat it as a
code change with full commit gates.

## Change control

Every committed doc change goes through the same gates as code, with no
docs-only carve-out — see `lumo-change-control-and-qa` Gate 1. README.md
"Commit Checks" and AGENTS.md apply to every commit, docs-only included:

```sh
npm run check:precommit          # tests + runtime validation + secret/skill checks
npm run public:check
cd web-template && npm run build
```

There is no reduced command set for "just docs" — a README or skill file can
leak a key, token, or customer name exactly as easily as code, and
`validate:demo-runtime` / the web build are cheap enough to always run. Never
suggest skipping or narrowing gates because a change is "just docs".

## When NOT to use this skill

- Writing or editing skills in this `.claude/skills/` library still requires
  the repo's security, source-distribution, and change-control gates.
- Deciding commit gates / evidence standards → `lumo-change-control-and-qa`.
- The facts themselves (config keys, commands, pack schema) → the owning
  skill: `lumo-config-and-flags`, `lumo-demo-pack-authoring`,
  `lumo-architecture-contract`, etc.
- Building demo stories/packs/screens → the plugin or
  `braze-demo-app-builder`; routing between them → `lumo-plugin-workflow`.
- Fresh machine setup itself (not documenting it) → `lumo-build-and-env`.

## Provenance and maintenance

Verified 2026-07-03 against the repo at commit 9ff55c7 by reading every doc
listed in the inventory plus `tools/validate-demo-runtime.mjs`,
`tools/secret-scan.mjs`, `tools/public-readiness-check.mjs`, `package.json`,
`.gitignore`, and `bootstrap-lumo.sh`. Re-verify before relying:

- Doc inventory: `ls docs/ *.md */README.md plugins/braze-demo-builder/`
- npm script names: `cat package.json`
- validate greps source-only: `grep -n "readText\|\.md" tools/validate-demo-runtime.mjs`
  (no markdown paths should appear)
- security:scan covers markdown: `grep -n "excludedDirs\|shouldScanFile" tools/secret-scan.mjs`
- Agent bundle passes: `node tools/check-agent-skills.mjs`
- Local Claude state stays local: `git check-ignore -v .claude/settings.local.json .claude/skills.zip`
- SolCon wrapper still pass-through: `cat bootstrap-lumo.sh`
- Legacy doc still points to quickstart: `head -5 docs/solcon-onboarding.md`

### Open questions / candidates

- `demo-studio/` (prebuilt Electron artifact) has no doc of record; if it
  ever becomes supported, it needs a README and an inventory row. Until
  then, do not document it as a supported path.
- Any legacy real-brand example id in committed docs predates the tightened
  no-brand-names rule; replace it with a generic id through the normal
  change-control gates.

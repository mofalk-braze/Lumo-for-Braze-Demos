---
name: lumo-plugin-workflow
description: Router between the committed project skills and the optional braze-demo-builder compatibility plugin in the Lumo Braze Demo Shells repo. Use when someone asks "which tool should I use", "should I use the plugin or a skill", "where does this knowledge go", "how do I run demo-build", "build a demo feature", mentions "plugin", "demo-build", "braze-demo-builder", or "routing", or when deciding whether a change belongs in the plugin, docs, or an owning project skill.
---

# Lumo Plugin Workflow (Tool-Layer Router)

Doctrine: **the plugin builds, the skills operate.** This skill only routes; it
does not contain build or operations instructions.

## The two entry layers

| Layer | Path | Committed? | What it is |
|---|---|---|---|
| Project skills | `.claude/skills/` | Yes (canonical) | Auto-discovered Claude Code runbooks for building, setup, operation, Android push, debugging, packs, secrets, QA, config, docs, and architecture. This is the source of truth for agent workflows. |
| Compatibility plugin | `plugins/braze-demo-builder/` | Yes | Optional Codex/Claude plugin that preserves the namespaced `demo-build` command. It routes build work back to the canonical project skill. |

Load the plugin from the repo root, then invoke its command:

```sh
claude --plugin-dir ./plugins/braze-demo-builder
```

```text
/braze-demo-builder:demo-build
```

## Routing table

| Task looks like | Go to |
|---|---|
| "Now what should I build", incomplete discovery, screenshot folder without a journey, existing Canvas needing an app proof, surface/event selection, or scope pressure | `braze-solution-demo-campaign` |
| Build or change an approved product screen, pack content, Content Card or Banner placement, Control Room preset, launch link, or bridge feature | `/braze-demo-builder:demo-build` (in a plugin session) or the `braze-demo-app-builder` skill |
| Approved blueprint to durable, rehearsed device demo | `lumo-new-demo-campaign` (it delegates the story-building step back to the builder layer) |
| Set up a fresh machine, bootstrap, AVD, Xcode | `lumo-build-and-env` |
| Run a demo, use the Control Room, launch shells, send REST | `lumo-run-and-operate` |
| Pack schema, creating/promoting packs, durable packs | `lumo-demo-pack-authoring` |
| Something is broken (push, IAM, stale runtime, TLS) | `lumo-debugging-playbook`; interpret doctor/validate output with `lumo-diagnostics-and-tooling` |
| Get Android push working on a teammate machine | `lumo-push-readiness-campaign` |
| Keys, credentials, handoff, what may be committed | `lumo-secrets-and-sanitization` |
| Commit gates, validation evidence, publishing changes | `lumo-change-control-and-qa` |
| Look up a config field, env var, launcher flag | `lumo-config-and-flags` |
| How the Braze SDK/REST/push work in this repo | `braze-integration-reference` |
| Design decisions, invariants, why it works this way | `lumo-architecture-contract` |
| Where a new doc goes, house style | `lumo-docs-and-writing` |

## Quick manual edit vs. builder workflow

A trivial fix (typo in pack copy, one field value) is fine by hand — in the
pack, never in generated files, then re-apply with `npm run lumo:apply`. For an
unapproved or ambiguous story, shape and approve the blueprint with
`braze-solution-demo-campaign`. For approved implementation, prefer the builder
workflow: `demo-build.md` enforces implementation intake, a Content Card
advisory pass, Android/iOS parity checks, and validation.

## Where knowledge goes

- Teammates receive committed docs, `.claude/skills/`, the optional plugin,
  sanitized `demo-packs/`, and source. Machine-local Claude settings, archives,
  credentials, and customer packs stay ignored.
- Put an agent workflow in its owning project skill. Put user-facing setup and
  operating instructions in the documentation of record as well. Committed
  docs and code win if a skill ever conflicts with them.
- Treat the plugin as a compatibility entry point, not a second source of
  operational truth. Keep its command aligned with the canonical builder skill.
- Run `node tools/check-agent-skills.mjs` after changing the skill bundle or
  plugin. The check enforces the required inventory, references, metadata,
  sanitization, ignore boundary, and shared builder contract.

## Guidance for AI agents

- In a plain Claude Code session at the repo root, project skills are available
  automatically. Prefer this zero-install path for onboarding and operation.
- In a `claude --plugin-dir ./plugins/braze-demo-builder` session, use
  `/braze-demo-builder:demo-build` when a namespaced command is useful; the
  command must follow the committed `braze-demo-app-builder` project skill.
- Invariant to verify before trusting this routing: the plugin manifests both
  declare `"name": "braze-demo-builder"`; the command file is
  `plugins/braze-demo-builder/commands/demo-build.md`.

## When NOT to use this skill

- Actually building a story/screen/pack: invoke `braze-demo-app-builder` (or
  the plugin command) — do not reconstruct its workflow from here.
- Choosing the target belief, hero journey, event/surface contract, or scope →
  `braze-solution-demo-campaign`.
- Operating, debugging, configuring, or committing: go straight to the named
  lumo-* skill in the routing table.
- Approved end-to-end campaigns: `lumo-new-demo-campaign` or
  `lumo-push-readiness-campaign` inline their own commands.

## Open questions / candidates

- `demo-studio/` is a prebuilt Electron artifact (dist only, no source) —
  experimental; not a supported layer in this routing.

## Provenance and maintenance

Verified 2026-07-03 against the repo. Re-verify with:

- Plugin contents: `find plugins/braze-demo-builder -type f`
- Plugin command name: `cat plugins/braze-demo-builder/.claude-plugin/plugin.json`
- Project bundle: `find .claude/skills -type f`
- Distribution contract: `node tools/check-agent-skills.mjs`
- Local Claude state stays ignored: `git check-ignore -v .claude/settings.local.json .claude/skills.zip`
- Docs of record: README.md "Agent Demo Build Workflow"; docs/lumo-public-quickstart.md "Claude Setup"

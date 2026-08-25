---
description: Compatibility command that routes an approved Braze demo build to the canonical Lumo project workflow.
argument-hint: [approved DEMO.md, pack id, screenshot path, or focused change]
---

Treat `$ARGUMENTS` as the requested demo work.

1. Read `AGENTS.md` and the repository state.
2. If target belief, hero journey, typed signal/surface contract, or non-goals
   are not approved, read
   `.claude/skills/braze-solution-demo-campaign/SKILL.md`, shape the blueprint,
   and stop before implementation until the user approves it.
3. For an approved end-to-end or focused change, read
   `.claude/skills/lumo-new-demo-campaign/SKILL.md` and follow it completely.
4. Read `.claude/skills/braze-demo-app-builder/SKILL.md` only when that
   campaign delegates focused product UI, Content Card, Banner, IAM, push,
   launch-link, Control Room, Android, or iOS implementation mechanics.
5. Keep new private work under `.demo-packs/`; never hand-edit generated files
   or place credentials in committed content.
6. Before claiming completion, follow
   `.claude/skills/lumo-change-control-and-qa/SKILL.md`.

This command is a namespaced compatibility alias. Canonical project skills and
committed code/docs win if any plugin text conflicts.

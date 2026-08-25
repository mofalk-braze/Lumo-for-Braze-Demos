---
name: lumo-plugin-workflow
description: Explain or maintain the optional braze-demo-builder compatibility plugin and its relationship to the canonical repository skills. Invoke manually when someone explicitly asks about the plugin, namespaced demo-build command, plugin manifests, or plugin-versus-project-skill distribution. This is not a general build or task router.
disable-model-invocation: true
---

# Lumo Plugin Compatibility

Repository project skills under `.claude/skills/` are canonical. The optional
`plugins/braze-demo-builder/` package preserves the namespaced
`/braze-demo-builder:demo-build` command; it does not own a second workflow.

## Use The Canonical Route

- Unapproved or ambiguous story: read
  `../braze-solution-demo-campaign/SKILL.md`.
- Approved end-to-end or focused implementation: read
  `../lumo-new-demo-campaign/SKILL.md`.
- Focused implementation mechanics delegated by that campaign: read
  `../braze-demo-app-builder/SKILL.md`.
- Any other Lumo task: start at `../lumo-start-here/SKILL.md`.

The plugin command and plugin skill must remain short pointers to those files.
Do not duplicate pack, Content Card, Banner, Android, iOS, QA, or secrets
instructions in the plugin.

## Compatibility Check

Both manifests must use the same `braze-demo-builder` name and version. Run:

```sh
node tools/check-agent-skills.mjs
```

Fresh SolCons do not need the plugin. Claude Code discovers the committed
project skills directly from the repository. Other agents follow `AGENTS.md`
and read the same repository-owned files; never make a copied machine-global
skill tree authoritative.

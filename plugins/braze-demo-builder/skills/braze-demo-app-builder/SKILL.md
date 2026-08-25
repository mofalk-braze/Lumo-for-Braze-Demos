---
name: braze-demo-app-builder
description: Compatibility pointer for the optional namespaced Braze demo builder. Invoke only in a plugin session for an approved Lumo demo implementation; route ambiguous story selection to the canonical solution campaign first.
disable-model-invocation: true
---

# Braze Demo Builder Compatibility

Project skills are canonical:

- Missing or unapproved story boundary →
  `.claude/skills/braze-solution-demo-campaign/SKILL.md`
- Approved end-to-end or focused implementation →
  `.claude/skills/lumo-new-demo-campaign/SKILL.md`
- Delegated product UI, Content Card, Banner, IAM, push, launch-link, Control
  Room, Android, or iOS mechanics →
  `.claude/skills/braze-demo-app-builder/SKILL.md`

Keep private packs in `.demo-packs/`, preserve platform parity, and follow the
canonical QA and secrets workflows. Do not reproduce their instructions here.

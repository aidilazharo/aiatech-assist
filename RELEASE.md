# ATGV AIATECH Assist v0.0.11

## Changes

- Expand the shared My Work AI chat from 7 to all 18 built-in SDLC roles, including the four optional roles when enabled in Role Management.
- Add host-only, role-specific expert prompts and unique "who are you?" introductions for Product Owner, Scrum Master, Security Engineer, Data Engineer / DBA, Technical Writer, Operations / Support, Release / DevOps, Technical Lead, Business Owner / Approver, AI / ML Engineer and Compliance / Risk Officer.
- Retain existing role prompts for Business Analyst, Solution Architect, UI/UX Designer, Developer, Project Manager, QA Engineer and UAT Tester.
- Keep user-visible chat messages free from injected role instructions, scoped history per role and project, and responses tied to the selected AI provider.
- Continue to use the shared animated multicolor waveform, rapid response typewriter, idle fade and auto-wake behavior throughout My Work.
- Preserve human approval gates, the read-only chat boundary and the ability to enable/disable optional roles independently.

## Validation

- Test that the 18 registered built-in role IDs exactly match all 18 AI profiles and introductions.
- Verify "who are you" without an AI connection for every role; verify model-request expert prompts and isolated conversations for every role.
- Run full regression, Windows validation, theme checks, VSIX compilation, source ZIP and .memory exclusion in GitHub Actions.

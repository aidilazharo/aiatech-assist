# ATGV AIATECH Assist v0.0.71

Release date: 2026-11-23

## Changes
- Store validated non-secret Jira/Confluence, GitHub and Library settings in .atgv/memory/settings.sqlite.
- Make SQLite authoritative after workspace initialization; migrate legacy globalState settings and keep a compatibility mirror.
- Consolidate Start Test & Save, Settings Save Jira and Save GitHub, and Library saves through one storage adapter.
- Keep provider tokens encrypted in credentials.sqlite with the master key in VS Code SecretStorage.
- Simplify duplicate Start and Settings copy, hide duplicate Library pull and API-key actions, and fix inherited SDLC role readiness.
- Preserve existing permission checks, project Jira/Confluence mappings and backward compatibility.

## Verification
- Run connection migration, privacy, UI, Windows reset, full regression and VSIX packaging checks before publication.

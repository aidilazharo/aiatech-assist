# ATGV AIATECH Assist v0.0.14

## Changes

- Fix duplicate Confluence source synchronization conflict messages on the AI-only My Work page.
- Keep the global top notification as the single visible warning, including the View Ownership action and existing safeguards against publishing unresolved source conflicts.
- Suppress page-level feedback on My Work, including previously inserted duplicate warnings when returning to that page.
- Preserve existing inline feedback on Role Workspace and other application pages.
- Preserve animated AI chat, role-specific instructions and all 18 built-in role workflows.

## Validation

- Add regression tests for the AI-only My Work page receiving Confluence conflict and other status messages with no duplicate inline warning.
- Verify global notification rendering and Ownership action remain intact, and other pages retain feedback.
- Run full Node tests, Windows checks, UI validation, build/VSIX integrity and source-only .memory exclusions before merge and publication.

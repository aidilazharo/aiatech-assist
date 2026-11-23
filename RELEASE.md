# ATGV AIATECH Assist v0.0.78

## SQLite synchronization (Jira · Confluence · GitHub)
- Extends v0.0.77's project SQLite sync ledger and Knowledge & RAG status panel.
- Records remote refresh failures as safe, non-secret checkpoint metadata without replacing the last successful read, record count or completeness state.
- Restores the SQLite status panel while the project is offline rather than dropping cached synchronization information.
- Ensures remote refresh messages mention GitHub branch metadata alongside Jira and Confluence.
- Retains read-only remote polling, conflict-aware approved-intent tracking and all platform-specific publish/approval gates.

## Verification
- Regression checks for Jira, Confluence and GitHub sync metadata, stale revisions, failed checkpoints and offline display.
- Existing automated npm tests, Windows checks, UI checks and signed VSIX package verification.
- This release is a code reliability update; production provider permission/configuration tests remain a deployment requirement.

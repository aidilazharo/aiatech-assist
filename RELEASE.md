# ATGV AIATECH Assist v0.0.77

## SQLite connected synchronization
- Reuses the private `.atgv/memory/project-<project-id>.sqlite` database as a local synchronization ledger for Jira, Confluence and GitHub.
- Stores remote IDs, version/commit SHAs, content fingerprints and safe metadata; no tokens, remote issue descriptions or GitHub source files are stored in the new ledger.
- Jira inventory and Knowledge refresh record numeric IDs, statuses and successful scan checkpoints.
- Confluence read refresh records page IDs/versions, and approved document publication journals verified receipts and conflicts.
- GitHub branch metadata records verified commit SHAs without pushing code.
- Knowledge & RAG shows SQLite checkpoints, pending approved intents and unresolved conflicts, with a manual read-only refresh.
- Offline and failed refreshes retain the last successful checkpoint; outbox metadata is audit-only and not automatically replayed.
- Existing role ownership, encrypted credentials and approval-gated publication are unchanged.

## Verification
- Regression tests cover provider isolation, revision conflicts, bad origins, failure recovery and UI actions.
- GitHub Actions checks npm tests, UI theme, Windows reset and VSIX packaging.
- An audited VSIX size ceiling increase of under 1% accommodates the new synchronization ledger.

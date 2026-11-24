# ATGV AIATECH Assist v0.0.79

## ATGV: Workspace source and release sync
- Persist the selected Destination Git folder in VS Code globalState and validate it on reopen.
- Display the copied source code version, pinned source SHA, latest published GitHub release and selected release artifacts during review.
- Download and SHA-256 verify GitHub release binaries and copy them into `release-artifacts/<tag>/` in the destination PR branch alongside code.
- Include a `release.json` manifest with source commit, release target revision, version, asset sizes and checksums.
- Revalidate release metadata before publishing and reject missing, ignored, or inconsistent artifacts before PR creation.
- Preserve existing Source/Destination PAT separation, protected-path filtering and PR review approvals.

## Verification
- Node regression suite, VSIX packaging, version metadata checks and GitHub Actions build validations.
- Release binaries and GitHub PR publishing still require live GitHub connectivity in the user's VS Code runtime.

---

## Previous release: v0.0.78

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

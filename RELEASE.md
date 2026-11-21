# ATGV AIATECH Assist v0.0.23

## Critical Windows Reset repair

- Fix EPERM and EACCES errors during promotion of staged .atgv folders, using bounded retries and a safe exclusive-copy fallback.
- Replace the destructive delete-first flow with a transactional directory swap: hold original .atgv and projects in verified rollback storage until the new directories are validated.
- Roll back both local directories if staging promotion fails, without deleting original user work or modifying remote Jira, Confluence or GitHub data.
- Detect leftover .atgv-reset-staging-* directories from earlier interrupted Resets before starting a new destructive operation.
- When a v0.0.22 reset left .atgv absent and the projects folder empty, restore verified staged .atgv and project folders, then halt for user inspection before any new Reset.
- Refuse to overwrite existing files or guess about conflicts; preserve staging and report recovery locations for manual review.
- Defer noncritical cache/staging cleanup failures instead of reporting an already-committed reset as an incomplete replacement.
- Add regression tests for Windows lock simulation, exclusive copy fallback, successful replacement, rollback on partial failure, old-stage recovery and conflict refusal.

## Verification

Do not merge or release until Node regression, Windows reset check, UI validation and VSIX packaging all pass. Never include .memory in the VSIX or release ZIP.

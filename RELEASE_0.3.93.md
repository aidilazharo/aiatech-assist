# ATGV AIATECH Assist v0.3.93 — Preserve edited catalog during verified pull

## Root cause

The protected `.atgv/sdlc-catalog` checkout contained tracked modifications or untracked files. The previous pull correctly stopped rather than overwrite user data, but offered no non-destructive update workflow.

## Safe recovery

- On a dirty catalog, clone GitHub main to a separate temporary checkout, verify its manifest, origin, branch, clean working tree and expected Git SHA *before* touching the active folder.
- Preserve the entire original checkout, including `.git`, locally modified tracked files and all untracked files, in `.atgv/catalog-local-backups/sdlc-catalog-preserved-<timestamp>-<unique-id>`.
- Activate the verified GitHub main at the same stable `.atgv/sdlc-catalog` path and write the pinned revision metadata.
- If activation fails, restore the original checkout automatically; if a filesystem lock blocks restore, retain the backup with an actionable recovery path.
- Report backup and installation milestones in the existing progress modal and show the backup path in success details.
- No hard reset, stash that can conflict, forced overwrite, user-file deletion or automatic Git commit.

## Validation

- Updated the stable checkout regression to check that modified and untracked files are preserved in the backup while the new main is activated.
- Added failure rollback and invalid-manifest tests to ensure that local data and the prior checkout survive unsuccessful updates.
- Existing catalog tests continue to cover clean fast-forwards and Windows atomic activation/recovery.

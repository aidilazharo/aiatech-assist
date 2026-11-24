# ATGV AIATECH Assist v0.0.93

## Changes

- Sync the latest matching stable extension or library release with source code in one destination PR.
- Verify the exact source tag, code version, required release artifacts and checksums before committing.
- Remove prior tracked, manifest-owned release artifacts while preserving unrelated files.
- Queue approved destination PRs for automatic verified GitHub Release publication after merge using saved credentials and hourly checks while VS Code is running.
- Replace manual release PR/tag fields with automatic release status and a check action. Destination GitHub Actions remain disabled.

## Validation

Regression coverage added for stable release selection, managed artifact cleanup and durable post-merge publication. Main-branch CI is responsible for full tests and VSIX packaging.

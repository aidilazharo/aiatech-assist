# ATGV AIATECH Assist v0.0.6

## Changes

- Fix false Confluence source synchronization conflicts when a local project's baseline journal is missing after an upgrade, reinstall or computer transfer.
- Verify matching Business Requirements, Discovery answers, source document identities, uploaded-file checksums and safe local originals before rebuilding a missing baseline.
- Ignore only Confluence-restore audit events and local revision/transient state for baseline comparison; preserve actual user work and approved Jira identities.
- Prevent the repaired baseline from failing a second stale-hash upload check in the same synchronization run.
- Preserve both local and Confluence versions without overwriting when real content differs; show the affected content categories.
- Prevent duplicate periodic conflict popups while retaining status, error logs and safety checks.
- Keep all `.memory` development guidance in source only, excluded from downloadable VSIX and source ZIP releases.

## Validation

- Confluence vault regression tests for cross-computer restore, verified missing-baseline recovery, real divergent BR protection, attachment checksums and unsafe ID rejection.
- Complete Node regression suite, Windows startup checks, UI theme checks, VSIX and source ZIP verification in GitHub Actions.

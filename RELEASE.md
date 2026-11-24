# ATGV AIATECH Assist v0.0.84

## ATGV: Workspace — publish merged release
- Publish extension VSIX/source ZIP or Library source ZIP and verified checksums directly to the approved AIA Malaysia GitHub Releases repository after the destination PR merges into main.
- Require full main-to-main source synchronization and exact published source revision for approved distribution pairs.
- Verify source tag, source version, merged PR, current main source projection, Git artifact blob identities and SHA-256 checksums.
- Create a draft, upload missing assets, verify downloaded bytes, then publish as latest stable release; reject conflicts, overwrites and downgrades.
- Retry an identical draft from the Workspace panel using saved repository connections, PR number and exact release tag. No cross-repository GitHub Actions enabled.
- Retain v0.0.83 frontend/backend preview changes.

## Verification
Node regression tests, Windows startup/reset and VSIX build required. Live destination publication requires approved PATs and a merged PR.

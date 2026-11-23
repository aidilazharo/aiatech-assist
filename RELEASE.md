# ATGV AIATECH Assist v0.0.79

## aiMalaysia-only GitHub routing
- Remove legacy GitHub owner and release mirror URLs from runtime routing.
- Source repositories: aiMalaysia Extension and Enterprise Skills.
- Release destinations: aiMalaysia/extension and aiMalaysia/library.
- Reject legacy owner selection during startup and prevent fallback to the removed source.

## ATGV: Workspace GitHub Release artifacts
- Add explicit Extension/Library Release copy action with an optional exact version tag.
- Download and verify the release archive/VSIX and its SHA-256 file before uploading.
- Preserve release notes, enforce source identity, prevent conflicting overwrites and report progress/errors.

## Verification
- Static and mock-driven checks are required; live aiMalaysia GitHub destinations must be reachable before publication.

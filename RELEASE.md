# ATGV AIATECH Assist v0.1.6

## Changes

- Display Extension and SDLC Library source/destination sync forms on one Workspace page, with independent remembered connection selections, folder paths and review state.
- Preserve existing Extension settings and keep PATs in SecretStorage by repository identity, including release-queue compatibility.
- Use a disposable destination checkout in initially empty folders. After successful PR creation, remove only the verified clean temporary checkout; preserve existing repositories, failed/branch-only runs and unexpected files.

## Validation

Targeted host/client syntax, unique form IDs and profile key checks passed in an isolated JavaScript environment. Full Node regression tests and live GitHub PR creation/cleanup not run; no VSIX packaged.

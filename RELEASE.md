# ATGV AIATECH Assist v0.0.2

## Changes

- Record RELEASE-0002: `.memory` remains Git source-only, excluded from every release package.
- Exclude `.memory` from VSIX and source ZIP builds and validate archive entry lists.
- Keep runtime version policy and AI context loading safe when source-only `.memory` is absent.
- Continue maintaining one overwritten RELEASE.md and strictly incremental releases.

## Validation

- Regression, Windows startup, UI checks, VSIX activation and release artifact exclusion checks.

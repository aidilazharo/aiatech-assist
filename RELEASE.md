# ATGV AIATECH Assist v0.0.3

## Changes

- Continue excluding source-only `.memory` from all VSIX and source ZIP release artifacts.
- Ensure memory-dependent tests pass both in Git source and in extracted release ZIPs with `.memory` absent.
- Add extracted-archive test execution to the release workflow.
- Record RELEASE-0003 and retain the single overwritten RELEASE.md.

## Verification

- Node regressions, Windows startup, VSIX activation, source ZIP exclusion and extracted ZIP tests.

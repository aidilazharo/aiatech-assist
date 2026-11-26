# ATGV AIATECH Assist v0.1.48

## Changes

- Restore Windows x64 project dependency bundles with Windows tar.exe, without PowerShell.
- Validate archive paths, entry types, duplicate names and expansion size before extraction.
- Reject partial bundle publication rather than falling back to npm.
- Retry verified offline restoration when a cached module tree is incomplete.

## Validation

- Added regression tests for archive preflight and incomplete publication. Full regression and Windows runtime tests pending; local VSIX not built.

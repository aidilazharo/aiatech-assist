# ATGV AIATECH Assist v0.1.49

## Changes

- Allow local Custom Stack scans and runs despite a different existing Git origin; preserve source and origin.
- Keep remote operations protected by origin verification.
- Replace folder Quick Pick with a radio-button modal. Explicit Scan Folder always offers selection, including a single available folder; remember the previous selection.

## Validation

- JavaScript syntax checked. Added regression tests for local origin mismatch and explicit folder selection. Full Windows tests and VSIX packaging not run.

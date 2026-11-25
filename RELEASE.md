# ATGV AIATECH Assist v0.1.32

## Changes

- Pull opted-in bundled projects from the selected nested project Git checkout; retain the current branch for ATGV-managed preview.
- Restore Windows x64 Node.js 24 dependencies from lockfile-bound split archives tracked in the project repository, with SHA-256 verification, safe extraction and read-only npm validation.
- Skip npm install and npm ci for opted-in applications; fail clearly if the bundle is missing or incompatible. Restore both frontend and backend for a detected full-stack project and reuse the shared helper in Developer worktrees.

## Validation

- JavaScript syntax checked and regression coverage added for missing bundles, platform isolation and manifest fingerprinting. Full regression, Windows archive extraction, runtime and VSIX packaging have not been verified. Windows bundle publication depends on the project build workflow.

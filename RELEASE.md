# ATGV AIATECH Assist v0.0.81

## Development-hosted AIA Malaysia distribution
- Synchronize the exact verified development main revision to a versioned destination branch and create a PR.
- Copy tracked source objects without changing destination .git, .github, action manifests or destination-only files.
- Require reviewed destination PR merge and byte-identical source projection before publishing releases from development CI.
- Verify all six source artifacts and both checksums, publish a draft before promoting to latest, and prevent overwrites and downgrades.
- Keep all GitHub Actions in the development repository. Use approved AIAMALAYSIA_PAT credentials and manual dry-run controls.

## Verification
- Local Git overlay and checksum tests, regression suite, Windows reset and VSIX build checks.
- Live destination synchronization requires an approved secret and repository permissions; it is not implied by passing source CI.

# ATGV AIATECH Assist v0.0.40

## Changes

- Stop repeated SDLC Library update prompts when the installed Library version matches a public release but the local release-build tag is absent or unverified.
- Respect the previously shown update notification across ATGV restarts instead of forcing the same prompt again.
- Permit a verified, newer same-version source-build ZIP to install when the configured aidilazharo GitHub main branch is on the same semantic version; preserve owner-specific source restrictions and checksum verification.
- Show source build numbers alongside Library versions in update prompts, so same-version build upgrades are understandable.

## Validation

- Automated regressions cover missing build metadata, equal/newer/older releases, persisted startup prompts, same-version ZIP installation routing, and build numbers in the popup.
- The GitHub release workflow runs the full Node regression suite, theme checks, Windows reset tests, and VSIX activation/package verification.

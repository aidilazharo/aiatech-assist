# ATGV AIATECH Assist v0.0.0

## Clean release baseline

- Restart extension SemVer at `0.0.0` while preserving extension code, project data contracts, Jira identities, source history and CI checks.
- Keep a single overwritten `RELEASE.md` for each subsequent extension release.
- Remove obsolete UI/UX release notes and unused HTML developer stepper preview.
- Add one-time removal of historical GitHub Releases and their corresponding release tags, excluding the new v0.0.0 baseline release.
- Preserve required bundled offline parser assets, active media and regression test fixtures.

## Compatibility note

Existing installations using the previous `0.4.x` version line may not automatically upgrade to a numerically lower `0.0.0` build. A manual installation or explicit migration will be required.

# ATGV AIATECH Assist v0.1.38

## Changes

- Add ATGV Version to the Overview My Work Users table. Report the locally installed extension package version for the verified registered Jira account during roster sync; never report versions for cancelled or pending registration.
- Keep per-user last reported version and version-change timestamp in a separate Confluence database content property to preserve compatibility with older roster clients. Support upgrades and downgrades; unchanged versions do not trigger additional property writes.
- Display Unknown for users who have not reported a version and surface synchronization failures. Multiple devices sharing one account show the last reported version, not a live device inventory.

## Validation

- Twelve simulated registration/Overview tests and one mocked Confluence version-property scenario passed. Changed JavaScript syntax checked. Full regression suite, live Confluence/VS Code UI and VSIX packaging remain unverified.

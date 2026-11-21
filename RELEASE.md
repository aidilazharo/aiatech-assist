# ATGV AIATECH Assist v0.0.22

## Changes

- Select extension and Library source repositories from the configured GitHub organization, with exact owner-specific mappings for aidilazharo and aiamalaysia.
- Always use aidilazharo/extension and aidilazharo/library as public distribution repositories, regardless of selected organization.
- Prioritize the selected owner's verified Library main branch when pulling. Verify VERSION, catalog.json and the pinned Git commit.
- Never downgrade a newer installed Library to an older source or mirror snapshot; do not treat a public Library mirror as an aiamalaysia source.
- Fallback to the checksum-verified public Library mirror only for the matching aidilazharo source if private source access is unavailable.
- Check the selected Library source during explicit Check Updates and clearly distinguish source/main, installed and release mirror versions.
- Add routing and source-check regression tests for both organizations and no-downgrade controls.

## Release verification

Require Node regression, UI, Windows and VSIX packaging checks to pass before merge. Keep .memory excluded from distributed archives.

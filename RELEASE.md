# ATGV AIATECH Assist v0.0.17

## Changes

- Remove the four repository URL rows from ATGV: Start: Extension (required), Library (required), Extension releases (optional), and Library releases (optional).
- Remove the now-unused startup repository list renderer, empty preview container, and related styling.
- Preserve the GitHub organization and Project Repository input fields, the dynamic preview of the selected project's repository URL, PAT settings, connection permissions, and underlying extension/library synchronization.
- Keep all project data, Jira/Confluence connections, developer workflows and AI chat behavior unchanged.
- Add a regression test for the absent listing and for valid/invalid project repository previews.

## Release validation

Run Node regression suite, UI checks, Windows verification and VSIX/archive checks on the exact PR head before merging. Publish verified VSIX, checksum and source ZIP from main after the required checks succeed. Keep .memory in Git development source only, excluded from distribution packages.

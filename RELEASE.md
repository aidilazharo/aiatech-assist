# ATGV AIATECH Assist v0.0.94

## Changes

- Automatically copy the latest matching stable extension and library release assets into the same destination PR as source changes; verify checksums and remove prior manifest-owned artifacts.
- Publish the destination release automatically after the destination PR merges, using the persisted release queue while VS Code runs.
- Remove redundant Business Requirements overview and hide empty in-progress cards; add Project Items navigation and linked BR details in Jira DataTables.
- Default to Business Analyst, Project Manager, Solution Architect, UI/UX Designer, Developer and UAT Tester; retain other roles and saved selections in Settings.
- Initialize a dedicated local Git repository for new catalog-stack selections; publish explicitly to GitHub and update the project URL after remote verification. Preserve prior local repositories.
- Update regression fixtures to reflect the six-role default while preserving role document and symlink safety coverage.

## Validation

Main-branch build and regression checks are required before publishing a VSIX.

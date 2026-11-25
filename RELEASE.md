# ATGV AIATECH Assist v0.1.3

## Changes

- Correct two stale regression tests from v0.1.2 to reflect role-specific BR assignment, including exact BR matching and exclusion of shared parents and other roles.
- Use the Developer-only published Jira task mapping for TDD recovery history, and make the TDD planning prompt explicitly exclude shared parents and specialist tasks.
- Retain the v0.1.2 role assignment and v0.1.1 BR publishing behavior.

## Validation

- macOS v0.1.2 log reported 2,662 passing, two failing and three skipped tests. Both failing expectations have been updated and targeted source-function checks passed in an isolated JavaScript sandbox. Full Node regression suite and VSIX packaging have not been run for this version.

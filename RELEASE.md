# ATGV AIATECH Assist v0.0.65

Release date: 2026-11-23

## Start screen and permission notification corrections

- Always open **Technology stack prerequisites** first when users run ATGV: Start, even if previous prerequisite and connection checks were completed.
- Retain manual Next, connection validation, project selection and restricted offline access; do not auto-open the previous project.
- Correct the persistent permission notification beneath the main header to use a red border and red warning icon instead of amber.
- Distinguish missing project-level Jira and Confluence keys, unavailable Atlassian credentials, API check errors and actually unverified permissions. Do not mislabel configuration gaps as denied permissions.
- Verify Confluence read on the selected space and Create Page using the documented v2 space permitted-operations endpoint, with a read-only include-operations fallback for older providers.
- Maintain role gating: all roles require Jira/Confluence read and write and GitHub read, while Developer additionally requires GitHub write. Never elevate permissions or bypass operation-level checks.
- Recheck role access when relevant project/extension configuration changes; keep Recheck and Settings controls.

## Validation

- Added v0.0.65 regression tests for initial setup screen, red alert border, missing project mappings, Confluence operation response compatibility, and Developer-only GitHub write.
- Require GitHub pull-request CI and main-branch release workflow to pass before publishing the verified VSIX/checksum.

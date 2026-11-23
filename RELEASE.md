# ATGV AIATECH Assist v0.0.74

## Changes
- New Jira Preview responsible-role selector with all 18 ATGV SDLC roles; conservative task-title suggestions for UI/UX, Developer, PM, architecture, BA, QA and related roles.
- Jira creates receive role labels, and published issue role changes are conflict-checked before controlled update; existing assigned users are never silently reassigned.
- Jira metadata-driven preflight no longer writes generic missing-information placeholders. Required unresolved fields block publication; optional unsupported fields are not filled.
- Acceptance Criteria and Definition of Done are taken only from approved evidence, explicit BA edits or approved project DoD templates. Draft TRM checklists are not silently adopted.
- Existing BR revision history, manual Jira preview approval and stable issue-key reconciliation are retained.

## Verification
- New regression tests: test/v074-jira-role-field-safety.test.js.
- GitHub workflow runs npm test, Windows verification and VSIX packaging before creating a prerelease.
- Live Jira account assignment and site-specific field permission checks require integration testing.

# ATGV AIATECH Assist v0.0.51

## Business Requirements ownership and UI

- Replace the Jira-only BR Delete Jira BR text button with a compact accessible delete icon; existing irreversible-deletion confirmation remains intact.
- Add Transfer BR to the BR details modal. Show verified project-roster Business Analyst users and require Jira Browse Projects / Modify Reporter permissions.
- Validate original Jira Epic, active project, registered roles, current Creator/Reporter identity, and issue revision before updating the Epic Reporter field.
- Display true transfer progress and show **Transfer completed** only after a fresh Jira read confirms the selected owner.
- Refresh All Jira Project Items after success and show a **BR owner** column from Jira Reporter. **Created by** remains Jira's immutable original Creator.
- Do not change child issue assignees or pretend Jira Creator is editable.
- Remove New Business Requirement and Restart from the Business Requirement in Progress card; retain Resume and Delete.
- Add regression tests for permissions, reporter verification, UI wiring and rollback.

## Validation

- Automated GitHub workflow runs tests and packages the VSIX after merge to main. Build status must be checked before treating the release as downloadable.

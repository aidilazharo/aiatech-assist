# ATGV AIATECH Assist v0.0.65

Release date: 2026-11-23

## Business Requirements — progressive completed sections

- Start every Business Requirements accordion collapsed, including Business Documents and Jira Work Items.
- Show an artifact section in the normal list only when its corresponding existing readiness evidence is complete; remove incomplete Draft rows from the default view.
- Add **Open current section** to explicitly reveal unfinished work (including the initial document upload) without blocking the workflow.
- Keep completed sections independently expandable for review; collapse an in-progress section once its stage becomes complete, and reset all expansion state when changing project or leaving the page.
- Show Completed requirements history only where locally recorded cycles or linked published Jira records exist.
- Move Jira Work Items list/hierarchy and issue-category DataTable icon controls from the section heading to the expanded section body; retain tooltips and accessible labels.
- Preserve existing Jira publish, refresh, stop, document edit, discovery and milestone handlers.

## Validation and publication

- Added `test/v065-ba-collapsed-completed-artifacts.test.js` with completion-visibility and progressive-navigation coverage.
- Updated `test/ba-business-documents-single-toolbar.test.js` to expect the Jira DataTable toolbar inside the panel.
- Static syntax/structure checks completed; repository CI must pass before merge and VSIX publication.

# ATGV AIATECH Assist v0.0.67

Release date: 2026-11-23

## Unified ATGV interface

- Add one shared, last-loaded presentation layer (`media/atgv-consistency.css`) for Overview, Startup, Settings, Project, BA, SA, UI/UX, Developer, PM and other role workspaces; respect VS Code themes, accessibility focus and reduced-motion preferences.
- Fix the blank startup by rendering the Technology stack prerequisites panel directly in initial HTML, without requiring successful host-state hydration. Startup checks and manual Next remain unchanged, and each ATGV Start command begins with the prerequisites step.
- Move **Previous** to the far-left of project selection and log/optional **Skip · Enter ATGV** controls to the far-right.
- Hide **Skip · Enter ATGV** when both Jira and Confluence account checks are verified; GitHub write is not part of this visibility rule. Other roles' remote-operation permission rules stay enforced.
- Move the Jira Work Items list/hierarchy/type filter icons from the section summary into an inner, top-right toolbar above the DataTable. Summary keeps only title and readiness status.
- Apply one green outline, padding, shape and text scale to every **Ready** indicator, including Business Documents and Completed Requirements; keep warning/error states distinct.
- Harmonize button sizing, field radii, status pills, panel spacing, table headers/pagination and keyboard focus across the extension without changing backend actions, Jira data or task workflows.

## Testing and release
- Added `test/v067-ui-consistency.test.js` to protect nonblank startup, credential-aware Skip visibility, Jira toolbar placement, status consistency and shared theme use.
- Publish only after required GitHub Actions Linux/Windows tests and VSIX packaging succeed.

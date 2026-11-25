# ATGV AIATECH Assist v0.1.24

## Changes
- Verify the selected project repository separately from the approved extension and library distribution repositories.
- Defer AIA distribution probes during personal-account project setup without changing the approved distribution mapping or replacing its saved catalog token.
- Verify repository contents using the branch listing, supporting empty repositories and non-main default branches without mutating remote content.
- Prioritize project connection failures, include the failing GitHub API endpoint, and show a project-specific connection summary. Jira and Confluence remain the only required startup checks.
- Add regression coverage for project switching, empty and non-main repositories, and advisory HTTP 404 diagnostics.

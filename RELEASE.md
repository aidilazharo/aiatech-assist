# ATGV AIATECH Assist v0.4.47

## Startup and project opening performance

- Begin scanning technology stack prerequisites immediately after the Start webview is loaded, before the heavyweight dashboard data snapshot is ready.
- Restore saved (nonsecret) Jira, Confluence and GitHub connection fields immediately. Verify credentials using the existing secure-store and live checks before allowing authenticated operations.
- Cache startup verification for UI rendering for up to 30 seconds; startup authorization and Test & Save still use fresh secure-store checks.
- Parallelize independent, read-only Jira account, Jira project/type, Confluence space and optional project GitHub repository checks; preserve all required security and permission gates.
- Avoid an extra full dashboard refresh and repeated recent-project writes after successfully opening the project.
- Hide the optional GitHub Copilot SDK tile and placeholder 'Checking permissions…' message from the prerequisite card. Permission checks continue to run and gate startup normally.
- Remove the hover background behind the prerequisite scan status, the redundant footer top divider, and the default 'Choose a project to open.' hint.
- Disable all project-opening actions immediately after a click and render them solid dark gray while the project progress bar is running. Label the selected button 'Opening…' until completion or error.
- Verify that the 12 Discovery Questions are rendered in a single set without an intentional Question 13; rendering replaces existing question nodes rather than appending duplicate groups.

## Compatibility and safety

- No changes to existing BRs, Jira issues, source documents or approval history.
- No credentials are sent to the webview; only previously saved nonsecret connection fields are prefilled.
- Disabled/hidden startup visuals do not bypass workspace permission checks, Jira authentication or Confluence access checks.
- New regressions cover startup scan order, UI gating, API verification concurrency, and the 12-question list.

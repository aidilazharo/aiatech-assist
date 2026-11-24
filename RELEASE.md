# ATGV AIATECH Assist v0.0.86

- Align Business Analyst and Project Manager Jira project tables with shared BR, Jira key, type, summary, role, assignee, priority, status, due date, updated, BR owner, creator and created columns; retain role-specific actions.
- Resolve role display from actual ATGV Jira role labels; show missing or conflicting roles explicitly. BR relationships follow verified local mappings or Jira parent links, never fabricated local approval.
- Add BR and role filters in Project Manager and role filter in Business Analyst. Add role to developer/designer Jira tables without changing assignment authority.
- Show only one BR modal title; preserve modal actions and status. Render tooltips above modal/scroll containers with viewport clamping and keyboard dismissal.
- Retain v0.0.85 Business Documents and field selection, v0.0.84 release publication, and v0.0.83 full-stack previews. Update older UI assertions for the new single-source document controls.

Validation: CI regression, Windows startup/reset, UI theme and VSIX package required before release.

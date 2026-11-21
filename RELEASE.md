# ATGV AIATECH Assist v0.0.13

## Changes

- Separate My Work into an AI-only page for all 18 built-in SDLC roles. Keep the reactive multicolor waveform, fast typewriter, role-aware AI suggestions and chat composer together.
- Add a dedicated Role Workspace page, accessible from the sidebar, for the role's existing dashboards, requirements, Jira items, architecture bootstrap, UI/UX workspace, developer tasks, project management, role progress, readiness, handoffs and other workflows.
- Preserve existing role-specific workflow DOM, element IDs, approvals, Jira operations, AI prompts, status updates and unsaved-work guards by keeping their content in the existing work container.
- Make selecting a role from My Work open its AI-only page; when changing roles inside Role Workspace, keep the user in the workflow page.
- Route AI next-action buttons to the correct BA or role workspace and preserve UX Design Preview return navigation.
- Update breadcrumbs to My Work / Role Workspace / role or Business Requirement / ticket, maintaining valid navigation to previous pages.
- Preserve read-only AI chat and per-project/per-role conversation boundaries.

## Validation

- Verify the AI-only My Work markup has no role task/workflow controls and Role Workspace preserves all existing role sections.
- Verify all 18 roles and both sidebar routes, BA workflows, developer/architect/PM/UIUX paths, role switching, AI suggestions and breadcrumbs.
- Run full Node regression, Windows startup, UI theme, verified VSIX, source ZIP, checksum and source-only .memory exclusion before releasing.

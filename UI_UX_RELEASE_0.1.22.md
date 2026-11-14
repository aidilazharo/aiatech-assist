# ATGV v0.1.22 — UI/UX consolidation

- Shared semantic success/warning/failure/running/pending status classification for key cards and feedback.
- Flat navigation icons replace mixed text-symbol icons in the sidebar.
- Removed double ellipses from BR and Design menus; normalized SVG-only action buttons.
- Consolidated multi-action role handoff cards to a single primary action and an accessible secondary-action menu, without changing individual handlers.
- Review-complete actions no longer clutter the AI Review header; saved evidence remains visible.
- Disabled up-to-date Business Requirements regeneration action is hidden; new changes still expose regeneration.
- Added inline feedback to the Business Requirements page and made success/error/warning semantics consistent across pages.
- Escape and outside click close open secondary-action menus.
- No Jira/Confluence operations executed by the release build.

## Safety and limits
The project contains host/workspace roles, controls and external API flows; no live VS Code, Atlassian sandbox or multi-user write test is implied. UI behavior should be accepted in VS Code using representative projects, including both dark and light themes. Functional work on impact analysis and Jira-server protections remains separate from UI completion.

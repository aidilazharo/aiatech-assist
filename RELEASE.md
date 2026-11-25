# ATGV AIATECH Assist v0.1.8

- Epic assignment displays independent SDLC role groups, current assignees and role-matched user selectors. Each assignment updates only that role’s mapped Jira work.
- Include explicitly scoped Stories and Features, Tasks and Subtasks; leave shared parents and unmapped work unchanged.
- Verify project, current revision, mapped role, parent and assignability for all selected work; retain rollback and refresh after each assignment.
- Updated PM and My Work regression tests; explicit role-mapped Stories and Features also participate in My Work role ownership. Shared parents are never implicitly Developer-owned. Targeted isolated JavaScript checks passed; full Node regression and live Jira validation not run. No VSIX generated.

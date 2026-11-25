# ATGV AIATECH Assist v0.1.18

- Independent BR ownership per enabled SDLC role, including zero-task BRs; shared versioned Confluence registry keyed by Jira Epic and role with immutable Jira issue ID.
- PM and My Work support persistent role assignments. Existing role tasks remain independently verified; shared hierarchy and other roles remain unchanged.
- Full My Work Jira refresh automatically assigns unassigned matching descendants to a recorded owner, respecting Jira Assign Issues permission and reporting conflicts. Developer/UIUX waiting BRs are visible without enabling execution.
- Existing npm policy recovery remains unchanged. Shared role ownership is saved before Jira task writes; partial synchronization is explicitly reported. No automatic overwrite of another Jira assignee. Live company validation and full regression pending.

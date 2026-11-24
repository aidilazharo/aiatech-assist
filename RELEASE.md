# ATGV AIATECH Assist v0.0.87

- Preserve verified completed application source in a local Git commit and use it as the baseline for subsequent BR revisions, retaining SA-approved stack ancestry and prior run evidence.
- Reject obsolete or externally changed BRs and require current approved design evidence for mapped UX work.
- Verify Jira assignees before and after republish transitions and updates; reopen active linked non-To-Do statuses when an exact transition is available.
- Display assigned To Do BR work as New, not In Progress merely because an assignee exists.
- Add focused regression test definitions for revision baselines, design gates and Jira reopening.

Retains v0.0.84–v0.0.86 pending changes. No cross-repository publication or runtime update URL changes.

Remaining: live three-cycle Cat CRUD execution, deterministic visual prototype fidelity/browser comparisons, direct Jira-to-BR AI revision integration, durable application database/migration support, all publication-path reopening and role-map coverage. CI and VSIX validation required before release.

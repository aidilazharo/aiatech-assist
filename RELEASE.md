# ATGV AIATECH Assist v0.1.21

- Build a read-only, role-facing approved BR snapshot from verified published Jira Epics and live descendants, independently of local BA drafts or Confluence recovery. Preserve exact published descriptions and explicit acceptance criteria/definition of done, including named custom fields.
- Store semantic revisions and history in project SQLite; unchanged assignment/status changes do not create a content revision. Fresh complete verification is required before execution; unverified roots fail closed.
- Refresh on project open, role switch, complete Jira inventory refresh, periodic source synchronization and before Developer/UX work. Keep BA draft and publication register unchanged.
- Retain explicit role mappings/labels and legacy verified development mappings, never infer an assignee from a roster or shared parent. Developer and UX use role-specific views and display recovery warnings.
- Existing architectural execution approval and task ownership gates retained. Full regression, live company testing and VSIX packaging pending.

- Follow-up: persist the verified Epic marker and stable published approval timestamp; use the same live published snapshot for UI/UX review and frontend publication; group Designer Jira choices by BR; refresh the snapshot immediately after BR publication and query only the latest cached revision per Epic.

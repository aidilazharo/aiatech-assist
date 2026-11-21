# ATGV AIATECH Assist v0.0.15

## Changes

- Add a project-scoped Confluence activity registry for all ATGV roles with version-checked updates, bounded metadata, and optimistic concurrency retries.
- Synchronize newly generated and edited BR drafts, revisions and approvals as lightweight project activity.
- Capture developer branch starts, developer-initiated Jira transitions, and verified delivery completion events.
- Queue project activity locally when Confluence is unavailable and retry on project open and the existing periodic synchronization interval.
- Ground My Work role chat in current shared project events plus live Jira issue state, without confusing an In Progress ticket with a confirmed development start.
- Provide proactive read-only Resume BR suggestions for Business Analysts and active Jira review suggestions for Project Managers.
- Preserve existing project documents, Jira and GitHub as authoritative sources, and require AI-provider sharing consent for project activity metadata.
- Keep source-only .memory excluded from release packages.

## Validation

- Add Node regression coverage for project isolation, Confluence page creation, optimistic concurrency, idempotent updates, project-scoped Jira activity, and invalid event rejection.
- Execute the complete GitHub CI test, platform and VSIX verification workflows before merging and publishing.

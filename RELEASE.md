# ATGV AIATECH Assist v0.0.25

## Jira-only BR deletion by verified Creator or Reporter

- When a Business Requirement exists in Jira but the original local register was deleted or reset, show **Delete Jira BR** next to **Recover from Confluence**.
- Authorize the deletion request if the signed-in Jira account ID exactly matches either the Epic's `creator.accountId` or `reporter.accountId`.
- Independently require the Jira project **Browse Projects** and **Delete Issues** permissions; matching Creator/Reporter alone never bypasses Jira authorization.
- Verify the project, Jira Epic issue type, BR identifier in the Epic summary and each descendant's real `parent` link.
- Include the Epic and every discovered parent-linked Feature, User Story, Task, Subtask or other issue type in the complete, read-only Markdown deletion preview.
- Require a warning modal and an exact typed phrase `DELETE BR <BR-ID> <EPIC-KEY>` before any deletion.
- Journal remote attempts and process deepest descendants first, explicitly setting `deleteSubtasks=false` to avoid unreviewed cascade deletion.
- Fail closed on missing permissions, a different signed-in account, cross-project children, changed issue identity, unexpected children, incomplete pagination, duplicate keys, or a divergent local BR register.
- Abort uncertain partial deletions for manual reconciliation rather than automatically repeating potentially successful destructive requests.
- Record the completed Jira-only deletion in the local BR history to prevent accidental rediscovery or an unsafe re-restore.
- **No Confluence source documents, pages, Jira issues outside the verified Epic hierarchy, or unrelated projects are deleted.**

## Regression and release verification

- Add tests covering Creator match, Reporter match, denial for unrelated account, Jira permission checks, ownership conflicts, cross-project descendants, changed issue detection, deepest-first deletion and exact user confirmation.
- Preserve ATGV v0.0.24 Confluence Database v2 roster, User DataTables, source-vault recovery and Reset backup safeguards.
- Run the full Node test suite, Windows Reset checks, UI validation and VSIX build before merge and release.
- Never bundle `.memory` in published extension binaries or source archives.

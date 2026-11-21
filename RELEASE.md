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

## Personalized My Work daily briefing and persistent Next Action

- Greet the signed-in user on opening My Work using a best-effort friendly name derived from their Jira email, with verified Jira display name as a fallback and no email address exposed in the greeting.
- Evaluate saved project deadlines against visible unfinished role work and available Jira activity. Present delivery-health assessments with evidence limitations instead of inventing a project forecast.
- Highlight other distinct Jira/Confluence project members, their recorded roles, and summarized assigned Jira task counts. Never claim that roster entries indicate a user is online.
- Suggest today's role-specific pending work and missing Jira/Confluence/deadline settings.
- Always show the **What to do next** button outside the AI-response container, including while AI is thinking or offline. Route to verified project settings, the selected role workspace, or project selection.
- Refresh deterministic briefings from the extension host; do not expose hidden role prompts or use AI-generated links for navigation.
- Include all 18 SDLC roles in the project user roster rather than limiting it to seven roles.

## All 18 role-specific AI agents and source-only harness memory

- Register accepted 18-role ownership and handoff decisions in `.memory/role-boundaries.json`, `.memory/ai-agents.json` and `AGENTS.md`, without bundling coding memory in the VSIX.
- Use the active role’s own expert persona and Library role/SKILL.md; review questions about other roles remain in the current role.
- Route explicit requests to create another specialist’s exclusive deliverable before contacting the AI model. For example, a Project Manager creating a UI mockup receives **Switch to UI/UX Designer**, not a mockup created under PM.
- Keep role changes entirely user-initiated, verify whether the target specialist is enabled, offer Role Settings for disabled roles, and preserve the original request as an unsent draft.
- Never automatically reassign roles, transfer private chat history, or bypass independent approval/permission checks. Preserve a persistent **What to do next** button for every role.
- Extend role ownership and UI regression tests to all 18 specialist roles and informational cross-team exceptions.

## Regression and release verification

- Add tests covering Creator match, Reporter match, denial for unrelated account, Jira permission checks, ownership conflicts, cross-project descendants, changed issue detection, deepest-first deletion and exact user confirmation.
- Preserve ATGV v0.0.24 Confluence Database v2 roster, User DataTables, source-vault recovery and Reset backup safeguards.
- Run the full Node test suite, Windows Reset checks, UI validation and VSIX build before merge and release.
- Never bundle `.memory` in published extension binaries or source archives.

# ATGV AIATECH Assist v0.4.45

## Fix: Resolve Discovery Questions navigation

- BR approval prerequisite **Resolve Discovery Questions** now navigates to the visible Map & Save 12 milestone, opens the Discovery Questions panel and Question 12 group, and focuses the relevant answer.
- The previous handler was expanding a hidden panel while the editor still displayed the Approve Requirements milestone.
- The **Open AI Review** prerequisite uses the same reliable stage navigation, opening its own visible milestone.
- Existing confirmation for unsaved BR edits and role-based read-only restrictions remain intact.
- Show a useful error if stage navigation or the requested panel is unavailable.
- Include regression tests for Question 12 focus, role/read-only status, hidden-panel recovery, and unsaved edit guard.

## Compatibility

- No changes to existing BRs, mapped source documents, approved Jira work, or permissions.
- Discovery Question 12 still requires a deliberate Business Analyst decision and save; clicking Resolve does not automatically change the answer to NONE.

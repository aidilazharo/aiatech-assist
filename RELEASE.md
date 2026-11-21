# ATGV AIATECH Assist v0.0.14

## Changes

- Fix duplicate Confluence source synchronization conflict messages on the AI-only My Work page.
- Keep the global top notification as the single visible warning, including the View Ownership action and existing safeguards against publishing unresolved source conflicts.
- Suppress page-level feedback on My Work, including previously inserted duplicate warnings when returning to that page.
- Preserve existing inline feedback on Role Workspace and other application pages.
- Keep My Work's AI animation and 18 role-specific chat profiles, but hide the redundant blue "My Work" breadcrumb title on the AI-only page.
- Connect the read-only My Work AI chat to the existing active-project Knowledge & RAG index, retrieving up to six relevant knowledge excerpts from synchronized Jira, Confluence and local project documents.
- Add retrieved source references to AI chat responses and instruct the selected model to cite supplied project evidence, treat source text as untrusted, and mark unsupported assertions or unresolved source conflicts.
- Keep project-scoped RAG context isolated across project changes and use the extension's existing AI-send consent pathway before sending retrieved excerpts to the selected provider.

## Validation

- Add regression tests for the AI-only My Work page receiving Confluence conflict and other status messages with no duplicate inline warning.
- Verify My Work does not display the blue breadcrumb title, RAG excerpt retrieval is project-scoped and bounded, model prompts receive untrusted evidence and source references remain visible.
- Verify global notification rendering and Ownership action remain intact, and other pages retain feedback.
- Run full Node tests, Windows checks, UI validation, build/VSIX integrity and source-only .memory exclusions before merge and publication.

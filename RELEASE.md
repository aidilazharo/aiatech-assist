# ATGV AIATECH Assist v0.0.82

## Business Requirements troubleshooting and completed history
- Add the full BR troubleshooting log download immediately left of Publish to Jira, including during preparation and publication.
- Reuse the project-scoped sanitized log exporter and record automatic workflow phase/stage, Jira preview counts and completed history counts.
- Display actual completed requirement cards in the automatic BA history section; derive the Completed badge from the same record index.
- Provide an explicit empty state before publication or when completed history is absent; never claim a draft is published.
- Preserve immutable completed snapshots and existing permissions, approvals and Jira mappings.

## Verification
- Regression tests, Windows startup/reset and VSIX packaging are required before publication.

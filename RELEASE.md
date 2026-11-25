# ATGV AIATECH Assist v0.1.35

## Changes

- Prompt unregistered connected Jira users with a host-controlled Confirm registration modal displaying their verified name, email (or unavailable), project and Confluence space. Cancel writes no new user record; Refresh can reopen the modal. Existing verified users do not need to register again.
- Search Jira project-assignable users by name or email and select the verified account. Preserve PM and Jira permission checks for adding other users.
- Use the merged Confluence page and database-property roster for PM assignment and BA ownership transfer. Preserve multiple roles and unique account IDs; reconcile database-only records on roster refresh.
- Verify user registration by reading the saved page and database property directly. Report incomplete database sync explicitly rather than full success. Keep the visible Confluence page as a compatible mirror; this integration does not populate native Confluence Database rows.

## Validation

- Changed JavaScript syntax checked; five simulated registration scenarios passed (no consent, cancellation, confirmed registration, multi-role visits, partial sync, database-only recovery and unavailable email are covered). Existing roster regression fixtures updated. Live Confluence calls, full regression suite and VSIX packaging remain unverified.

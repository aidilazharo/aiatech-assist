# ATGV AIATECH Assist v0.1.4

## Changes

- Allow Approved and Publish with BR quality findings and verified Jira items that have no available transition to To Do. Keep both Needs attention badges and explain skipped resets in the confirmation and Jira panel.
- Publish requirement changes, execute available resets, and retain existing status and assignee for skipped resets. Record skipped status resets in the publication audit.
- Preserve revision, ownership, issue identity, permission, required-field, and remote conflict safeguards. A failed transition lookup remains blocking; unavailable transitions are advisory only when the lookup succeeds.

## Validation

- Updated status reset and publish eligibility regression cases; targeted isolated source checks performed. Full Node regression suite and VSIX packaging not run.

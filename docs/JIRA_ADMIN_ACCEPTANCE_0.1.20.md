# Jira and CR security — administrator acceptance checklist

**No Jira configuration is changed by this VSIX.** Perform all tests in a sandbox with authorized personnel.

- [ ] Identify Jira projects/issue types covered by ATGV; document workflow scheme and permissions.
- [ ] Define which started/completed issue fields and transitions require an approved CR (including direct Jira REST API and browser edits).
- [ ] Implement Jira-side restrictions/automation with a designated service identity, independent of ATGV client controls.
- [ ] Confirm a user without CR authorization cannot edit a protected issue via Jira UI or REST API.
- [ ] Confirm a user with authorized CR approval can use a controlled transition to process the change.
- [ ] Test reopened Jira issues: historical "started" record still requires CR.
- [ ] Test missing history / connection failure: ATGV must block writes, not assume not started.
- [ ] Test stale CR plan hash / concurrent edit: ATGV must reject and require new review.
- [ ] Verify audit log records CR ID, approver, Jira keys, time and outcomes.
- [ ] Verify Jira and Confluence sandbox connectivity, permitted issue types, OAuth/API scopes, and failed-request recovery.
- [ ] Sign off the policy after independent BA, developer and Jira administrator testing.

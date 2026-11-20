# ATGV AIATECH Assist v0.4.52

## Business Requirements Step 5 → Step 6 navigation fix

- Fix generated Business Requirements that were correctly created but incorrectly blocked from **Preview & Save**.
- Distinguish `needsRefresh` on a brand-new unsaved draft (awaiting human review) from outdated source or Discovery evidence (requiring regeneration).
- Enable the standalone **Next Step · Preview & Save** action for source-current generated drafts, even when 0 of 8 (or more) drafts have been saved.
- Keep genuinely stale source/discovery revisions blocked until regenerated, and preserve user edits, BR IDs, and Jira links.

## Question 12 guidance and navigation

- Stop treating recorded Question 12 open decisions as a prerequisite for viewing, editing, or saving generated drafts.
- Permit navigation from saved drafts to **Approve Requirements** so Business Analysts can inspect exact approval blockers.
- Clarify that typing `None` is **not required** for draft generation or Preview & Save; use **No open decisions** only when verified.
- Preserve the final BR approval safeguard: unresolved business decisions still require resolution and saved Discovery evidence; AI risk acknowledgment does not silently resolve them.
- No changes to Jira publishing, existing approvals, source documents, or remote Jira issues.

## Quality checks

- Add v0.4.52 regression coverage for new unsaved drafts, stale source/digest and discovery revision, pending approval decisions, and correct Question 12 classifications.
- Update the Next Step readiness regression to require safe stage navigation without prematurely enforcing final approval gates.
- Validate with the repository regression suite, UI theme check, VSIX packaging, and Windows startup checks in GitHub Actions.

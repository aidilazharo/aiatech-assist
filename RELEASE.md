# ATGV AIATECH Assist v0.0.76

## Changes
- Added "Resolve with AI" to Generated Requirements. The explicit BA action repairs only current, unapproved BR drafts with source-backed quality findings.
- Each AI repair is restricted to the affected BR IDs and uses verified uploaded source documents, saved Discovery answers and exact quality-review reasons.
- Runs up to two AI repair passes with independent BR quality validation. Reports repaired, unchanged and unresolved findings; unknown or contradictory policies stay open for human decision.
- Includes a Stop AI control, progress messages, source/revision and BA ownership checks, and prevents conflicting workflow operations during repair.
- Saves corrected work as drafts only. Does not approve a BR, overwrite published history, or create/update/publish Jira issues without manual review and approval.
- Unifies the vertical gaps between all five BR workflow sections (Business Documents, Discovery, Generated Requirements, Jira Work Items and Completed requirements).
- Applies identical section header height, panel insets, and responsive toolbar spacing throughout the BA workflow.
- Literal `[ ]` text remains unchanged; it is not converted into checkbox controls.

## Verification
- Added regression tests for auto-resolve workflow guards, quality checks and uniform section gaps.
- Automated GitHub Actions runs full npm tests, UI style checks, Windows tests and verified VSIX packaging.
- Live Jira and source-specific business decisions still require review by the authorized Business Analyst.

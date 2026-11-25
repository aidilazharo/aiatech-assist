# ATGV AIATECH Assist v0.1.1

## Changes

- Business Analysts can approve and publish saved requirements with open quality findings, including a batch where every BR needs attention.
- The ISO document and Jira preview include flagged requirements. The confirmation lists findings for follow-up, and subsequent BR revisions update their existing Jira issues.
- The release workflow installs the pinned ZIP compressor used by the VSIX packager.

## Validation

- Regression coverage includes all-flagged and mixed batches, unresolved source conflicts, an unavailable quality review, Jira verification failures, and updating a previously published Epic.
- All 2,667 Node regression tests passed locally with both catalogue fixtures. The five Python distribution tests, UI theme check, and packaged extension activation check also passed.

# ATGV AIATECH Assist v0.0.53

## Business Requirement dialog

- Use icon-only buttons for Transfer BR, Close, saved discovery answers, linked Jira issues, Confluence recovery and Jira BR deletion.
- Keep all existing Jira/Confluence actions and safeguards, now with keyboard-focus styling, readable tooltip labels and accessible button names.
- Keep disabled discovery answers visibly unavailable when no local evidence exists.

## ISO 29148 PDF export

- Derive the document title from the actual uploaded source filename, removing revision suffixes and correctly capitalizing descriptive words while preserving domain acronyms.
- Add the packaged ATGV AI logo to the cover; gracefully fall back to a vector AI mark if the image cannot be decoded.
- Remove boilerplate BRS guidance, repeated empty sections, duplicated source-file citations and the default full-source appendix.
- Organize the saved business requirements into Business Requirements Overview, Detailed Business Requirements, and Traceability and Approval.
- Preserve all BR objectives, scopes, acceptance criteria, features, stories, revisions, source digests and real approval statuses.
- Keep the full validated source available through an explicit `includeSourceAppendix` export option; the original uploaded file and stored evidence are untouched.
- Use a self-contained PDF XObject for the packaged logo with no external API dependencies.

## Verification

- Run the full GitHub regression suite and Windows checks.
- Build the VSIX and publish only after the main-branch workflow succeeds.

# ATGV AIATECH Assist v0.0.69

Release date: 2026-11-23

## Jira identity and parent relationship safeguards
- Audit active saved BR-to-Jira links before Jira preview and publication, including unchanged mapped issues.
- Verify canonical numeric Jira issue identity when recorded; retain the permanent numeric issue and parent IDs following confirmed publication.
- Detect duplicate local keys, numeric ID reuse, cross-project mappings, inaccessible Jira issues, and changed parent relationships.
- Block unsafe Jira publication or retirement until the mapping is manually reviewed; never automatically reparent, unlink, recreate, or delete an issue.
- Treat Jira HTTP 404 as deletion **or** insufficient visibility; retain historical evidence.
- Revalidate remote issue identities immediately before updating or retiring an issue.

## Business Analyst layout
- Restore Business Documents above Discovery Questions without removing the source, discovery, generated requirements, Jira Work Items, or completed history sections.
- Keep existing collapsible-by-default panels and workflow controls.

## Validation
- Added v0.0.69 read-only Jira mapping audit regressions for unchanged links, parent changes, numeric ID drift, duplicate local keys and ambiguous 404 responses.
- Source and test changes reviewed in GitHub. Full extension test suite, VS Code runtime integration, and VSIX packaging require a local checkout with Node and approved dependencies.

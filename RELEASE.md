# ATGV AIATECH Assist v0.1.9

- Fix BR Jira parent validation for previously published legacy and current hierarchy mappings, including role subtasks, using corroborated parent identity and issue type.
- Keep strict project, issue marker, numeric issue and parent identity checks; report expected and actual parents for genuine conflicts. No automatic reparenting, deletion or duplicate creation.
- Audit up to 1,000 active Jira links in existing five-item batches, including 297-item projects.
- Add regression coverage for historical mappings, actual reparenting, identity conflicts and large audits. Existing non-blocking workflow status warnings remain unchanged. Full regression and live Jira validation not run; no VSIX generated.

# ATGV AIATECH Assist v0.4.46

## Business Analyst: explicit Discovery Save and reliable partial-save recovery

- Disabled automatic saves of the 12 Discovery questions. Edits remain unsaved until **Save 12 Questions** is clicked.
- Reject legacy webview autosave commands at the host boundary, preventing race conditions with user-initiated writes.
- Keep an immutable snapshot of the answers during manual Save; preserve any typing made while the write is in progress for explicit further saving.
- When the Discovery JSON file was already written but BR-register linking failed, permit a manual retry against the persisted revision without rewriting the Discovery file.
- Detect already-linked identical answers to avoid redundant revisions or unnecessarily invalidating an AI Review.
- Report specific save errors in the Discovery UI, retain user edits and allow manual retry. Stale on-disk revisions cannot be overwritten silently.
- Add **saveDiscovery** to the downloadable BR troubleshooting log's tracked operations. The log now records attempts, errors and completion without storing answers.

## Jira Preview: automatic field population

- Show all Jira metadata fields with source-backed auto-filled values, Jira defaults, existing values or explicit missing-evidence placeholders.
- Populate every supported writable Jira text/custom text field with approved-BR evidence or a clearly labelled text placeholder.
- For non-text fields (assignee, priority, date, number, option and similar), show a preview-only placeholder when evidence is missing, without sending invalid placeholder strings to Jira.
- Keep existing unsupported Jira values intact; required fields without valid values still block publication instead of inventing information.
- Add per-issue summary counts for mapped fields, text placeholders, Jira defaults, existing values and preview-only values.

## Tests and compatibility

- Added tests covering manual-only saving, stale revisions, partial-save retry, idempotent saves and Jira field-type safety.
- Existing BR documents, source evidence, approved changes, Jira work items and role permissions are not modified by this update.
- Missing values in typed mandatory Jira fields still require Jira-valid data before approval or publication.

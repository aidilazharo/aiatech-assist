# ATGV AIATECH Assist v0.0.52

## Business Documents — cleaner document-first interface

- Compact source header with complete original upload metadata preserved in a tooltip.
- Four exclusive tabs: Structured BRD, Editable source, Original and Pre-flight.
- One tab-aware primary action; download, edit, replace, analysis and irreversible Delete stay available under a compact overflow menu.
- ISO 29148 source renders as a safe formatted read-only document instead of raw Markdown.
- Markdown headings, paragraphs, lists, requirement accordions, code blocks and tables render using DOM text nodes. No unsafe innerHTML.
- Editable source remains a text editor; saving remains disabled until actual changes exist. Original source stays read-only.
- Unsaved source edits guard tab switches and destructive source actions.
- Preserve existing verified upload, preflight, download, replacement and BR deletion workflows.

## DataTables correction

- Restore correct eight-column widths after adding BR owner: Business Requirement, Jira key, Type, Summary, Status, BR owner, Created by and Created.
- Contain horizontal scrolling inside the Jira table, preserve readability and avoid overlapping cells.
- Populate BR owner as a sortable value using the live Jira Epic Reporter without changing immutable Creator.
- Preserve existing DataTables search, sorting, pagination and clickable Jira/BR rows.

## Validation

- Pull request CI must pass regression, Windows reset, UI checks and VSIX packaging.
- GitHub release is published from the verified main-branch workflow.

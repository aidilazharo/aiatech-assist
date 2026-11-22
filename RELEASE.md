# ATGV AIATECH Assist v0.0.48

## Business Documents UI

- Align the Business Documents uploaded-file row in a responsive three-column grid: source selection, full document filename/metadata, and Replace & Reprocess / Delete actions.
- Allow long filenames and source metadata to wrap safely without running beneath buttons.
- Apply consistent heights and alignment for download and document actions in the Structured ISO BRD.
- Separate document-view tabs and export buttons into balanced rows without changing actions or permissions.
- Bound AI document preflight findings to a dedicated scrollable panel with clear spacing, wrapping and comfortable line height.
- Give the ISO BRD textarea independent sizing, padding, scrolling and a separated Save Document footer.
- Add mobile and narrow VS Code webview breakpoints for action stacking and full-width editor controls.
- Preserve the underlying source, preflight, ISO BRD generation, document versioning, and Jira integration logic.

## Validation

- Node regression suite and layout assertions: pending CI verification.
- Windows startup/reset: pending CI verification.
- VSIX compilation, checksum and packaging: pending CI verification.

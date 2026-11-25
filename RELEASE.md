# ATGV AIATECH Assist v0.0.97

## Changes

- Use verified Quill for editable BA source documents, with undo/redo and theme-aware typography.
- If Quill is unavailable, expose a read-only source preview and a verified Library sync/retry action instead of an editable textarea.
- Preserve plain-text evidence, revision and ownership checks; reset stale editor state when switching tabs.

## Validation

- Added source-editor regression assertions. Full regression and live VS Code verification remain pending. VSIX packaging intentionally skipped for this source-only change.

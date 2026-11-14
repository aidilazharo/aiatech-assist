# ATGV AIATECH Assist v0.3.46

## Internal extension library extraction

- `src/extension.js` is a small, stable VS Code activation entry point.
- `src/lib/runtime/extension-runtime.js` retains the existing shared application orchestration, credentials, permissions, role routing, cancellation, and VS Code commands.
- `src/lib/webview/dashboard-html.js` owns the dashboard markup with live context and verified vendor asset injection.
- The original behavioral code and user-facing SDLC workflow are unchanged.
- Existing source-text regression tests read a newly generated index of the extracted modules to continue validating text-level safeguards during migration. New architecture tests verify the actual files and module boundaries.
- This is a conservative first phase of modularization. The large runtime message router and developer orchestration remain candidates for further dependency-injected, behavior-tested extraction.

## Verification

Run `npm test`, `npm run ui:check`, and `npm run package`. The VSIX packaging validation checks all local relative `require()` dependencies.

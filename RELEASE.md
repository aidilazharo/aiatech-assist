# ATGV AIATECH Assist v0.4.56

## Fix: Confluence source vault attachment IDs

- Accept both numeric and att-prefixed Confluence attachment identifiers (e.g., 123456 and att123456) returned by Confluence Cloud.
- Validate attachment IDs on upload confirmation and download; pass through only safe, exact server-provided identifiers.
- Reject arbitrary IDs, encoded path separators, unexpected punctuation, and malformed prefixes before any attachment download request.
- Ensure the Confluence source vault can restore original BR documents and project attachments on a second computer when the API returns att-prefixed IDs.
- Keep the existing SHA-256 byte verification, source manifest validation, conflict checks, and no-overwrite local recovery guarantees.
- Add regression tests for modern and legacy ID formats, live-style att-prefixed upload/restore, and malicious ID rejection.
- No changes to the SDLC Library; version remains v1.1.17.

## Validation

Run full Node.js regression tests, Windows reset tests, UI theme checks, VSIX activation/packaging checks, and GitHub release workflow. Merge only after all required CI checks pass.

# ATGV AIATECH Assist v0.1.25

## Changes
- Normalize CRLF line endings in the migrated source-test index generator before matching runtime and dashboard boundaries.
- Diagnose missing runtime and renderer markers separately instead of suppressing regression tests.
- Enforce LF checkout for text sources and CRLF for Windows batch scripts; retain source-only memory exclusion.
- Add regression tests against the actual runtime and dashboard for LF, CRLF and mixed line endings and invalid boundaries.
- Synchronize the dashboard fallback version with the package manifest.

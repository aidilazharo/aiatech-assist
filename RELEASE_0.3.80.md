# ATGV AIATECH Assist v0.3.80 — Single Library version and compact left-aligned branding

- The top application header and startup screen display only the activated, verified workspace Library version. A newer available GitHub version remains visible in SDLC Catalog Settings, not in branding.
- Add **Pull Latest Library** buttons to both brand headers. They invoke the existing verified `catalogPull` handler, with configuration and busy-state gating. The action verifies GitHub main SHA and semantic version before reporting an activated Library.
- Reduce whitespace in the logo's intrinsic image box; tighten logo-to-text gap and move the app header nearer the left edge.
- Retain current v0.3.79 reinstall safety, version checks, Repo A/B dual-PAT authentication and AI-assisted repo sync unchanged.
- Add regression tests covering both header versions, pull button states and responsive spacing.

# ATGV AIATECH Assist v0.3.50 — Configurable GitHub Extension Releases URL

- Adds Extension Settings → Extension & SDLC Library Updates → GitHub Extension Releases URL.
- Defaults to `https://github.com/aidilazharo/aiatech-assist/releases`; accepts only HTTPS github.com owner/repository URLs (with optional `/releases`).
- Resolves the GitHub Releases API from the configured repository, verifies release asset origins, exact VSIX filenames and SHA-256 checksums before installing.
- Persists the selected release URL in VS Code user settings across ATGV Reset.
- Prevents stale releases from a previously configured repository being offered after settings changes.
- Rechecks on startup and at the configured six-hour schedule when enabled; does not auto-install software.
- SDLC Library SHA checking and catalog pull remain independent and unchanged.

**Trust boundary:** Only configure repositories controlled by trusted maintainers. Changing the release repository changes the publisher trusted for installing a VSIX.

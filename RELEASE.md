# ATGV AIATECH Assist v0.0.68

Release date: 2026-11-23

## Legacy library removal
- Remove the former `.atgv/offline-sdlc-library` ZIP importer, manual ZIP import message, ZIP update fallback, version-selection precedence, and offline executable asset cache support.
- Use verified GitHub SDLC Catalog checkout as the authoritative source for installed role skills, technology stacks, and approved browser libraries. Preserve cached files of verified Git commits for offline UI operation.
- Retire an existing managed `.atgv/offline-sdlc-library` directory at startup or after the next Git catalog pull, **only** when its files match stored hashes and a verified equal-or-newer Git catalog exists. Do not delete modified, unexpected, or unverified user files.
- Extract semantic version comparison to a Git-independent version helper and keep pinned Git commit verification.
- Remove obsolete ZIP-only tests; retain startup, DOCX, Jira, catalog and editor regressions and add v0.0.68 migration tests.

## Notification overlay
- Display temporary top notices above the persistent Business Analyst (or other role) credentials bar at a higher stacking order without moving the workspace.
- Match the temporary notification height to the rendered credentials bar, with only a bottom status-colored border for both bars. No surrounding outline.
- Auto-dismiss temporary notifications after five seconds; retain action and dismiss controls, and return the persistent red credential reminder when the temporary notice closes.
- Keep the permanent credential reminder until active-role permission checks pass.

## Validation
- Verify Linux full regression suite, Windows stack-reset smoke tests, production VSIX compilation/size budget and release checksums before release.

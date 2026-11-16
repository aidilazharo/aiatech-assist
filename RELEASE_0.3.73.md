# ATGV AIATECH Assist v0.3.73

## Header, navigation, progress improvements

- Show the extension version and active SDLC Library version under the logo in both the main header and start screen.
- Remove the separate Settings button from the start screen; retain the standard Settings navigation inside the workspace.
- Move model selection from the right header to the left menu directly below Approvals & Handoffs, keeping existing model selection behavior.
- Derive a display-only full name from the configured Jira/Confluence email and render it at the far right of the header. When no valid email is configured, display Not configured.
- Resize circular progress indicators and their connector spacing with the available panel width across Overview, BA, UI/UX, role steps and Developer TDD.
- Add a rotating progress ring only to active steps, preserving completion markers and reduced-motion accessibility.
- Preserve the single canonical design-system generator and regression checks.

The SDLC Library itself remains versioned independently. No catalog release/version was modified by these extension UI changes.

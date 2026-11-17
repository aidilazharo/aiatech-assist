# ATGV AIATECH Assist v0.3.91 — SDLC Library pull and update progress

## Library update modal
- Selecting **Pull Library** no longer dismisses the branded update dialog immediately.
- A visible, accessible, stage-based progress bar shows GitHub access checks, version pinning, Git pull, activated checkout verification, and workspace refresh.
- Progress percentages mark completed milestones, not network bytes or an estimated download duration.
- The modal stays open and disables dismissal while the library is being updated.
- Only the host-confirmed successful activation closes it; errors stay visible with **Retry Pull** and **Later**.

## Catalog settings
- **Settings → SDLC Catalog → Pull Catalog** now displays the same real update stages and verification progress.
- Preserve existing catalog Git main verification, cached offline ZIP precedence, credential handling, and project files.

## Tests
- Add browser-like modal state tests covering live progress, completed-only dismissal, failure/retry behavior, and accessible status semantics.
- GitHub Actions continues to run all extension regressions and VSIX build checks before release.

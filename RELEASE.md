# ATGV AIATECH Assist v0.0.21

## Fixes

- Keep the same animated My Work waveform visible above the active global notification by moving its canvas between the normal top bar and the notification row without restarting the animation.
- Preserve the red-to-CMYK animation, responsive layout, warning actions and dismiss controls.
- Remove the blue Overview breadcrumb, PROJECT OVERVIEW kicker and redundant Overview heading inside the right-hand content pane. The sidebar Overview route remains unchanged.
- Suppress duplicated inline error messages in every right-hand page while preserving the global notification, actionable buttons and diagnostic logging.
- Preserve the Confluence page/attachment and SQLite synchronization with conflict review. Confluence Database row writes are not exposed by the public API; never replace approved data or silently claim database row synchronization.
- Add focused UI regression tests and explicitly exclude .memory from VSIX artifacts.

## Verification

Run Node, Windows, UI, and VSIX packaging gates on this PR head before merging.
Do not publish a release until checks pass.


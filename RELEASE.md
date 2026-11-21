# ATGV AIATECH Assist v0.0.7

## Changes

- Replace the CSS-only My Work AI orb with the requested small, continuously looping 16-frame CMYK-style image animation featuring colliding cyan, magenta, blue, green and yellow light ribbons.
- Ship the optimized 64 × 64 animated WebP inside the extension for secure offline VS Code webview playback; resolve it with the approved webview URI and CSP.
- Add smooth continuous multi-axis CSS rotation to the animated orb: slower while idle and more energetic while thinking; fade to a green-tinted success state and disappear while preserving the recommended next step.
- Keep the orb centered above the AI suggestion and user-controlled action buttons for all roles. No chat input or automatic Jira approval, publication or deletion.
- Set the right-hand ATGV content pane to a black background and provide compatible high-contrast text and dark content surfaces while leaving the navigation sidebar alone.
- Preserve reduced-motion fallback, source-only .memory guidance and all existing security gates.

## Validation

- Verify the packaged animated WebP is a valid RIFF/WEBP animated asset with 16 frames and a strict size budget.
- Test My Work role guidance, deferred action buttons, centered animation, accessible reduced-motion state, black right content pane and release metadata.
- Run the full Node regression suite, Windows checks, UI theme verification, VSIX packaging and source ZIP provenance checks through GitHub Actions.

# ATGV AIATECH Assist v0.0.46

## Changes

- Show the existing top-bar red-to-CMYK waveform while any registered extension-host AI model request is active, regardless of current role or page (including Technology Stack).
- Reference-count concurrent model requests so overlapping calls cannot prematurely hide the waveform; completion, rejection and cancellation release activity.
- Cover the scheduled AI orchestrator and the standalone ATGV AI/Codex chat while their model work runs.
- Keep waveform intensity low during global AI processing; retain the header red idle color, CMYK transitions, native border alignment and reduced-motion behavior.
- Re-parent the existing live canvas to the active notification bar if it temporarily replaces the app header, then restore it when the notification closes.
- Restore the active signal after a webview reload without extending or replaying the AI request.
- Explain why Custom Stack's isolated mock preview does not enable the separate Developer approval gate. Merging to main is not required; real test/build and reviewed handoff evidence must be verified separately.
- Add regression tests for concurrent and failed AI calls and top notification placement.

## Validation

- Full Node regression suite, Windows checks, theme verification and VSIX packaging: pending automated CI.
- Do not interpret a green synthetic preview as validation of PostgreSQL, identity provider, production services, or Developer release approval.

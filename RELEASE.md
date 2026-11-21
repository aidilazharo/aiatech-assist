# ATGV AIATECH Assist v0.0.5

## Changes

- Add a shared, read-only AI next-step assistant at the top of My Work for all configured SDLC roles, including Business Analyst, Solution Architect, UI/UX Designer, Developer and Project Manager.
- Center the blue idle / blue-green thinking orb above all guidance; generate no suggestion text or buttons until a recommendation is available.
- Present concise role-scoped suggestions grounded in current task progress and assigned work; provide safe navigation buttons without chat input or automatic workflow mutations.
- Display a green success animation when AI analysis succeeds and fade the orb away, preserving the suggestion and buttons.
- Always show a progress-based next step if the AI provider is unavailable or unresponsive; support a manual Review again action.
- Use a plain black panel with white text, no colored border, and reduced-motion support.
- Preserve source-only .memory exclusion from VSIX and source release artifacts.

## Validation

- My Work AI regression tests: layout, timing, navigation, fallback and provider error handling.
- Full Node regression suite, Windows startup/reset checks, UI theme check, VSIX integrity and source ZIP memory-exclusion checks via GitHub Actions.

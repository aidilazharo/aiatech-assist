# ATGV AIATECH Assist v0.0.50

## Startup screen

- Remove the **Pause automatic opening** button from both prerequisites/connections and project-search pages.
- Remove the button event handlers and visual-state references; retain the automatic opening workflow, its safety checks and error handling.
- Preserve automatic cancellation when users manually navigate, inspect prerequisites or encounter a missing permission/connection.
- Keep Previous/Next navigation, the active connection-check message and the automatic opening countdown unchanged.
- Add regression coverage to prevent reintroducing the two pause controls or accidentally disabling automatic opening.

## Validation

- Node regression suite, Windows startup/reset, UI theme and VSIX packaging: pending automated CI.

# ATGV AIATECH Assist v0.0.12

## Changes

- Remove the visible AI waveform activity captions (including "WAITING FOR ACTIVITY", "SLOWING", "LINE ONLY", "FADING" and other status labels) from the shared My Work AI interface.
- Preserve animated multicolor waveform reactions, automatic idle fade/sleep, AI response typewriter and wake on user input.
- Remove the visible "CHAT WITH ATGV AI" heading and the "Enter to send · Shift+Enter for a new line" helper under the chat composer.
- Keep the input accessible with a role-specific screen-reader label and a visually hidden live status for response generation.
- Remove the Project Manager Daily Delivery Cockpit explanatory sentence about project-wide Jira delivery activity and Jira transition confirmation, leaving the actual dashboard and confirmation behavior unchanged.
- Apply the cleanup to the shared chat used by all 18 built-in My Work roles.

## Validation

- Verify removed copy cannot be reintroduced by JavaScript after user input, role switching or AI activity.
- Verify the shared chat form, keyboard handling, role-scoped AI prompts and waveform sleep/wake behavior remain operational.
- Run the full Node test suite, Windows checks, VSIX packaging, theme validation, source ZIP checks and exclusion of source-only .memory guidance before publication.

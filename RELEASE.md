# ATGV AIATECH Assist v0.0.18

## Changes

- Render the My Work animated AI waveform above the bottom red divider with an explicit stacking order: divider z-index 1, waveform z-index 3, canvas z-index 4.
- Use an isolated top-bar stacking context and allow overflow so the wave visibly crosses the red divider without clipping.
- Align the waveform centerline to the divider on desktop, mobile and short-height views; reserve center results padding so chat text is not obscured.
- Animate the waveform through the requested lifecycle: fade in red, transition to CMYK while AI is active, then fade CMYK back into red while fading out.
- Expand the My Work conversation to the full available width and height without surrounding cards, message borders, chat-pane borders or composer frames; keep the input fixed at the bottom and the conversation independently scrollable.
- Retain the red divider, independently scrolling results, bottom chat composer, all 18 role prompts, Confluence/Jira project awareness and existing AI chat.
- Add regression coverage for z-index precedence, responsive offsets, the red/CMYK/red sequence, and borderless full-area chat.

## Verification

Run Node regression, Windows validation, UI checks and VSIX/archive packaging in CI before merging. Publish from main only after all checks pass, with .memory kept in source control but excluded from distributed VSIX and ZIP.

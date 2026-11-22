# ATGV AIATECH Assist v0.0.45

## Changes

- Move the 23px My Work AI top black margin from the fixed outer panel into the scrollable chat/results viewport.
- Keep the initial conversation aligned with the sidebar WORKSPACE heading, while the margin scrolls away naturally with chat messages.
- Preserve the anchored bottom message composer, native header waveform, text foreground, and responsive layouts.
- Use 16px scrolling top clearance on narrow screens and 12px on very short viewports.
- Update CSS layout regression tests so future releases cannot reintroduce the fixed top gap.

## Validation

- Static layout assertions cover the shell, scrollable viewport, header waveform, and mobile/short-height clearance.
- Full regression suite, Windows checks and VSIX packaging: pending CI validation.
- No application source or Jira data is changed by this UI-only patch.

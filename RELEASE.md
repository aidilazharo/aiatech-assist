# ATGV AIATECH Assist v0.0.42

## Changes

- Align the top of every role's My Work AI chat with the left-sidebar WORKSPACE title using the matching 23px top offset (17px sidebar top padding plus 6px first-label padding).
- Put the clearance on the non-scrolling My Work AI shell, rather than the scrollable results viewport, to prevent messages passing underneath the native header animation.
- Bring the scrollable chat text, conversation, and bottom composer to one consistent z-index 1 foreground layer while keeping the native header waveform untouched above the red border.
- Remove the chat title's extra 2px top margin to match the sidebar heading baseline.
- Keep the existing full-width borderless chat, fixed bottom composer, task cards, responsive layout, and reduced-motion behavior unchanged.

## Validation

- Regression tests check the exact sidebar-aligned offset, shared foreground stacking, scroll clipping, waveform preservation, and role-independent AI layout.
- CI validates the complete Node regression suite, Windows reset checks, UI themes, and VSIX packaging/activation.

# ATGV AIATECH Assist v0.0.19

## Changes

- Move the one existing My Work AI waveform canvas out of the scrollable content and into the application's real main header.
- Align the waveform centerline precisely with the existing 3px top-bar bottom border (`#D31145`) instead of drawing a second red line in My Work.
- Override the header's overflow clipping only on My Work; keep waveform and its CMYK/red transitions visible above the native red border.
- Match the wave's fade-in and fade-out red to the exact header border color, while retaining the active CMYK transition.
- Show header animation for My Work across all 18 roles, hide it on other pages, and resize the canvas on navigation.
- Preserve the full-width borderless conversation, independently scrolling responses, fixed bottom chat input, RAG, Jira and Confluence activity awareness.
- Update UI tests for header placement, unique canvas, native border alignment, stacking order, mobile dimensions, red/CMYK/red lifecycle and chat behavior.

## Verification

Run the complete Node, UI, Windows and VSIX packaging workflow against the exact PR head. Merge only when required checks succeed, then publish the verified VSIX and source ZIP from main. Keep .memory files excluded from the distribution.

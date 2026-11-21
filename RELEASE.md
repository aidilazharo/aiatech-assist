# ATGV AIATECH Assist v0.0.28

## My Work — header animation and chat readability
- Keep the existing red-to-CMYK animated waveform on the top bar.
- Reserve a non-scrollable vertical clearance above the chat results, so messages, daily tasks and AI guidance cannot scroll through or in front of the animation.
- Preserve the full-width, borderless conversation and bottom-anchored message composer.
- Match clearance to desktop (94px), narrow (76px) and short (54px) viewport layouts.

## Verification
- Update the waveform and chat regression assertions to test the fixed scrolling boundary, responsive clearances and waveform z-index.
- Run full Node and VSIX checks in the repository workflow before publishing an installation artifact.

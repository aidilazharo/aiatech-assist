# ATGV AIATECH Assist v0.0.43

## Changes

- Combine AI document preflight with the **Structured ISO BRD** tab instead of showing a separate preflight section under Uploaded Documents.
- Keep preflight findings collapsed by default while preserving status, warning/blocker counts, proposed resolutions, retry/skip actions and saved evidence.
- Place **Download Pre-flight Analyst** and **Download ISO 29148 Business Requirements** above the collapsible findings so exports remain available without opening a long diagnostic list.
- Resize and center the four Business Requirements workflow circles to 38px on desktop and 32px on narrow viewports; align connectors to the circle centers.
- Animate the active workflow circle with a rotating ring and gentle pulse, while respecting reduced-motion preferences.
- Restore the existing header AI waveform throughout the Business Analyst workflow, including draft/ready states: subtle red waves at idle and CMYK waves while AI work is running.
- Recalculate canvas dimensions when moving from My Work to Business Requirements, and host the waveform above the red border even when a top notification temporarily replaces the header.

## Validation

- Regression coverage for preflight integration, source-tab visibility, download controls, centered workflow circles, active ring animation, top-bar waveform visibility and notification reparenting.
- GitHub Actions runs the complete Node regression suite, Windows reset checks, UI/asset validation and VSIX packaging/activation verification before publication.

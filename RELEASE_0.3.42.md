# ATGV AIATECH Assist v0.3.42 — Verified Vision Support

## Baseline

Updated verified packaged release v0.3.41. No changes to `tech-stacks-skills` or GitHub catalog files.

## Changes

- Library Studio's image-test model picker now reports image-input capability as **Verified**, **Declared (not verified)**, **Unverified**, or **Unsupported**, using the actual VS Code model capabilities when available.
- Added **Verify Vision Support**. Clicking it sends a real, reproducible PNG containing a randomized two-shape challenge to the selected VS Code model. The trusted host checks the count and exact leftmost shape color in the model's JSON response; success is stored per model for the current extension session.
- The model is not told the hidden geometry. API errors, unparseable replies or incorrect image observations never count as verified support.
- Confirmed models with no declared image-input capability may be tested by explicit user action. A successful test allows the existing grounded/false-premise image benchmark to use that model.
- Image benchmark history now separately records declared/probed vision capability, model/provider, image replication accuracy and visual-question result. A visually unsupported model still receives **Unsupported**, not a fabricated Pass/Fail.
- Existing CodeMirror, GitHub-cached browser libraries, image-safe SVG renderer, locked tests and SDLC workflows remain unchanged.

## Quality checks

- Automated regression suite: **1,699 passed, 0 failed, 2 skipped** (1,701 total).
- Added vision probing tests for declaration detection, real PNG submission, randomized challenge grading, unsupported models, capability-absent models, and UI request wiring.
- VSIX packaged and verified: `0.3.42`, Start / Restart / Reset / Refresh Shared Artifacts commands registered.

## Known limits

- No live VS Code / GitHub Copilot authenticated model test was available in the packaging environment. Runtime vision probes are user-triggered and require VS Code model access and any applicable user consent.
- The verification checks one small randomized image; it is evidence of image-input use, not a guarantee of general visual reasoning reliability.
- Non-VS Code providers without an image-input adapter remain unsupported for this specific test.

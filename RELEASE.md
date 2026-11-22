# ATGV AIATECH Assist v0.0.47

## Changes

- Preserve global red-to-CMYK top-bar waveform for all 18 SDLC roles and all active extension-host AI requests (the shared activity bridge introduced in v0.0.46).
- Add **Custom Stack development handoff approval** to the existing Solution Architect "Approve for Developers" control.
- Save synthetic preview provenance against the exact clean local Git SHA, fix branch, selected target, and localhost URL after successful six-step Install & Run.
- Verify the still-running ATGV-owned mock preview and run actual test/build scripts for **all runnable applications** before requesting a development handoff.
- Block handoff on missing scripts, failed tests/build, changed Git SHA, missing mock process or unhealthy localhost preview.
- Require two deliberate approvals: executing application test/build scripts and publishing the scoped GitHub handoff branch.
- Publish an immutable SHA-pinned `tech-stack/custom-vN` branch (or safe collision-specific alias); no push during Install & Run, no force-push, no automatic merge to main.
- Persist a **development-mock** approval with explicit unverified production database, identity and external integration limitations, preserving the catalog approval gate.
- Enable Developer workflow only when the tested SHA, saved preview, approved branch and remote verification agree.
- Add tests for cross-app checks, blocking conditions, registry normalization, Developer authorization and role-independent AI waveform.

## Verification

- Automated CI (Node regression suite, UI theme, Windows startup/reset and VSIX checksum) required before release.
- This is an approval for a developer **mock** environment, not for production deployment or verified live integrations.

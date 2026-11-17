# ATGV AIATECH Assist v0.3.88 — Visible verified upgrade installation

## Extension upgrade modal

- Keep the branded **Secure Extension Update** window open after **Install Upgrade** is selected.
- Show a visible animated progress indicator and stage descriptions while downloading the verified VSIX, checking SHA-256, staging the package, and installing it through VS Code.
- Disable **Later**, **View Release**, **Install Upgrade** and Escape dismissal while an installation is running; leave the dialog open until VS Code's installation command completes.
- Close the dialog **only after a successful installation**, then reload ATGV. A failed install leaves the dialog open with a useful error and **Retry Install** action.
- Match progress/results using the unique upgrade request ID. Ignore stale messages and duplicate install clicks. Do not show GitHub PATs in progress messages.
- The manual **Install Verified VSIX** control in Settings also uses this visible upgrade modal and verification path.
- Remove the previous two-minute expiry for still-open offers, so an idle offer remains actionable until the user decides or the dashboard is disposed.

## Computer readiness

- Move **Download Unified Error Log** to the bottom-left of the technology-stack prerequisites section.
- Remove the redundant text “Includes installer status, verification and troubleshooting details.”
- Preserve the download command and all diagnostic contents.

## Quality checks

- Add `test/v388-upgrade-progress-and-readiness-log.test.js` to cover active progress, dismissal prevention, successful completion, failed installation, retry, request identity, and readiness log positioning.
- Continue running the full Node regression suite, UI validation, and verified VSIX/source packaging via GitHub Actions.

## Git workflow

- Created on descriptive feature branch, reviewed by pull request and targeted at `main`.
- Merge after required checks pass; do not bypass repository protections.

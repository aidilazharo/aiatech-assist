# ATGV AIATECH Assist v0.3.86 — Header typography and verified connections

## Branding

- Place the welcome-screen extension and library versions directly below the **AIATECH ASSIST** title by removing the heading's inherited bottom margin and reducing the vertical gap.
- Increase the top-bar extension/library version text to 11px on desktop and 9px on compact screens, with stronger font weight for readability.
- Preserve existing logo sizes, product title size, left alignment, and independent extension/library version labels.

## First-run connection setup

- On successful **Test & Save Connections**, hide and disable the button, retain the successful connection message, and enable **Next: Search Project**.
- Editing a connection URL, email or credential invalidates verification, restores the action and disables Next until another successful test.
- Disable editing the connection form during live verification so the stored settings match what was tested.
- Keep verified state when navigating back from project search to the connection page during the same session.
- Failed verification restores the testing action; no automatic bypass of connection checks.

## Regression tests

- Add `test/v386-header-and-startup-connection.test.js` to check responsive typography, close title/version spacing, and connection action transitions.
- Full regression, UI checks, and VSIX packaging are performed by the main-branch GitHub Actions workflow.

## Publication

- Changes pushed directly to `main`; no PR created for the extension.

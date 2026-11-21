# ATGV AIATECH Assist v0.0.31

## Custom Stack: single progress indicator

- Remove the redundant Custom Stack scan/repair progress bar from the Existing Repository panel.
- Reuse the existing Technology Stack progress bar for Custom Stack scans, dependency installations, mock previews, branch changes, Git pulls, and local run-health checks.
- Preserve the ARIA progress value and the percentage / phase text in the shared top indicator.
- Keep the Custom Stack section's status message, branch selector, discovered services, and generated action buttons.
- Update regression tests to verify that only the shared progress bar exists.

## Validation

- Run the complete GitHub Actions regression, Windows, UI and VSIX packaging pipeline before merge and release.

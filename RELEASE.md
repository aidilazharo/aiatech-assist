# ATGV AIATECH Assist v0.0.32

## Custom Stack — responsive repository scanning

- Display verified application targets, dependencies, Git branches and safe remediation actions before optional AI advisory completes.
- AI review arrives as a separate update, tied to the Git revision and scan request; ignore stale scan results.
- Show immediate scan-request feedback, confirmed extension-host milestones and a single Technology Stack progress bar.
- If the host is silent for 12 seconds, report elapsed time and last known phase, with diagnostic steps instead of implying server execution.
- Keep application runtime separate: scan completion never means the application is running.

## Verification

- Regression checks cover early manifest delivery, AI updates, stale scan events and silent-host warnings.
- Preserve read-only scanning, local fix branches and explicit confirmation for installation/mocking.

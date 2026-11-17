# ATGV AIATECH Assist v0.3.92 — Fix SDLC Library update stalled at 0%

## Root cause
The v0.3.91 branded update dialog passed `type: 'catalogPull'` to a dispatcher that requires `command: 'catalogPull'`. The pull request was ignored, leaving the progress bar at 0%.

## Fix
- Pull Library starts directly from its validated host decision handler instead of waiting for the background update checker to resume.
- Immediately acknowledge the host request and show the actual GitHub pull, validation and checkout verification stages.
- Retry uses the correct command, while expired or stale approval requests report a visible error instead of spinning indefinitely.
- Maintain existing SHA verification and protect project files and PAT credentials.

## Regression coverage
- Execute actual host decision and retry switch cases, verifying command dispatch and immediate UI acknowledgement.
- Check expired offers, retry safety, cancellation, and no duplicate pull after the background check resumes.

# ATGV AIATECH Assist v0.0.10

## Changes

- Start-screen Jira, Confluence and GitHub verification now shows only the currently running check, not all eight checks at once.
- Hide a check immediately when it succeeds. Show the next sequential check as verification progresses.
- Retain a failed or offline check for troubleshooting until verified successfully; keep full check results in the host for saved-credentials gating.
- Remove the visible Connection diagnostics panel from the startup screen without disabling sanitized diagnostic capture or the existing unified log export.
- Collapse empty progress containers so successful verification no longer leaves blank rows.

## Validation

- Startup UI regression covers idle, pending, success, error and repaired checks, including one-at-a-time progress.
- Diagnostics regression verifies the section stays hidden and host logging/export remains available.
- Full regression suite, Windows startup tests, UI theme, VSIX and source ZIP integrity are enforced by GitHub Actions.

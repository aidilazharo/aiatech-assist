# ATGV AIATECH Assist v0.0.41

## Changes

- Record a durable, redacted, bounded Technology Stack diagnostic journal from Save Stack through checkout, repository scanning, approval waiting, all six Install & Run stages, dependency installation, mock preview verification, cancellation and failures.
- Reuse the existing Technology Stack download icon to export chronological activity and in-session errors even when no failure has occurred.
- Keep project-specific log history across ATGV restarts in VS Code extension global storage, outside the Git checkout.
- Fix the previously unsupported `custom-stack` error-log category which could prevent an approved Install & Run from starting.
- Explain that 4% means user confirmation is pending, not a stalled installation. Emit a reminder at the same percentage every 30 seconds until approval, cancellation or dialog timeout.

## Validation

- Regression tests cover redaction, persistent chronology, per-project isolation, bounded log retention, no-follow symlinks, valid custom-stack diagnostics, and reuse of the existing download icon.
- CI verifies the Node suite, UI themes, Windows stack reset, and VSIX packaging/activation.

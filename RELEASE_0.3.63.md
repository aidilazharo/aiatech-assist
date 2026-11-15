# ATGV AIATECH Assist v0.3.63

- Replace native VS Code Java and other prerequisite installation pop-ups with the branded AIA/ATGV confirmation modal using the extension's existing logo.
- Preserve the allowlisted host installer, exact command display, explicit Install/Cancel, administrator-approval warning, keyboard Escape/Tab behavior and focus restoration.
- Add the Download Unified Error Log button at the bottom-left of Technology Stack Prerequisites and a second entry point from Project Search.
- Persist sanitized diagnostic entries for prerequisite scans, installer confirmation/cancellation, command exit and captured output, post-install binary/version verification, and project-opening failures. Logs are exported on demand outside the project checkout.
- On Windows, re-detect newly installed JDK/dotnet/node/git runtimes from trusted vendor locations when the current VS Code process has a stale PATH, then refresh the runtime for the current session.
- Mark installation successful only after a real version check; show verification failures and suggest a VS Code restart when appropriate.
- Keep the currently expanded tech-stack panel expanded across Refresh, and show a persistent installation result.
- Fix existing-project opening so the opening state reaches 'open' before activation refreshes UI/services; roll back on failure and record diagnostics.
- No project file changes or removal of unrelated software.
- VSIX packaging and release are handled solely by the main-branch GitHub Actions workflow.

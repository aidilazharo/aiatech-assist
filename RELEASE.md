# ATGV AIATECH Assist v0.0.4

## Changes

- Unify sanitized startup, BA, Jira, Confluence, GitHub, AI, Developer, Solution Architect and runtime errors under `.atgv/src/error-logs`.
- Add `.atgv/src/extension` and `.atgv/src/library` for Git-verified source code while preserving existing workspace folders.
- Monitor errors only between local 12:00 and 12:59, if the trusted VS Code workspace is idle and Copilot SDK is installed.
- Check GitHub for already reported matching errors; delete only the confirmed matching error log.
- Verify PAT repository read AND write access by creating/deleting a temporary branch. Disable automatic improvement if the PAT is read-only, preserving all logs.
- For new issues, read source Git `.memory`, prepare source fix, run tests, push to GitHub and create a PR without auto-merge.
- Preserve source-only `.memory` exclusion from VSIX and ZIP releases.

## Validation

- Time zone, unified logging, PAT permission probe, GitHub duplicate and idle-state regression tests, Windows startup and packaged VSIX verification.

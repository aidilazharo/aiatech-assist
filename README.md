**Version: 0.0.4**

**Author:** [Muhamad Aidil Azhar Salim](mailto:muhamadaidilazhar.salim@aia.com)

## Idle AI coding maintenance and unified error logging

All ATGV failures, including startup, BA, Jira, Confluence, GitHub, AI, Developer and Solution Architect errors, are collected as sanitized JSON in `.atgv/src/error-logs/`. Existing diagnostic exports remain available. The workspace also maintains source checkouts in `.atgv/src/extension/` and `.atgv/src/library/`. When VS Code is running in a trusted workspace, between **12:00 and 12:59** in the configured system/IANA timezone, ATGV checks for active processes, then searches GitHub for matching reported failures. Only positively matched duplicate error logs are deleted. For new failures ATGV verifies the saved PAT with a real read check and a temporary Git branch creation/deletion; a read-only PAT disables automatic improvement and all error evidence is preserved. With a writable PAT, an installed Copilot SDK and relevant source-only `.memory` guidance, ATGV can propose a fix, run tests, push a branch and create a PR. **PRs are not automatically merged.** The `.memory` directory remains solely in Git source, excluded from the VSIX and release ZIPs.

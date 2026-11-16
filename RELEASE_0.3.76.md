# ATGV AIATECH Assist v0.3.76

## Live Jira and Confluence refresh by default

- Automatically fetch current Jira issues and Confluence pages **when a verified ATGV project opens**, and repeat **every five minutes** while that project remains active and VS Code is running.
- Read-only remote polling: **no automatic Jira changes, approvals, document publication or Confluence overwrites**.
- Respect explicit offline mode. Leave previously indexed content intact if authentication or network access fails and show a clear partial/offline status.
- Keep each refresh bound to the exact active project so a delayed result from a previous project is discarded.
- Use the project's configured Jira JQL when supplied. Otherwise, derive a safe, project-scoped default JQL from the validated Jira Project Key (`project = KEY ORDER BY updated DESC`).
- Recheck on entering Knowledge & RAG (with a one-minute request cooldown); manual Sync Project Knowledge remains available.
- Share the existing Jira project inventory across BA and PM screens, reloading stale results after five minutes and retrying failed scans on the next interval. Automatic refresh does not reconcile or delete Jira links.
- Show Jira and Confluence fetch counts, last check time and errors in the Knowledge screen.
- Clear refresh timers on project change, restart and extension shutdown.

## Regression corrections
- Repair malformed header test in v0.3.75.
- Remove hardcoded historical SemVer assertion from the ATGV Workspace test.
- Add regression coverage for live-refresh defaults, project-scoped JQL, cooldown, offline safety and status visibility.

SDLC Library version remains independent. Release workflow stays the sole GitHub Actions workflow; extension source pushes directly to `main`.

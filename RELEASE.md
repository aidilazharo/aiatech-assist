# ATGV AIATECH Assist v0.0.26

## Solution Architect — Custom Stack Scan / Pull Repository
- After **Scan Repository** verifies the configured project Git checkout, the same button toggles to **Pull Repository**.
- The Pull action verifies the configured GitHub origin, currently selected branch, exact scanned SHA, clean working tree and absence of an ATGV-managed running application.
- Fetch the selected origin branch and update the local branch using **fast-forward only**. Reject divergent history, dirty worktrees, detached HEADs, mismatched remotes, and unexpected branch or revision changes.
- Following success, re-scan application targets and show the synced revision. Errors preserve the previous scan and do not reset, stash, force, switch branches, commit or push.

## Regression and safety
- Add unit tests for fast-forward success, dirty and unsafe checkout rejection, divergent branches, and the button's host/UI wiring.
- Preserve the current role-specific agents, project-aware RAG, daily brief, Confluence Database v2 user roster, Jira Creator/Reporter deletion and source-only .memory packaging rules.
- Run Node regression suite, UI validation, Windows verification and VSIX packaging in CI before merging.

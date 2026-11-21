# ATGV AIATECH Assist v0.0.26

## Solution Architect — Custom Stack Scan / Pull Repository
- **Scan Repository** toggles to **Pull Repository** after verifying the configured project Git checkout.
- Pull verifies the GitHub origin, checked-out branch, exact scanned SHA, clean worktree, and that no ATGV-managed app is running.
- Fetch the current origin branch and fast-forward only. Divergent histories, dirty files, detached HEADs, mismatched origins and concurrent repository changes are blocked.
- Automatically re-scan the fetched source and show the resulting revision. No reset, rebase, force, stash, commit or push is performed.

## AI guidance and project delivery evidence
- Read up to 40 recent, project-scoped Jira items and flag evidence of blocked, overdue and unassigned issues, without treating the limited sample as a complete forecast.
- Provide deadline-aware risk guidance and role-specific action suggestions; explicitly distinguish unknown capacity and critical path.
- Route **What to do next** using trusted host-supplied navigation targets instead of parsing displayed recommendation text.
- Refresh Jira/Confluence read-only state on My Work entry with existing throttling, without replacing the webview or interrupting chat.
- Reject malformed Confluence Database v2 roster properties without overwriting existing users.
- Preserve all 18 role-boundary policies, source-only .memory guidance, project RAG and guarded Jira Creator/Reporter deletion.

## Release verification
- Regression tests cover repository fast-forward safety, the Custom Stack button, bounded Jira risk, trusted next-action routing and Confluence schema validation.
- Require passing Node tests, UI checks, Windows regression tests and verified VSIX packaging before merging the PR.
- Experimental Confluence v2 permissions and AIA Malaysia mirrors still need live-environment verification.

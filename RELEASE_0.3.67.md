# ATGV AIATECH Assist v0.3.67 — Solution Architect approval after server stop

- Fixes a contradiction between the Technology Stack checklist and approval handling: a previous successful HTTP smoke test for the exact saved and tested Git SHA remains valid when the ATGV-owned application server is stopped.
- Approval accepts durable verified server evidence only when the stack is successfully tested and pushed, and the stored evidence exactly matches the saved stack, root, branch and commit.
- If the application is currently running, the host still requires fresh HTTP health and an exact SHA/branch match. Unhealthy, unverified or mismatched running applications must not be approved using stale evidence.
- Update the Solution Architect status and action tooltip: a stopped, previously verified server is ready for approval; no unnecessary restart is required.
- Preserve approval confirmation, verified worktree, Git branch publishing and existing protection against unverified stacks.
- Add regression tests for stopped verified approval, missing/stale proof, mismatched live server and invalid server status.
- No changes to the independent SDLC Library source version.

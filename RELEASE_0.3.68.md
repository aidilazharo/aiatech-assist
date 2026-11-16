# ATGV AIATECH Assist v0.3.68 — GitHub Approval and Technology Stack Reset

- **Architect approval:** Do not force-push or overwrite an existing `tech-stack/<stack>-v<generation>` GitHub branch if its SHA differs from the tested and verified stack. Publish a deterministic, SHA-pinned fallback branch instead, verify its exact remote SHA, and persist it as the approved Developers handoff branch. Repeated approval of the same SHA reuses the verified remote branch.
- **Reset Tech Stack:** Accept a saved, verified `migration/<stack>-catalog-...` branch as well as `bootstrap/<stack>-...`. Require the recorded Git repository, branch, pushed status and SHA to match before returning safely to main. Preserve remote history and prior branch commits.
- **Automatic server cleanup:** After explicit confirmation and successful reset preflight, stop project-owned ATGV application process groups (including frontend/API subprocesses and isolated preview worktrees) before switching branches or resetting local Git. Never terminate unrelated processes or servers in other projects, and block the reset if an owned process cannot stop.
- Keep the existing recoverable Git stash for force reset, archive previous stack documents, and clear old approval/validation only after successful reset.
- Add real Git regression tests for branch collisions and migration reset, plus process ownership/stop failure tests.
- Extension source version 0.3.68; SDLC Library remains v1.1.14.

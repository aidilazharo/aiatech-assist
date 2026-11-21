# ATGV Extension coding-agent instructions

The source repository's `.memory/` folder contains **approved development guidance for AI coding**, not installed extension user memory.

1. Read `.memory/manifest.json` and relevant `ai-agents.json`, `developer.json`, `security.json`, `workspace.json`, `regression-testing.json`, `versioning.json` and `release-management.json` and `.memory/role-boundaries.json` before modifying role AI or agent/harness code.
2. Do not bundle `.memory/` in the VSIX or source release ZIP; packaging verification enforces this.
3. Maintain `.atgv/src/extension` and `.atgv/src/library` as verified Git source checkouts, and collect sanitized errors in `.atgv/src/error-logs`. Never replace user-owned work.
4. During the trusted VS Code local-noon maintenance window, verify GitHub PAT read and actual write access by creating and deleting a temporary branch. Disable automatic repair for read-only credentials and preserve all logs.
5. Before fixing a new error, check GitHub for evidence-backed duplicates, read source `.memory` decisions, generate a bounded patch, increment the release version, run tests, push a branch and create a PR; automatically squash-merge only after every required GitHub check succeeds and branch protections permit.
6. Respect user approval, security, existing ATGV folders, and the release checks. Do not record credentials.
7. Increment the release version by one base-100 step for each new release within 0.0.0–99.99.99, overwrite the one root `RELEASE.md`, and keep README limited to version and author metadata.
8. After verified PR merge, use the main-branch CI release workflow to publish a VSIX and checksum. On failure, keep the PR unmerged and surface the blocker; never bypass branch protection.

9. Use the trusted role skill for all 18 SDLC roles. If an explicit artifact request belongs to another role, propose a user-clickable role switch rather than producing it under the wrong role; never switch or assign roles automatically. Informational cross-role coordination remains allowed. Keep the persistent What to do next button available, including offline.

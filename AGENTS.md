# ATGV Extension coding-agent instructions

The source repository's `.memory/` folder contains **approved development guidance for AI coding**, not installed extension user memory.

1. Read `.memory/manifest.json` and relevant `ai-agents.json`, `developer.json`, `security.json`, `workspace.json`, `regression-testing.json`, `versioning.json` and `release-management.json` before modifying code.
2. Do not bundle `.memory/` in the VSIX or source release ZIP; packaging verification enforces this.
3. Maintain `.atgv/src/extension` and `.atgv/src/library` as verified Git source checkouts, and collect sanitized errors in `.atgv/src/error-logs`. Never replace user-owned work.
4. During the trusted VS Code local-noon maintenance window, verify GitHub PAT read and actual write access by creating and deleting a temporary branch. Disable automatic repair for read-only credentials and preserve all logs.
5. Before fixing a new error, check GitHub for evidence-backed duplicates, read source `.memory` decisions, generate a bounded patch, run tests, push a branch and create a PR; never automatically merge.
6. Respect user approval, security, existing ATGV folders, and the release checks. Do not record credentials.
7. Increment version exactly within 0.0.0–99.99.99, overwrite the one root `RELEASE.md`, and keep README limited to version and author metadata.

# ATGV AIATECH Assist v0.3.82 — Repo Sync without GitHub CLI

## Fix
- Remove the unconditional `gh --version` prerequisite that caused `spawn gh ENOENT` on Windows.
- Use authenticated GitHub HTTPS API requests to inspect Repo B, find a matching open PR and create a pull request; GitHub CLI is no longer required.
- Keep Git for temporary Repo A clone, safe Repo B branch creation, staged copy, source provenance commit and push.
- Never place Source or Destination PATs into repository URLs, source files, PR content, command arguments or logs.
- Provide actionable HTTP 401/403/404/422 diagnostics, including fine-grained PAT Pull requests: Read and write permissions.
- Preserve Repo B main, protected release workflows, destination-only files and no-auto-merge rules.

## Tests
- Add GitHub REST client unit tests for repository identity, read/write permissions, existing PR reuse, creation and URL validation.
- Update temp-clone/AI-branch/commit/PR integration test to prove that GitHub CLI is never invoked.

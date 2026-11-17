# ATGV AIATECH Assist v0.3.89 — Preserve source Git branch, commit and PR metadata

## Repo Sync

- New optional **Source PR number** field retrieves the original source PR head branch, title and full description using the Source PAT.
- A source branch can be copied unchanged to Repo B when it differs from the destination PR base. If both sides use `main`, use deterministic `sync/<source-repo>/main-<sha8>` because GitHub cannot open `main → main`.
- Preserve Repo A's exact full commit message without AI rewriting or ATGV trailers.
- For verified source PRs, copy the source PR title/body exactly, never AI-modified. Automatically inspect a source commit's PR association when possible.
- Warn when the latest source commit changes excluded/deleted files. Continue protecting workflows, secrets, .git and other blocked paths.
- Reuse an existing open destination PR on idempotent no-change operations; do not create a duplicate.
- Continue supporting separate, securely stored source and destination PATs. No PATs are included in branch names, commit messages or PR descriptions.

## Verification

- Added `test/v389-repo-sync-source-metadata.test.js` for GitHub PR discovery, source branch reuse, full commit identity and exact PR title/body.
- Updated workspace and AI naming regressions to reflect source-first precedence.
- Tests require Node.js and Git. No live external Repo B mutation occurs in these tests.

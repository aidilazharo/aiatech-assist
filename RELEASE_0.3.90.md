# ATGV AIATECH Assist v0.3.90 — Review Repo A source before Repo Sync

- **Pull & Study Source Code**: Verify PAT access and destination base; clone Repo A into a temporary folder and study tracked code files, functions/classes, language extensions, dependencies, package scripts, test paths and the latest commit.
- **Review suggestions**: Display editable branch, commit message, PR title and simple description fields. Keep source PR metadata as the starting point when available.
- **Approve & Run Full Sync**: Re-verify credentials and re-clone Repo A. Require the reviewed source SHA and destination base SHA to remain unchanged, then copy eligible tracked files, commit, push and create the destination PR.
- Source study is read-only for Repo B; changing source/destination invalidates the preview.
- Preserve Repo B-only files, protected workflows and credential exclusions; never auto-merge a destination PR without a separate review.
- Offline integration tests validate source analysis, no mutation before approval, SHA freshness checks, and reviewed PR metadata.

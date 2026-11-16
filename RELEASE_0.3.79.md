# ATGV AIATECH Assist v0.3.79 — Library fix, reinstall cleanup, AI Repo Sync

## Library version and startup
- Compare the verified local Library VERSION against `tech-stacks-skills/main` with its pinned commit SHA.
- Display an installed Library and newer GitHub-available version separately on both the welcome screen and header (e.g., v1.1.12 → v1.1.15 available).
- Global cached downloads are not treated as installed workspace Libraries. A missing Library appears as *not installed* instead of a false current version.
- Run startup/hourly checks read-only. Offer a user-confirmed **Pull Catalog** and verify active checkout version and SHA; refresh the dashboard promptly.
- Display errors instead of falsely claiming a completed update.

## Reinstall cache hygiene
- Use extension version, installed path and manifest creation time to identify a new installation or same-version reinstall.
- Clear only disposable VS Code **global** storage caches (`sdlc-catalog`, `verified-webview-libraries`, `updates`) on reinstall, never on routine window reload.
- Preserve project checkout, .atgv data and imported offline ZIP evidence, BRs, Git repositories, Jira/Confluence state, credentials and user settings.
- Reject unsafe cache symlinks before any cleanup.

## Repo Sync: source → temporary clone → AI → destination → PR
1. Source and Destination accept masked `https://USERNAME:PAT@github.com/OWNER/REPO` URLs.
2. **Test Connection** appears independently for both URLs; verify source read access and destination write access using the GitHub API.
3. Remove URL credentials from the form immediately; store verified PATs only in VS Code SecretStorage. Git and GitHub CLI receive credentials via their process environments, never command-line URLs.
4. Clone the selected source branch into a temporary folder and read **safe source metadata** (repository identity, commit SHA/message, filenames, basic package details) for AI.
5. AI proposes a review branch under the restricted `sync/<source-repo>/...` namespace, commit message and PR title/description. Invalid/missing AI output falls back to deterministic safe values.
6. Create/reuse the guarded branch in a *clean destination repo outside the ATGV workspace*. Copy only eligible tracked files; exclude secrets, Git internals, dependencies and release workflows.
7. Stage as `git add .` with an explicit allowlist check, commit using the AI message plus traceable source-repo/SHA trailers, push and open/reuse a PR with AI-written details.
8. Never push directly to destination main, merge PRs, or silently overwrite destination-only files.
9. Remove the temporary source clone at the end, including after failures.

## Tests
- Reinstall caches, preserved project data, symlink safety and version semantics
- Startup check is read-only; manual Pull is verified
- Credential-bearing URLs, token secrecy and exact read/write permissions
- AI branch-name restrictions and full temp-clone → AI → commit → PR integration

Note: GitHub Repo Sync does not transfer application-level secrets and does not run tests in destination Repo B. Review and test the PR before merging.

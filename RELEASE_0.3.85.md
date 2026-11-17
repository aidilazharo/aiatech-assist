# ATGV AIATECH Assist v0.3.85 — Saved GitHub connections and descriptive Repo Sync changes

## Repo Sync: saved Source and Destination connections

- Select previously verified GitHub repository URLs from independent **Saved Source connections** and **Saved Destination connections** dropdowns.
- Use **+ Add another repository...** to test and save a new repository. Existing saved entries remain available.
- Store only canonical, credential-free URLs in VS Code globalState (up to 30 per role). PATs stay independently keyed by repository and Source/Destination role in VS Code SecretStorage.
- A saved entry is not assumed to be currently connected: selecting it still verifies the saved PAT and repository permissions before syncing.
- **Forget selected** deletes the role-specific saved PAT and removes its URL entry after confirmation, without deleting the other role's credentials.
- Migrate the previously saved single Source/Destination URL into the new lists without losing it.
- One-time credential input is submitted only to the trusted extension host for verification; PATs are never returned in webview result messages or written to GlobalState, Git command arguments, branch names, commit messages or PR descriptions.

## Repo Sync: meaningful branch, commit and simple PR text

- Inspect Repo A's verified HEAD commit subject and changed paths before preparing Repo B changes.
- Create an intent-based branch such as `sync/tech-stacks-skills/remove-non-release-workflow-2a50944d`, not `sync/tech-stacks-skills/main`.
- Prefer the source commit's meaningful subject for the destination commit, retaining traceability trailers for source identity and SHA.
- Reject generic AI naming proposals such as “Sync tech-stacks-skills from main”. Fall back to sanitized changed filenames when the source commit is generic.
- Ask AI for short, factual, source-grounded PR details; use deterministic details if the AI is unavailable. Do not claim unexecuted tests passed.
- Preserve safety checks for separate PATs, protected files, clean destination checkouts and a user-reviewed Repo A → Repo B pull request.

## Regression coverage

- `test/v385-repo-sync-saved-connections.test.js`: multiple Source/Destination saved URLs, role-isolated PAT reuse and forget, dropdown rendering and commit-based naming.
- Updated `test/v374-workspace-sync.test.js` and `test/v379-repo-sync-ai-flow.test.js` for descriptive naming and explicit branch fixtures.

## Publication

- **Extension development commits pushed directly to `main`; no extension PR created.**
- Repo Sync's own feature still creates review pull requests **between Repo A and Repo B**, as requested.
- JavaScript source/static consistency checked. Full Node/VS Code extension-host tests have not been run in this connected-repository environment.

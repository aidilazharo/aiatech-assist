# ATGV AIATECH Assist v0.3.83 — Remember PAT-protected Repo Sync URLs and clone empty Repo B folders

## Repo A / Repo B credentials
- Remember last tested Source and Destination repository URLs after a successful PAT permission test.
- Never save a raw username:PAT URL. VS Code globalState stores only canonical credential-free HTTPS URLs, while independent PATs remain in SecretStorage by repository and role.
- Restore both saved URLs and indicate whether a PAT is stored when reopening Repo Sync; do not claim a saved connection has been reverified.
- Re-verify saved PATs when the user starts a sync.

## First-time Repo B setup
- Accept an existing clean Repo B Git root or an empty external folder outside the ATGV workspace.
- Before using an empty folder, verify destination PAT, GitHub identity and PR base, then clone Repo B directly into the selected folder using Git.
- Reject nonempty non-Git folders, nested Git directories, incorrect origins and unsafe changes; never reset or delete local user files.
- Keep AI-assisted source clone, safe review-branch, stage, commit, push and GitHub REST PR creation unchanged.

## Regression
- Tests cover secure saved URL restoration and SecretStorage isolation, automatic Repo B empty-folder cloning with an unchanged base, and protection of populated non-Git directories.

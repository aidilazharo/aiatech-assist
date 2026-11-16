# ATGV AIATECH Assist v0.3.74

## New dedicated ATGV: Workspace webview

Run **ATGV: Workspace** from the VS Code Command Palette. It opens a separate webview without replacing **ATGV: Start** or disrupting the SDLC dashboard.

The Workspace page contains:
- **Repo A** URL (always retrieves the latest `main` commit) and the optional relative path to copy.
- **Repo B** native folder picker for an existing local Git checkout, with an optional PR base branch (defaults to the GitHub repository's configured default).
- **Create Branch, Commit & PR**, progress/status feedback, and **Open Created PR**.

When confirmed, ATGV uses Git and GitHub CLI to:
1. Clone Repo A main into a temporary folder and record its verified commit SHA.
2. Ensure Repo B is clean, verify that its local origin matches GitHub, and fetch its remote PR base.
3. Create a uniquely named `sync/<repo-a>-main-<sha>-<timestamp>` branch in Repo B.
4. Copy only eligible tracked files, preserving Repo B-only files, protected GitHub release workflows and credentials.
5. Stage, commit with source provenance, push the new branch, and create a review PR with the exact source SHA, destination base, copy scope and changed paths.

The workflow never merges the PR or directly updates Repo B main. It works on Windows, macOS and Linux with `git` and `gh` on PATH. Authenticate once using `gh auth login` and, if private Git clones require it, `gh auth setup-git`.

**Repository maintenance:** ATGV extension source updates continue to push directly to the extension's `main`; the new Workspace PR is an explicit, separate operation against the *chosen Repo B*.

The SDLC Library version and its release workflow are unchanged.

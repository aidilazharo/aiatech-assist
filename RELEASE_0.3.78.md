# ATGV AIATECH Assist v0.3.78 — PAT-based Repo A → Repo B synchronization

## Repo Sync workflow
- Source Repo A and Destination Repo B each use their own GitHub Personal Access Token. PATs are entered through native VS Code password dialogs and saved in encrypted VS Code SecretStorage, scoped to the repository.
- No PAT goes into webview HTML, repository URLs, Git arguments, source files, or PR body. Git uses per-process HTTPS authentication headers; GitHub CLI uses the destination PAT from its temporary environment.
- Choose Repo A branch (default `main`) and optional copy scope; choose a clean local Repo B Git root and confirm its GitHub HTTPS origin.
- Reject a Repo B folder that is the current ATGV workspace or any ancestor/descendant of it.
- The review branch retains the source branch name under `sync/<source-repo>/<source-branch>`. Create it from Repo B's selected PR base when absent; reuse only an existing ATGV-marked remote branch with an identical local head.
- Copy eligible tracked files, preserving Repo B-only files, secrets, generated dependencies, Git internals, and release workflows.
- Reuse Repo A HEAD commit message in the destination commit, with traceable source-repository and SHA trailers.
- Push with Repo B PAT and create or reuse an open pull request. Never push to Repo B main or merge the PR.
- Generate a brief PR description using the configured AI provider from verified metadata (names, SHAs, and copied file paths), not document content or PATs. A deterministic review description remains available if AI is unavailable.
- One primary button executes validation, source checkout, destination branch creation/reuse, copy, commit, push, and PR publication. Native PAT and confirmation dialogs appear as needed.

## Compatibility
Git and GitHub CLI must be installed. Destination Git origin must use HTTPS for PAT authentication. Repo B must be clean before the operation. Existing user changes are never reset or overwritten outside explicitly selected eligible paths. 

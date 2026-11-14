# ATGV AIATECH Assist v0.3.47 — Local-only Reset with preserved settings

## Behavior

`ATGV: Reset` permanently deletes all ATGV-managed local project work, repositories,
local branches/worktrees, unpushed commits, BR drafts, generated artifacts and caches,
then restores clean projects from configured remote GitHub repositories and the
verified main-branch SDLC Catalog. It does not mutate or delete any remote GitHub
repository/branch, Jira issue, or Confluence page. Use **Delete Everywhere** inside
the BR workflow only when remote deletion is genuinely intended.

**Preserved:** all extension-wide VS Code settings, extension connection settings,
SDLC Catalog configuration, provider preferences, GitHub/Atlassian/AI credentials,
project identity, and project-level connection mappings needed for a clean restore.

**Cleared:** local execution state, project-scoped working files, approvals and
history, project-local Git worktrees, and downloaded project-specific caches.
The selected technology stack is retained as project configuration but previous
approval and successful server verification must be repeated.

## Safety

1. A modal preview and exact typed confirmation are required.
2. Fresh GitHub project clones and the catalog are staged and verified before
   any original local project work is removed. Failed downloads preserve local
   data, with the temporary download removed.
3. Repository clones start from each project's explicitly configured branch,
   its configured GitHub branch, or its previously recorded integration base.
   The former pushed bootstrap branch is **not** automatically checked out.
4. Only ATGV-owned `.atgv` directories are eligible for local deletion; unrelated
   workspace files are untouched. Unsaved editors must be closed first.
5. If local filesystem replacement fails after deletion begins (e.g. Windows
   file locks), the error explicitly says that local recovery may be incomplete.
6. Previously pushed remote bootstrap scaffolds are left unchanged. Cloning a
   clean integration branch does not by itself migrate an outdated committed
   scaffold if the user subsequently switches back to that old branch.

## Verification

New coverage: `test/v347-local-only-reset.test.js` and updated VS Code host
`test/extension.test.js`. The complete regression suite was run separately, and the VSIX packaging
script performs integrity and activation verification. No live Jira/Confluence/
GitHub calls were performed in these automated tests.

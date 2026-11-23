# ATGV AIATECH Assist v0.0.69

Release date: 2026-11-23

## Library-first lightweight extension
- Correct the Library Git checkout to `.atgv/library/` (no nested `repository`).
- Migrate `.atgv/sdlc-catalog` and the previous nested Library checkout without discarding Git history; preserve old user-created templates and SDLC assets in a reviewable backup.
- Keep shared SDLC process/role/workflow definitions and Markdown templates in GitHub Library v0.0.7 instead of copying default files into every new project.
- Read shared templates from pinned Git HEAD, with project-level overrides and an initial safe fallback when no Library is installed.
- Exclude duplicate `resources/defaults/sdlc` and `resources/defaults/templates` assets from the VSIX; retain essential runtime code, safety checks and local project state.
- Preserve project documents, approvals, knowledge, memory, Git repositories and customized SDLC files.

## Verification
- Added migration and Git integrity regressions, plus updated project initialization tests.
- GitHub Actions regression, Windows checks, UI check and VSIX build are required before releasing.

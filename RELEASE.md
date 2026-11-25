# ATGV AIATECH Assist v0.1.31

## Changes

- Enable Custom Stack Install & Run after a runnable application is scanned, even if its Git repository has no initial commit.
- Review the exact eligible source-file list and obtain explicit confirmation before creating the first local Git commit. Exclude ignored files, sensitive paths, likely embedded secrets, binaries and dependencies. Preserve all excluded working files and pre-existing Git staging/history. No GitHub push occurs from the project workflow.
- Verify the new SHA and continue the existing six-stage workflow. Dirty working trees remain runnable in-place. The optional AI advisory does not gate execution.

## Validation

- JavaScript syntax checks performed; new initial-commit regression tests added. Full regression, Windows runtime and VSIX packaging not yet verified.
- npm access-policy errors remain separate; no policy bypass or package substitutions in this release.

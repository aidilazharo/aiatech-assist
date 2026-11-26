# ATGV AIATECH Assist v0.1.41

## Changes

- Correct the remaining Developer server regression assertion to match normalized imports in the generated source-test index.
- Scope assertions to the server startup handler and explicitly verify project, BR, worktree, initial checkpoint, preview permission, approval revisions and browser launch ordering.
- Keep all regression tests and production safeguards unchanged.

## Validation

- v0.1.40 macOS build: 2,734 passed, one failed, three skipped.
- Corrected assertions checked against reconstructed current source; full regression and VSIX build not executed in this environment.

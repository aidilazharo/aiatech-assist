# ATGV AIATECH Assist v0.1.7

## Changes

- Align six regression failures reported by the v0.1.6 macOS test log with project-scoped Jira inventory, Developer role ownership and dual Workspace profiles.
- Require the current project's loaded Jira inventory before starting Developer work or Draft Preview; allow stopping in-progress work even if inventory becomes stale.
- Verify a real temporary Git checkout and its cleanup in the Workspace publication regression test; preserve existing cleanup and PAT protections.
- Keep the shared Workspace operation lock held when another profile requests Forget Connection or opens a folder picker.

## Validation

- Previous macOS run: 2,673 tests, 2,664 passed, 6 failed, 3 skipped. No failing tests removed or skipped.
- Targeted Developer renderer, dual-profile credential UI, project scope assertions and JavaScript syntax checks passed in an isolated JavaScript harness. Full Node regression suite and real Git checkout regression have not been executed here; no VSIX packaged.

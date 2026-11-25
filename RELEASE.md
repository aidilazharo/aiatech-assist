# ATGV AIATECH Assist v0.1.27

## Changes
- Consolidated Windows regression compatibility changes based on the v0.1.26 build log: deterministic Git fixture line endings, LF/CRLF source and generated stylesheet comparisons, and canonical text-only catalog fixtures.
- Update test mocks to interpret actual npm CLI and Maven cmd.exe argument wrappers; use the production npm launcher in the real subprocess test.
- Close the activated extension and workflow journal before removing the integration test workspace.
- Use platform-native temporary paths in approval tests and slash-normalized mock webview URIs; update assertions for independent project repository validation and repository-grounded UI/UX metadata.
- Resolve the actual Git worktree root before safe Workspace checkout cleanup; retain identity, branch, PR and clean-tree checks.
- Isolate prerequisite checks from machine-specific installed-tool fallback and test Windows executable lookup.
- Preserve existing regression tests; add command-wrapper coverage.

## Validation
- Full Windows regression execution and VSIX packaging remain to be verified on a build host.

# ATGV v0.3.70

- Offline ZIP import activates the verified SDLC Library immediately, even when an older Git catalog is present.
- Re-importing an unchanged library ZIP is safe; a newer verified ZIP replaces the old version.
- Technology stack prerequisites list all five supported stacks with live scan progress.
- Jira, Confluence and GitHub connections remain a required visible startup step on a fresh Start.
- Existing project opening shows progress through workspace and connection initialization.
- Previously introduced GitHub organization IP allowlist diagnostics remain enabled.

The enterprise PR checkout HTTP 403 still requires an organization-approved runner/network.

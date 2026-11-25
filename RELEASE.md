# ATGV AIATECH Assist v0.1.5

## Changes

- Developer BR choices now use verified live Developer task assignments and the exact current approved BR revision, independent of Epic ownership.
- Refresh Developer Jira inventory with read-only Confluence Source Vault synchronization, selectively recover missing approved BRs from verified Jira mappings, refresh local register and SQLite mappings, and publish shared BR state promptly after successful BA publication.
- Never infer approval from a Jira title, overwrite divergent local BRs, revive deleted records or claim another role's task. Show synchronization diagnostics and preserve whole-role ownership requirements for development.

## Validation

Targeted source-function and syntax checks performed; full Node regression and live Jira/Confluence integration were not run in this environment. No VSIX packaged.

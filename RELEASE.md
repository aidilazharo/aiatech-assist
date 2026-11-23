# ATGV AIATECH Assist v0.0.72

Release date: 2026-11-23

## Changes
- Preserve published Business Requirements and Jira links when Jira returns HTTP 404; record verification-required metadata instead of automatically hiding or unlinking items.
- Restore previously archived Jira links when their identity becomes visible again.
- Allow verified read-only Jira project connections. Create Issues permission is required only for publishing.
- Add per-project `.atgv/memory/project-<id>.sqlite` cache for immutable Jira issue IDs, current keys, hierarchy, status, scanned inventory and BR-to-Jira mappings.
- Integrate the Jira SQLite cache with BA/PM project inventory and role work views without replacing the existing BR register.
- Require VS Code 1.101 or later because the extension's SQLite components need the Node.js 22 runtime supplied by VS Code.
- Add regression tests for visibility changes, read-only connections, project isolation, key changes and scan completeness.

## Data safety
- Jira remains authoritative for Jira issues; the existing BR register remains authoritative for approved BR state.
- SQLite cache writes never delete Jira issues, remap approved requirements or clear previous SQLite data.
- Provider credentials stay encrypted separately in `credentials.sqlite`.
- Existing project AI-memory SQLite databases and source documents are preserved.

## Verification
- Run the full Node.js regression suite, Windows reset checks, UI validation and VSIX packaging in the existing GitHub Actions release workflow.

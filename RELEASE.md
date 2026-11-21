# ATGV AIATECH Assist v0.0.24

## My Work Users — Confluence Database API v2 and DataTables

- Register one verified Atlassian account per identity and safely reconcile duplicated legacy email/name rows.
- Use project-scoped Confluence Database v2 `GET /databases/{id}`, `POST /databases`, and versioned `/databases/{id}/properties` for structured My Work user records.
- Retain the existing human-readable Confluence page register for compatibility and Project Manager permissions; report Database v2 synchronization failures instead of hiding them.
- Add a Project Manager–authorized **Add Verified User** control. Verify the Jira account ID and assignment permission, without assigning any SDLC role on another user's behalf.
- Replace the static roster with offline ATGV DataTables search, sortable columns, five-row pagination and a bounded Jira-task preview.

## BR evidence recovery and destructive Reset protection

- Add **Recover from Confluence** for Jira-only BRs such as TC-834, with user confirmation and a strict BR-to-Epic mapping check against the source vault manifest.
- Verify current Jira Epic identity and Confluence source checksums; reject missing evidence, mismatched project identity, duplicate Jira keys and conflicting local ownership.
- Restore only the selected BR's mappings and archived source metadata. Do not fabricate missing discovery answers, overwrite other local BRs or delete remote Jira issues during recovery.
- Preserve the existing **Delete Everywhere** permission, ownership and confirmation checks; use them only after a BR is genuinely restored.
- Block destructive ATGV Reset for projects with uploaded originals until Confluence source-vault upload and subsequent read verification succeed.
- Continue to preserve divergent local and Confluence copies for manual reconciliation.

## Technical and security notes

- The documented v2 Database GET endpoint returns metadata, not native Confluence database table rows. ATGV stores the versioned roster in Database Content Properties API v2.
- Confluence CQL is used only to locate an existing database ID because the linked Database API does not provide a listing endpoint.
- Experimental or unavailable v2 operations report a warning; they do not silently wipe the legacy Confluence register.
- Keep `.memory` excluded from distributable VSIX and source ZIP assets.

## Verification gate

Run the complete Node.js regression suite, Windows Reset checks, UI theme validation and VSIX packaging on the pull request. **Do not merge or publish a release unless all required checks pass.** A live Atlassian test of experimental Database v2 endpoints remains necessary before claiming production compatibility.

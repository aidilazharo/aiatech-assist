# ATGV AIATECH Assist v0.3.77 — Verified Library Pull & Safer BR Ownership

## Library update verification
- Pull Library and Solution Architect catalog pulls must verify the currently active workspace library against the pinned GitHub main commit and validated semantic version.
- Fail loudly instead of saying "Updated" when an old checkout, mismatched SHA, or equal/older offline ZIP remains active.
- Keep a deliberately newer offline ZIP active without claiming that the older GitHub catalog replaced it.
- Keep installed and available library versions independent of the VS Code extension version. A GitHub main v1.1.15 cannot be represented as installed until an actual checkout is verified.

## UI
- Tighten the AIATECH ASSIST title and library version spacing under the existing logo, aligned within the logo height.
- Retain lowercase Jira email and far-right user guide action.

## Deletion ownership
- Verified, live Jira/Confluence BR ownership is required for destructive deletion, not just Business Analyst role access.
- An uploaded source linked to multiple BRs can only be deleted by a user who owns every affected BR.
- Recheck owner before local deletion and each destructive remote action, protecting against a transfer during a delete operation.
- Preserve existing warnings, explicit DELETE confirmation, remote identity validation, and shared-artifact protection.

## Remaining cross-repository backlog
- Unified BR/Jira table with inline revision management and revision impact indicators.
- Automatic immutable original PDF/DOCX Confluence attachment archive, remote metadata index, and cross-computer verified redownload.
- Source archive deletion handling and permissions across all future attachment records.

Scope: Extension only. No SDLC Library repository edits or version changes.

# ATGV AIATECH Assist v0.3.75

## Verified library version comparisons
- Always resolve GitHub SDLC Library `VERSION` and `catalog.json` from the same immutable main commit before deciding whether an update is available.
- Compare installed and remote **semantic version numbers**. A changed Git commit SHA without a newer library version does not trigger an update.
- Show **Installed v1.1.12 → Available v1.1.15**, not a Git commit SHA in the new-version field. Show version strings in Catalog and Software Update status. Keep SHA internally only to pin and verify content.
- Do not offer downgrades or unverified remote versions.

## Branding and identity
- Move `Extension v0.3.75 · Library v...` from underneath the logo to underneath **AIATECH ASSIST**, on both the main header and the start screen.
- Display the actual configured Jira account email address, normalized to lowercase, rather than inferring a full name.
- Move **Interactive User Guide** to the far-right end of the header, after the email address.

## Business Requirements evidence
- Add **View 12 Answers** on completed BR records that contain saved discovery answers. This expands the record and opens the Discovery Answers tab.
- The expanded completed BR keeps its **Approved Requirement** tab and original source-document download link.
- Jira-only Epics marked **Unlinked to local BR** explicitly explain why discovery answers and original uploaded documents cannot be shown without the original ATGV project folder. Add a **Switch Project** action to help locate that project.
- No data is invented or backfilled from Jira when original evidence is unavailable.

Release remains a direct push to extension `main`. SDLC Library remains independently versioned.

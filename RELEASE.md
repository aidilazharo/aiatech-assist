# ATGV AIATECH Assist v0.0.34

## Business Analyst requirements and source workflow

- Fix BR generation confirmation dialogs showing literal backslash-n sequences. Display real paragraph breaks in both AI and source-only generation decisions.
- Automatically claim newly created, unassigned BR drafts for the live verified Business Analyst. When the BA workspace is opened, claim remaining unassigned draft BRs once per verified batch. Never transfer existing ownership, override pending transfer requests, or queue unverified offline claims.
- Remove the redundant **Remove Source** action from Uploaded Documents. Rename the destructive **Delete Everywhere** button to **Delete**, retaining the existing complete deletion preflight and explicit confirmation.
- Display **AI document preflight** as a collapsed summary by default, with findings and report exports in an expandable details section.
- Rename the TXT export to **Download Pre-flight Analyst** with `ATGV-Preflight-Analyst-...` filenames; preserve the original preflight audit evidence and text format.
- Replace the Working BR Markdown download with **Download ISO 29148 Business Requirements**. Generate an offline, pagination-aware A4 PDF with structured BRS sections (business purpose and scope, management, operations, requirement records, acceptance criteria, traceability, verification and original-source appendix).
- Use only integrity-verified working BR text and current saved requirements. Missing facts remain explicitly pending human review. No assertion of ISO certification, final approval, executed tests or unchanged-source modifications.

## Verification

- Add unit regressions for PDF structure and pagination, no invented approvals, duplicate ownership safety, visible labels and real line breaks.
- Run Node regression suite, Windows checks and VSIX artifact integrity before merging.

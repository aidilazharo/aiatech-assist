# ATGV AIATECH Assist v0.0.73

Release date: 2026-11-23

## Changes
- Use accessible SVG icon buttons with tooltips for source document Replace & Reprocess, Delete, PDF/report download, Save, Refresh and Publish controls.
- Always show the five Business Analyst result sections, initially collapsed: Business Documents, Discovery, Generated Requirements, Jira Work Items and Completed requirements.
- Display independent section states: Not started, In progress, Ready, Needs attention and Completed, based on available BR/Jira evidence.
- Move document upload and discovery form controls inside their corresponding always-available sections.
- Reuse the verified, pinned Quill library to display and edit source document text; original document text remains read-only.
- Preserve plain-text source persistence and the existing ISO 29148 formatted viewer, Jira publishing approvals and deletion confirmations.
- Continue to use the textarea fallback when the approved Quill assets have not been installed; no CDN script or extra third-party JS is bundled in the VSIX.

## Verification
- Run the full Node.js regression suite, Windows reset checks, UI validation and VSIX production packaging before publishing.

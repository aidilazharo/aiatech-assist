# ATGV AIATECH Assist v0.4.57

## Unified workspace breadcrumbs

- Add blue, accessible breadcrumbs above the page title on every workspace page, replacing the hard-coded blue kicker text.
- Route BA navigation as My Work, My Work / Business Requirement and My Work / Business Requirement / BR-01 (or the actual selected BR ID).
- Refresh breadcrumb trails when switching pages, selecting BA milestones, opening and closing BR editors, viewing completed BR or Jira-only Epic details, selecting Developer BRs and opening document/design previews.
- Render the full nested breadcrumb inside BR modal dialogs, so the selected BR is visible even when a modal covers the page header.
- Make ancestor segments navigable while respecting unsaved Business Requirement and document edits. Current-page labels are not clickable.
- Add responsive width handling, keyboard-visible focus, aria-label=Breadcrumb and aria-current=page.
- Keep user-initiated navigation client-side; it does not reload the webview or alter Jira/Confluence data.
- Add regression coverage for every main workspace page and BR-01/BR-02 breadcrumb identity.

## Quality gates

- Run full Node.js regression tests, Windows startup/reset test, UI theme consistency check, and VSIX compilation/activation verification.
- No SDLC Library changes; Library remains v1.1.17.

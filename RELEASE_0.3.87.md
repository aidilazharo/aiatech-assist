# ATGV AIATECH Assist v0.3.87 — Unified Business Requirements card layout

## Business Analyst → My Work → Business Requirements

- Jira-only Epics (unlinked to the local BR register) now use the **same collapsed accordion row** as locally completed Business Requirements, including background, border, caret, title, status placement, and right-aligned actions.
- Display a normalized heading such as `BR-001 · Person Name CRUD Interface` rather than repeating `BR-001` twice.
- Show Jira's actual status and **Unlinked to local BR** instead of fabricating an approval/revision state.
- Display **View 12 Answers** in the matching action position but disabled when discovery answers are not available locally. Explain unavailability accessibly.
- Display **View Jira · N linked** in the matching position; it still opens the existing Jira Epic. N reflects verified Jira descendants and does not imply reconstructed source evidence.
- Expanding a Jira-only row reveals its Jira Epic key, linked descendant count, status, and an explanation of missing local source documents/discovery answers.
- Preserve which Jira-only rows are expanded when inventory updates rerender the list.
- **No BR, Jira, Confluence, approval, or artifact data is modified** by this visual change.

## Included v0.3.86 improvements

- Welcome-screen version line moved closer to the AIATECH ASSIST heading.
- Top-bar extension/library version text enlarged.
- Successful Test & Save Connections button is hidden and disabled until the tested settings change.

## Regression tests

- New `test/v387-jira-only-br-accordion.test.js` checks the rendered row, disabled evidence action, functioning Jira action, expanded-state persistence, and shared styling.
- Updated previous BA Jira-only renderer tests to expect the unified row instead of the legacy card.
- GitHub Actions runs the full regression suite, UI validation, VSIX packaging, and source ZIP verification.

## Publishing

- All changes pushed directly to GitHub `main` without a pull request.

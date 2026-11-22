# ATGV AIATECH Assist v0.0.49

## Business Requirements navigation and Jira overview

- Remove only the redundant visible "Workflow" title while retaining the four-stage animated progression and accessible workflow label.
- Remove the unnecessary outer visual card around the All Jira Project Items overview, retaining a single standalone Jira DataTable panel.
- Move **BUSINESS REQUIREMENT IN PROGRESS** above the Jira table, preserving New/Resume/Restart/Delete actions and existing permissions.
- Fix Jira DataTable BR links: the details modal was nested inside the hidden Business Requirements workflow and never visible from the separate overview. Host the same modal directly under the visible workView instead.
- Preserve exact local BR evidence and Jira-only Epic links with explicit lack-of-local-evidence labels. Do not fabricate missing discovery answers.
- Style the now-visible BR modal with an independent scroll viewport, responsive width, accessible close button and preserved completed-BR revision tabs.
- Close the modal when leaving the BA overview and preserve proper focus/role navigation.
- Extend regressions for modal placement, route lifecycle, top-card order and the existing DataTable links.

## Validation

- Node suite, Windows startup/reset, theme checks and VSIX artifact checks must pass CI.
- Jira/Confluence mutations and BR processing logic are unchanged.

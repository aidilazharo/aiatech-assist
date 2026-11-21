# ATGV AIATECH Assist v0.0.33

## Workspace navigation and My Work layout

- Remove duplicate blue breadcrumb trails from all right-pane pages and BR dialogs. Keep native page headings and workflow safeguards.
- Fix excessive black band above My Work chat by reducing the original 94px clearance to 42px on desktop, 34px narrow layouts and 24px short-height layouts while avoiding waveform overlap.
- Only display Library Studio for the currently active **Developer** (`software-developer`) role. Hide it from keyboard navigation when the role is not active.
- Block direct Library Studio navigation for other roles and prevent automatic restoration from bypassing the active-role gate.
- Leave SDLC, Documents, Solution Designs, Knowledge & RAG and Approvals & Handoffs navigation intact; their consolidation remains a proposal.

## Verification

- Update regression tests for breadcrumb removal and safe My Work waveform/chat clearance.
- Validate role-filtered Library Studio navigation, Node regression tests, Windows checks and VSIX packaging before merging.

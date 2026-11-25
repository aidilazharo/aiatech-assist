# ATGV AIATECH Assist v0.1.34

## Changes

- Require UI/UX generation to use the committed project repository and user-uploaded design references; disable independent AI visual design and Library-only fallback.
- Include repository design evidence and linked uploaded reference observations in Developer planning, TDD, draft, final UI and recovery prompts. Require current approved handoff reference fingerprints and reject UI-file changes without uploaded references.
- Make reference upload mandatory for new UI/UX generation; preserve backend-only work without UI changes. Reject stale references and require review before approval/publication.
- Apply the source policy to role chat guidance and legacy Developer implementation proposals; route legacy visual design generation through the ticket-based UI/UX workflow.

## Validation

- Changed JavaScript syntax checked and source-policy regression tests added. Full test suite, runtime UI fidelity and VSIX packaging not verified.

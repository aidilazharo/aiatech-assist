# ATGV AIATECH Assist v0.4.43

## Fix: BA mapping conflicts remain reviewable

- Process every extracted Markdown BR section in order, preserving resumable AI preflight and mapping checkpoints.
- Do not discard completed mappings when a validated preflight or cross-section check reports potentially conflicting business rules.
- Record unresolved source and cross-section findings in the saved requirements mapping and downloadable BA preflight report, including section and evidence excerpts.
- Display findings for Business Analyst review instead of returning a fatal `processDiscoverySources` error.
- Require explicit source-revision-linked BA acknowledgement when confirming or skipping AI Review. Acknowledgement does not modify the original source or automatically approve any Jira issue.
- Preserve existing approval, source-integrity, and Jira publication safeguards. AI failure without reviewable evidence remains a technical error.
- Add regressions for preflight contradictions, cross-section contradictions, acknowledgement detection and the former fatal-error behaviour.

## Compatibility

- No project-register schema migration is required. Previously approved BRs and linked Jira items are not modified by the update.
- A changed uploaded document or fresh discovery revision invalidates the previous acknowledgement and must be reviewed again.
- The original uploaded document remains unchanged. Cross-section warnings remain open business decisions until the BA resolves or accepts their documented risk.

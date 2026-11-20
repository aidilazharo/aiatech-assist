# ATGV AIATECH Assist v0.4.53

## Phase 1 — Critical fixes
- Consolidate AI Review findings when models repeat numbered or named discovery keys; clarify conflicting replacement answers and retry malformed responses once.
- Persist Confluence roster Jira account IDs in an actual table column; refresh and reconcile current signed-in PM identity without bypassing Jira Assign Issues and role/assignability checks.
- Keep Question 12 open decisions separate from navigation into draft review. Never auto-answer "None".

## Phase 2 — BR rerun and source support
- Add **Re-run BR** with re-map saved source, upload revised source or re-run Jira preflight options; all retain existing approved BR and Jira history.
- Add offline XLSX source import with worksheet/row provenance and intact Epic, Story, AC and DoD text.
- Preserve source snapshot checks, Jira CREATE/UPDATE/retirement approvals, publish checkpoints, and published issue identity.

## Phase 3 — TRM-based suggestions and RAG
- Add project-scoped proposed TRM Story DoD reference and explicit Business Analyst approval before the nine-item checklist becomes applicable.
- Offer non-destructive, source-backed Acceptance Criteria and approved DoD suggestions in Jira Preview.
- Store approved template with source version, approval actor and date in searchable project knowledge; improve metadata-aware lexical retrieval.

## Phase 4 — Quality and release
- Add Jira preview quality assessment and display unchanged SKIP counts and missing Story AC/DoD review warnings.
- Expand regression tests for AI review, Confluence roster identity, BR rerun, XLSX, template approval and safe Jira field suggestions.
- Build and verify v0.4.53 VSIX; no remote Jira issue modifications during upgrade.

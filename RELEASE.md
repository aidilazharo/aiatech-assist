# ATGV AIATECH Assist v0.4.42

## Shared durable Workflow Jobs engine — cross-role foundation

- Introduce `src/atgv-job-engine.js`, a persistent, centralized workflow journal with SQLite storage where supported by the VS Code extension host (Node.js 22.13+) and an atomic, permission-restricted JSON fallback.
- Track long-running Business Analyst, Solution Architect, UI/UX Designer, Developer, Project Manager, startup, library and remote integration operations using the same job IDs, state model, metadata and diagnostic controls.
- Record verified section checkpoints for Business Requirements AI mapping while preserving existing authenticated AI mapping checkpoints, original DOCX/PDF files, saved reviews, and approval gates.
- Store metadata and SHA-256 hashes only; never persist AI prompts, source document text, GitHub PATs, Jira tokens, or other credentials in workflow histories.
- After a host interruption, classify uncompleted AI/read operations as interrupted and remote writes/installations as needing reconciliation. Never automatically resubmit Jira, Confluence, GitHub writes or server installs.
- Add a global **Workflow Jobs** icon, per-job status, phase, progress, sanitized failure information, and an explicit Prepare Resume action for eligible AI/read operations. Actual retries are initiated from existing role workflows after input and permission verification.
- Provide reusable bounded exponential-backoff retry logic for AI/read calls. Remote writes and installs are prohibited from automatic retry.
- Add regression tests for crash recovery, SQLite/fallback storage, identity checks, stage checkpoints, retry boundaries, symlink protection and UI/host integration.

## Rollout and compatibility

- All existing BA, SA, UX, Developer, PM, library and Jira actions remain in place; the shared journal wraps their existing operation handlers rather than migrating all business logic at once.
- The BA source-mapping pipeline still uses its existing integrity-protected per-section AI resume mechanism; new shared job checkpoints augment rather than replace that domain-specific state.
- Future stages can attach role-specific recovery adapters. Generic Prepare Resume never runs arbitrary old commands because permissions, remote work and source revisions may have changed.
- Project approval, Jira preview, publication and external updates retain independent confirmations and reconciliation gates.

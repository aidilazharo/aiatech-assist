# ATGV UI/UX implementation tracker

Baseline: `d26dcc7543348aae7cf9941c44768b7d544ce89c` (extension 0.1.66). 2026-11-29 MYT.

0/40 fully verified; items 02, 03, 11, 13, 17, 18, 28, 31, 34, 36 and 37 are in progress; item 05 implemented — cross-role verification pending. Pending means not yet verified against the complete acceptance criteria.

| ID | Priority | Description | Status |
|---|---|---|---|
| 01 | P0 | Unified workflow state engine | Pending |
| 02 | P0 | Role AI access to logs and artifacts | In progress |
| 03 | P0 | Automatic root cause analysis, repair and retry | In progress |
| 04 | P0 | Stall detection and checkpoint resume | Pending |
| 05 | P0 | Bound repeated recovery loops | Implemented — verification pending |
| 06 | P0 | Process every BR document and section | Pending |
| 07 | P0 | Mandatory BR review acknowledgement | Pending |
| 08 | P0 | Affected-only artifact regeneration | Pending |
| 09 | P0 | Standard/custom SA approval consistency | Pending |
| 10 | P0 | Persist workflow and recovery checkpoints | Pending |
| 11 | P1 | Consolidate CSS | In progress |
| 12 | P1 | Shared UI components | Pending |
| 13 | P1 | Standardize controls typography and alignment | In progress |
| 14 | P1 | Remove duplicate navigation/functions | Pending |
| 15 | P1 | Shared Jira inventory with role filters | Pending |
| 16 | P1 | Expandable compact Jira tables | Pending |
| 17 | P1 | Unified status terminology | In progress |
| 18 | P1 | Standard empty/loading/error/recovery states | In progress |
| 19 | P1 | Remove unnecessary UI decoration/text | Pending |
| 20 | P1 | Consolidate settings with separate scopes | Pending |
| 21 | P2 | Five-stage BA workflow | Pending |
| 22 | P2 | Autosave and affected Jira preview | Pending |
| 23 | P2 | Preserve post-publication progress | Pending |
| 24 | P2 | Ask only unresolved business decisions | Pending |
| 25 | P2 | Role-specific bulk assignment/workload | Pending |
| 26 | P2 | SA repository/dependency/mock workflow | Pending |
| 27 | P2 | SA runtime readiness | Pending |
| 28 | P2 | Maximize UX prototype space | In progress |
| 29 | P2 | Design revision comparison/approval | Pending |
| 30 | P2 | Separate developer action groups | Pending |
| 31 | P2 | Remove redundant progress indicators | In progress |
| 32 | P2 | Generate UAT from approved AC | Pending |
| 33 | P2 | Consolidate UAT results/evidence/defects | Pending |
| 34 | P3 | Responsive webview | In progress |
| 35 | P3 | Offline/slow internet | Pending |
| 36 | P3 | Unified activity/AI/error logs | In progress |
| 37 | P3 | Light/dark/high contrast | In progress |
| 38 | P4 | Full regression suite | Pending |
| 39 | P4 | Live Cat Name CRUD E2E with screenshots | Pending |
| 40 | P4 | Build/verify VSIX and authorized release | Pending |

## Execution 1 — item 05

- Root cause: the shared recovery controller compared remaining counts across incompatible actions and reset stagnation when the action changed.
- Implementation: track best remaining count, fingerprint and stagnation separately for each action in each scope; only changed fingerprint with a new best count resets stagnation. Preserve total retry budget, cancellation, and explicit resume.
- Modified files: `media/recovery-controller.js`, `test/shared-recovery-stagnation.test.js`, this tracker.
- Tests executed: `node --test test/shared-recovery-stagnation.test.js` — 4 passed, 0 failed (Node v22.16.0; exact baseline controller blob d0a53289241dd242c8bf8b9d4b0d0ecbad787f13).
- Verification evidence: local tested controller blob `ce884f3fd2a712ce7efabe06107da2eee1a02c0e`; test blob `bf3b7299806049c5c3918fb89c2f92ca564502f1`.
- Commit SHA: see the commit introducing this tracker (self-reference cannot be embedded in the same commit).
- Outstanding blockers: direct git checkout unavailable (DNS); full test suite, all role integrations, live VS Code/Jira/Confluence/AI Cat Name CRUD test, screenshots, package and release not executed. No change to version or mirrors. `.vscodeignore` already excludes `.memory`.
- Remaining items: 01–04, 06–40 require inspection and verification; 05 requires full integration verification. All uninspected rows have root cause, files, tests, evidence and commit pending.

## Execution 2 — items 02, 03, 05

- Baseline: `370baf9e35548f35a720f1d8b8b2d7ce96b3e126` (0.1.66). Library main: `744f63b3da6a01a0668226ec9dc2ecdbd0f635d1`.
- Root causes: transient classifier accepted permission/ownership/quota failures mentioning timeouts; a provider resolving or rejecting after cancellation could report success or a non-cancellation error; common credentials were not covered by journal redaction.
- Implementation: fail closed for explicit non-retryable errors, recheck cancellation after execution, expand redaction before truncation. Existing mutation retry restrictions and maxAttempts preserved.
- Modified: `src/atgv-job-engine.js`, `test/shared-job-recovery-safety.test.js`, this tracker.
- Tests: Node 22.16.0, 4 new focused tests passed against the exact replacement functions in an isolated harness; 4 prior recovery-controller tests passed against the main-matching controller. 8 passed, 0 failed. Full engine and role integration not tested. Test blob `6dec10d00a6e6111777fae94e932898e54514df0`.
- Commit SHA: see commit introducing this execution entry.
- Blockers: git ls-remote fails DNS for github.com in execution environment. No full checkout, integration/E2E, screenshots, packaging, or release. Library and mirrors unchanged; version unchanged.
- Items 02 and 03 remain In progress; 05 remains Implemented — verification pending. Next: inspect actual role AI diagnostic context wiring and durable recovery/resume integration (01–04, 10), then BA completeness/revision gates (06–08). No other items marked complete.

### Execution 2 continued — role diagnostic identity

- Previous verified push: `0e81dac47aec05e9d683135b2c7bad8a640601b6`.
- Item 02: inspected existing `diagnosticContext` and `test/role-ai-diagnostic-context.test.js`. The project-local diagnostic gateway already exists; no duplicate framework introduced.
- Root cause: display names such as UAT Tester and Business Analyst fell back to shared because only a subset of aliases was recognized; this lost role attribution and preferred-role ordering.
- Implemented canonical normalization for all 18 configured display names, preserving custom role slugs and existing shared aliases. No permission policy changed; historical shared logs are not reattributed.
- Modified: `src/project-artifacts.js`, `test/role-diagnostic-identity.test.js`, this tracker.
- Tests: 2 passed, 0 failed (Node 22.16.0, exact roleId and constants in isolated harness; test blob `a502b04f14da5f1c958c8aa54ac61b5ea5fba7a0`). Execution 2 focused total: 10 passed, 0 failed. Full diagnostic file IO and provider/role end-to-end remain unverified.
- Commit SHA: see commit introducing this entry. Items 02/03 remain In progress, 05 remains Implemented — verification pending, 37 other items Pending. 0/40 fully verified. Next: full checkout and validate actual role-provider wiring, persistent recovery checkpoints and BR evidence gates.

## Execution 3 — design tokens, overview progress and designer preview (11, 13, 28, 34, 37)

- Baseline: `181afdac829552120e3540c5252e51569e0c8b60` (0.1.66). Library unchanged.
- Root causes: duplicate shared token overrides; circular sizing and animation incorrectly applied to linear overview indicators; fixed-width preview gallery and dark-only preview chrome.
- Implementation: canonical 32px control height, 4px control radius, 6px card radius, 16px section gap; shared stylesheet consumes generated tokens; exclude linear progress from circular styling, use adaptive overview grid; compact designer preview and native VS Code theme variables, preserve screen image canvas and review controls.
- Modified: design-system/atgv-ui-theme.json, scripts/generate-ui-theme.js, media/atgv-ui-theme.css, media/atgv-consistency.css, media/start.css, test/shared-ui-design-contract.test.js, this tracker.
- Verification: actual baseline and patched generator executed with isolated in-memory filesystem adapter; generated CSS check passed. Three exact new contract tests passed against proposed complete file contents in JS harness. These are source contract checks, not live VS Code rendering, accessibility or end-to-end tests.
- Commit: see commit introducing this entry. All five items remain In progress pending complete UI verification. 0/40 fully verified. No version bump or mirror changes. Direct checkout DNS unavailable; full regression, runtime screenshots, VSIX and release remain blocked. Next: verify rendered layouts across widths and themes; continue navigation/component consolidation and role-specific workflows.

### Execution 3 continued — Activity presentation and project isolation (17, 18, 31, 36)

- Prior main: `62326f96276c7f57ae091307fc5e153089dcbe72`.
- Root causes: stored percentages were displayed without a measured work total; late responses could display activity when no project was active; recovery action gating was looser than the durable resume engine; capped lists reported incorrect displayed counts.
- Implementation: shared explicit state labels and filters, indeterminate progress without valid confirmed counts, correct displayed counts, visible manual reconciliation reason, strict project envelope checks and clear activity/recovery on project change. Restrict resume affordance to explicitly retryable read/AI failed or interrupted jobs; existing host approval remains authoritative.
- Modified: media/start.js, media/atgv-consistency.css, test/shared-activity-state-and-progress.test.js, this tracker.
- Verification: four new source/helper regression cases passed against exact proposed source in isolated JS harness; full start.js syntax compilation passed. No live provider/browser or full suite claims. Total execution 3: seven focused cases passed, generator check passed.
- Commit: see commit introducing this entry. Items 17, 18, 31, 36 remain In progress; full role-specific acceptance pending. 0/40 fully verified. Version unchanged, main only, no mirrors.

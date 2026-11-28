# ATGV UI/UX implementation tracker

Baseline: `d26dcc7543348aae7cf9941c44768b7d544ce89c` (extension 0.1.66). 2026-11-29 MYT.

0/40 fully verified; item 05 has a tested improvement, cross-role live verification pending. Pending means not yet verified against the complete requested acceptance criteria; existing implementations must be inspected before modification.

| ID | Priority | Description | Status |
|---|---|---|---|
| 01 | P0 | Unified workflow state engine | Pending |
| 02 | P0 | Role AI access to logs and artifacts | Pending |
| 03 | P0 | Automatic root cause analysis, repair and retry | Pending |
| 04 | P0 | Stall detection and checkpoint resume | Pending |
| 05 | P0 | Bound repeated recovery loops | Implemented — verification pending |
| 06 | P0 | Process every BR document and section | Pending |
| 07 | P0 | Mandatory BR review acknowledgement | Pending |
| 08 | P0 | Affected-only artifact regeneration | Pending |
| 09 | P0 | Standard/custom SA approval consistency | Pending |
| 10 | P0 | Persist workflow and recovery checkpoints | Pending |
| 11 | P1 | Consolidate CSS | Pending |
| 12 | P1 | Shared UI components | Pending |
| 13 | P1 | Standardize controls typography and alignment | Pending |
| 14 | P1 | Remove duplicate navigation/functions | Pending |
| 15 | P1 | Shared Jira inventory with role filters | Pending |
| 16 | P1 | Expandable compact Jira tables | Pending |
| 17 | P1 | Unified status terminology | Pending |
| 18 | P1 | Standard empty/loading/error/recovery states | Pending |
| 19 | P1 | Remove unnecessary UI decoration/text | Pending |
| 20 | P1 | Consolidate settings with separate scopes | Pending |
| 21 | P2 | Five-stage BA workflow | Pending |
| 22 | P2 | Autosave and affected Jira preview | Pending |
| 23 | P2 | Preserve post-publication progress | Pending |
| 24 | P2 | Ask only unresolved business decisions | Pending |
| 25 | P2 | Role-specific bulk assignment/workload | Pending |
| 26 | P2 | SA repository/dependency/mock workflow | Pending |
| 27 | P2 | SA runtime readiness | Pending |
| 28 | P2 | Maximize UX prototype space | Pending |
| 29 | P2 | Design revision comparison/approval | Pending |
| 30 | P2 | Separate developer action groups | Pending |
| 31 | P2 | Remove redundant progress indicators | Pending |
| 32 | P2 | Generate UAT from approved AC | Pending |
| 33 | P2 | Consolidate UAT results/evidence/defects | Pending |
| 34 | P3 | Responsive webview | Pending |
| 35 | P3 | Offline/slow internet | Pending |
| 36 | P3 | Unified activity/AI/error logs | Pending |
| 37 | P3 | Light/dark/high contrast | Pending |
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

# ATGV AIATECH Assist v0.0.36

## Unified Custom Stack Install & Run

- Consolidate repository scanning, local fix-branch creation, mock fixture commits, dependency installation, synthetic service startup, and localhost health verification behind one **Install & Run** action.
- Toggle the same control to **Stop** during a run; Stop requests cancel pending workflow stages or terminate ATGV-owned local processes. Consent-dialog cancellation never starts installation.
- Preserve the branch selector and the existing single Technology Stack progress bar. Display six compact step statuses instead of another progress bar.
- Hide the standalone Scan Repository, Pull Repository, Run Mock Preview, Stop, dependency, and fix-branch action buttons from the primary Custom Stack panel. Keep underlying handlers for compatibility.
- Run limited, read-only Solution Architect AI assessment of verified manifest evidence when an AI provider is available. Show a small, low-amplitude five-bar animation only while the AI assessment is active.
- Create or reuse `fix/atgv-custom-stack-<source SHA>` locally; never alter `main`, overwrite dirty checkouts, or push project changes automatically.
- Provide NestJS synthetic API health preview at `/api/v1/health` with an ATGV-managed Node process and simulated JSON database. For supported Vite frontends, use the existing local mock API and synthetic fixtures.
- Clearly distinguish synthetic previews from production database, authentication, integration, security, or readiness testing. Unimplemented mock endpoints return HTTP 501.

## Verification

- Added `test/v036-custom-install-run.test.js` for workflow order, safe failure on dirty checkout, and the consolidated UI.
- JavaScript parse checks performed on the changed extension/runtime files.
- Full repository test suite and VSIX packaging must pass in GitHub CI before merge or release publication.

## Limitations

- This implementation creates and commits isolated mock-preview source, not arbitrary AI-generated production source repairs.
- Automatic synthetic service mode currently covers detected Vite and NestJS targets. Real backend/database integrations remain unverified.

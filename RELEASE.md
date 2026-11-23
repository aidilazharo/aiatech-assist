# ATGV AIATECH Assist v0.0.59

Release date: 2026-11-23

## GitHub connection policy
- Repository **read** access is required for the extension and SDLC Library source checks.
- **Write** access is optional. A read-only GitHub PAT can complete setup and save the connections.
- Release listing and download checks remain optional and do not block source verification.
- Connection logs distinguish missing repository read access from missing optional write access.
- This change does not grant write access: actions that create branches, push code, publish releases or change remote files may still require a token with additional scopes.

## Custom Stack frontend and mock API preview
- Prefer the runnable Vite frontend if a previously selected target points to an API-only backend.
- Require frontend HTML at the web-app root and a verified synthetic mock-health response before reporting the preview as ready.
- Keep the selected target and preview URL synchronized with the running frontend.
- Never open an API-health endpoint as if it were the frontend web app.
- Preserve isolated local fix branches, synthetic fixtures, and existing main-branch safety controls.

## Regression coverage
- Added read-only-PAT, mandatory-read, and optional-release tests.
- Added frontend-target selection and synthetic health endpoint tests.

## Verification status
- Source JavaScript syntax checked for modified modules.
- Full extension integration tests and VSIX packaging require a complete local checkout with project dependencies; do not treat source-only checks as a validated release artifact.

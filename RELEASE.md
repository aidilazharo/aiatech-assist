# ATGV AIATECH Assist v0.0.30

## Custom Stack — AI readiness analysis
- **Scan Repository** always re-analyzes verified local application folders; **Pull Repository** remains a separate, fast-forward-only action.
- Collect bounded manifest, non-secret environment-key and application configuration evidence and optionally ask the configured Solution Architect AI model for advisory risks. When AI is unavailable, manifest analysis remains available.
- Show evidence-based blockers and recommended actions: **Mock Services**, **Mock Database** (synthetic fixtures, Vite only), **Install Dependencies**, and **Create Fix Branch**.
- Scan is read-only; branch creation/install/mock execution need their own user interaction and host confirmation.

## Custom Stack — progress and local Git branch controls
- Fix the catalog progress renderer unconditionally clearing the bar for Custom Stack.
- Add a dedicated accessible live progress indicator that updates during scan, dependency checks, mock startup, Git pull, local fix branch creation and health verification.
- Add a local branch selector and **Switch Branch** button. Block dirty worktrees, unknown branches, changed SHA, and active ATGV processes.
- **Create Fix Branch** creates a local `fix/atgv-custom-stack-<commit-prefix>` branch from the verified clean source and commits only isolated `atgv-preview/` mock services, synthetic database fixtures and setup guidance. Does **not** push to GitHub, overwrite project code, connect to PostgreSQL/Okta, or claim that the production application was fixed.
- `main` remains untouched. Preview mocks are not evidence for real backend, security, integration or approval testing.

## Validation
- New regression tests cover TechCockpit-like React/Vite + NestJS/MikroORM source evidence, progress, simulated database behavior, local fix branch creation and switching, SHA pinning and clean-worktree protections.
- GitHub Actions must pass before merging or publishing the VSIX.

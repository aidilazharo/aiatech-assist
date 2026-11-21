# ATGV AIATECH Assist v0.0.31

## Custom Stack — one progress bar and visible runtime health

- Remove the duplicate scan/repair progress bar inside Custom Stack and continue using the original Technology Stack progress bar for every operation.
- Add a separate **Application Runtime Status** line that distinguishes read-only repository scan completion from actual application execution.
- Display **APPLICATION NOT RUNNING**, **WAITING FOR VS CODE CONFIRMATION**, **INSTALLING DEPENDENCIES**, **STARTING APPLICATION**, **APPLICATION RUNNING**, **PROCESS RUNNING — PREVIEW NOT REACHABLE**, or **LAST ACTION FAILED** according to live process state.
- Check the actual ATGV-managed local Node/Vite process and probe only validated localhost URLs. Show PID, mock-versus-real process type and preview URL when healthy. Never infer a running server from scan progress.
- Add **Check Status** and **Open Preview** controls. Open Preview is enabled only for a running, reachable localhost application belonging to the selected project.
- Refresh runtime status after scan, install, start, stop, errors and while the ATGV-managed process is running.
- Keep all existing branch, AI readiness and mock-service actions and prevent scan completion alone from implying app readiness.

## Verification

- Add regression tests ensuring scan completion does not imply a started server, confirmation gating is visible, localhost health is checked, and a single progress bar is present.
- GitHub CI runs regression tests, Windows checks, VSIX build and package verification before merge and prerelease publication.

# ATGV AIATECH Assist v0.3.66 — Offline SDLC Library ZIP

- Start page: Add an upload icon immediately beside the GitHub SDLC Library repository URL.
- The icon opens a VS Code host file picker to import a local ZIP if GitHub Library access is unavailable.
- Validate ZIP file names, symlinks, duplicates, entry counts, sizes, CRC-32 and the central catalog manifest before activating.
- Support GitHub source ZIP archives containing a single top-level folder, as well as root-level catalog files.
- Store imports separately under .atgv/offline-sdlc-library, without modifying the chosen original ZIP or the verified Git checkout.
- While an import is active, ATGV can read offline catalog roles, tech stacks and AI-harness skill files as reference data; uploaded vendor executable scripts do not run.
- A successful GitHub main checkout automatically retires the unchanged temporary import. Never delete a locally modified import or other user data.
- The onboarding step may use a validated ZIP for the Library repository if that repository is inaccessible, while Jira, Confluence and the project GitHub repository must still be verified.
- Extension and catalog versions remain independent: this changes the extension only.

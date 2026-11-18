# ATGV AIATECH Assist v0.4.16

- Make Jira HTTP 404 diagnostics actionable when an API response is empty or `null`.
- Identify failing REST method and URL path, never URL query parameters, credentials or access tokens.
- Distinguish inaccessible Jira projects, invisible issues, and incorrect Jira site URLs without assuming deletion.
- Parse Jira `errorMessages` and `errors` while ignoring empty or `null` entries.
- Preserve existing Jira, GitHub and Confluence request behavior; add regression tests for null responses, authorization errors and URL query privacy.

## Previous release

# ATGV AIATECH Assist v0.4.15

- Remove the entire SDLC Library panel from Start → Jira, Confluence & GitHub connections, including repository explanation, ZIP upload button, and offline ZIP status.
- Drop unused Start-screen event handlers and CSS; preserve Library management, verification, offline Library imports through the host, and hourly update functionality.
- Keep the trusted SDLC Library source pinned to aidilazharo/tech-stacks-skills and the existing project-repository setting unchanged.
- Add regression checks that the Start screen has only Jira, Confluence, email, and GitHub account fields and initializes without missing-element listeners.

## Previous release

# ATGV AIATECH Assist v0.4.14

- Load the dependency-free Kanban controller early; a missing optional controller no longer blocks the whole UI, and Jira DataTable remains available.
- Remove project and Library repository URL inputs from first-run connections.
- Pin the SDLC Library globally to aidilazharo/tech-stacks-skills, independent of GitHub account organization.
- Provide a full project-specific GitHub repository URL under Project Settings, mapped to the existing owner/repo fields.
- Preserve checksum-verified Library ZIP import and Jira, Confluence, and GitHub account verification.

## Previous release

# ATGV AIATECH Assist v0.4.13

- Move SortableJS 1.15.7, MIT license, and provenance notice from the VSIX into SDLC Library v1.1.16.
- Load SortableJS only from the approved, SHA-256 pinned Library cache. Project Manager Kanban continues to support native drag-and-drop when the optional library is missing.
- Check both extension and SDLC Library GitHub releases automatically every hour while VS Code is running, retaining startup checks and manual approval before installing.
- Hardcode trusted update sources: https://github.com/aidilazharo/aiatech-assist/releases/latest and https://github.com/aidilazharo/tech-stacks-skills/releases/latest.
- Fall back to verified same-repository prereleases when /latest is unavailable; download verified VSIX and Library source ZIP with SHA-256 checksums.

## Previous release

# ATGV AIATECH Assist v0.4.11

- Add independently configurable **Extension Release Repository URL** and **SDLC Library Repository URL** in Extension Settings → Extension & SDLC Library Updates.
- Save validated GitHub HTTPS URLs separately so extension VSIX releases and the SDLC Catalog can be fetched from different repositories.
- Keep verified VSIX SHA-256 and pinned main-branch SDLC Catalog checks. Show URL validation errors without replacing existing settings.
- Disable update and pull actions while repository edits are unsaved; refresh update status after successful saves.
- Preserve the existing ATGV: AI standalone command while excluding its button from the left navigation (previous merged change).

## Previous release

# ATGV AIATECH Assist v0.4.10

- Bundle upstream **SortableJS 1.15.7** with the extension, including its MIT license. No user npm installation, external CDN, or internet access is required to drag Jira cards.
- Project Manager → My Work: one Jira Work Items panel opens as a compact **searchable, sortable and paginated DataTable** with an optional **Kanban** switch. Kanban cards drag between Jira status columns using the touch-friendly handle; the keyboard status selector remains available.
- Jira remains authoritative: status moves validate allowed transitions, require confirmation, and only commit remotely after Jira accepts them; rejected moves restore the original board and explain the error.
- Keep the existing native HTML drag-and-drop fallback if SortableJS fails to initialize, and add missing-asset detection in the webview startup diagnostics.
- Verify the exact upstream SortableJS build, license, script loading order and VSIX inclusion in automated regression and package tests.

Release packaging runs Linux regression tests, UI checks, VSIX verification, and Windows startup/reset tests.

# ATGV AIATECH Assist v0.3.51 — AIA startup readiness and branded VSIX upgrades

## New first-run Start page

- A read-only local computer readiness scan checks **React, Angular, NestJS, .NET and Spring Boot** host prerequisites. Expand a technology stack to see whether each tool is detected and its version. The scan never installs modules, runs downloaded code or claims application builds have passed.
- Connection setup is displayed after readiness scanning. Suggested AIA values are prefilled for Jira, Confluence, GitHub organization, project repository, SDLC Library and account email. These are suggestions, **not saved credentials or proof of access**. Existing custom user settings remain available.
- The Setup page accepts the existing single Atlassian account/token for Jira and Confluence and a GitHub personal access token shared with the user's project and read-only SDLC Library catalog access. Password inputs are never reflected into webview state.
- **Test & Save Connections** requires successful live Jira authentication, Confluence space-list access, GitHub account verification, project repository read access, and SDLC Library main branch access before storing settings and credentials.
- **Proceed to Search Project** remains disabled until successful tests. The proof is tied to the exact tested URL/email fields; changing inputs invalidates readiness. After proceeding, this one-time gate is remembered across ATGV restarts. A subsequent change to Jira, GitHub or Library settings makes it appear again at the next Start.
- Existing project files, project mappings, Git history, local work, settings and credentials are not deleted or overwritten by computer diagnostics.

## Upgrade modal clarification

- **Only ATGV extension VSIX upgrade offers** use a new branded in-webview modal with the extension's packaged logo, installed/available versions, verified-release notice, and Install Upgrade / View Release / Later actions.
- The separate SDLC Library update prompt and onboarding setup remain unchanged in modality: the onboarding flow is a **Start page, not a modal**.
- Existing verified GitHub Release API, private-token access, checksum validation and explicit user authorization remain in place.

## Notes and limitations

- The five-stack scan checks host tools, not project dependency installation, compilation or execution. Optional global CLI tools are distinguished from required host tools.
- The existing ATGV configuration uses the same Atlassian account/token for Jira and Confluence, and requires both URLs to have the same Atlassian Cloud origin.
- Repo validation confirms GitHub read permission and presence of the Library main branch; it does not establish write permission for future commits.
- Live AIA Jira/GitHub integration and interactive VS Code Windows/macOS GUI confirmation require an authorized local session; automated tests use mocks for remote services.

# ATGV AIATECH Assist v0.4.35

- Add Jira Type filter for BR, Epic, User Stories, Task, and Subtask in Project Manager · Project Jira Work Items.
- Add an editable Jira Assignee card directly below Reporter in the ticket details modal. Eligible users must have the matching SDLC role in the verified project roster AND be assignable in Jira; PM must have Jira Assign Issues permission.
- Assign entire BR/Epic development hierarchy to the chosen developer while leaving non-development role tickets (UI/UX, BA, SA, QA, UAT, PM) unchanged. Permit role-matched individual Task/Subtask assignment with explicit confirmation, state checks and rollback.
- Add project-scoped, persistent, redacted Business Requirements process diagnostics covering uploads, preflight, AI mapping, approvals, Jira actions, and failures, with a small Download Logs icon beside Previous Step.
- Refresh the existing webview's content each time users navigate the sidebar or role menu; continue long-running host processes when changing screens and show current mapping progress when returning. Preserve process state and defer cross-project switching during active operations.
- Include comprehensive regressions for correct role scope, redaction, rollback, navigation and background activity preservation.

## Previous release

# ATGV AIATECH Assist v0.4.34

- Fix recurring Business Analyst document timeouts for large, structured BRDs (60,000+ extracted characters), including GATE MVP1a v2.0.
- Bound long-document per-call AI preflight, mapping and cross-check budgets; try the installed, authenticated Microsoft/GitHub Copilot SDK only when the user enabled the existing opt-in setting.
- After recoverable AI timeout, continue a SOURCE-ONLY extraction of all original sections rather than restarting the complete document or looping indefinitely.
- Save authenticated source-only fallback markers in the existing resumable AI checkpoint to make retry/restart deterministic.
- Preserve original document bytes, full extracted working BR, evidence, and pending BA decisions without inventing authority or changing Jira records.
- Mark quality checks **NOT VERIFIED** and any skipped cross-section review **needs-review**; actual business conflicts remain BA decisions.
- Add regression tests using a synthetic 100k-character BRD, source coverage and safe recovery logic.

## Previous release

# ATGV AIATECH Assist v0.4.33

- Fix `tech-cockpit` and other project-opening failures when a GitHub account owner is saved during onboarding but the project repository remains optional and unconfigured.
- Validate project GitHub repository permissions only when a repository name is present; continue to require a valid owner for configured repos.
- Preserve required Jira and Confluence authentication and checks, existing project settings, and account credentials.
- Show a non-blocking notice and record an opening diagnostic when optional project GitHub configuration is skipped.
- Add regression tests for the owner-only account, repo configured, missing owner, and no-GitHub cases.

## Previous release

# ATGV AIATECH Assist v0.4.32

- Add expandable Jira, Confluence and GitHub connection diagnostics to the Start connection setup screen.
- Record each API check as an independently timestamped local diagnostic, including HTTP/network/permission failure descriptions, endpoint host, verification outcome, and elapsed time.
- Retain a bounded log across VS Code restarts in the existing protected unified diagnostic file.
- Add Refresh Log and Download Logs (.txt) controls without displaying or collecting API tokens, account email, authorization headers or raw responses.
- Preserve current connection Test & Save workflow and verification safeguards.

## Previous release

# ATGV AIATECH Assist v0.4.31

- Rename the in-progress Business Requirement action button from **Force Delete Everywhere** to **Delete**.
- The verified delete-everywhere scope, safeguards, remote deletion preview and confirmations are unchanged.

## Previous release

# ATGV AIATECH Assist v0.4.30

- Remove the green Uploaded Documents progress bar; keep the document count pill.
- Recover preflight, AI mapping and cross-section reviews from timeouts or malformed responses without aborting the entire BA mapping run.
- Retry transient AI failures up to three times, preserve completed source-section checkpoints and make Resume AI Mapping available.
- Add an opt-in fallback to the already installed, authenticated Microsoft/GitHub Copilot SDK when the configured model cannot complete BA analysis.
- Turn missing acceptance-test, RBAC and audit details into clearly marked provisional checklists, without fabricating approvals, security policies or retention requirements.
- Show only unresolved findings as warnings while retaining the recommendations in the preflight report.
- Keep genuine contradictory business rules visible for human resolution; never falsely report successful validation.

## Previous release

# ATGV AIATECH Assist v0.4.29

- Align all collapsed prerequisite cards by removing inherited spacing from the permission checks.
- Display Jira, Confluence, GitHub and Library API checks as circular cards in the prerequisite grid.
- Force-delete the in-progress BR cycle and verified linked records, while retaining evidence shared with unrelated BRs.
- Resume AI preflight and mapping from validated section checkpoints after a stop, timeout or restart.
- Remove the latest extension and Library version text from the Start screen.
- Keep the public extension and Library mirrors reliable when anonymous GitHub API requests are rate limited, using the built-in GitHub Actions token.
- Includes all v0.4.28 startup connection, source re-upload and AI preflight recovery fixes.

## Previous release

# ATGV AIATECH Assist v0.4.28

- Add Edit and Cancel controls for saved Jira, Confluence and GitHub connection details on Start.
- Check Jira, Confluence, the GitHub account and organization, and SDLC Library access independently at startup and while saving credentials.
- Report HTTP responses separately from connection failures, and pause automatic opening when checks need attention.
- Preserve saved credentials if re-verification fails and correct misleading Confluence 404 guidance.
- Allow an archived document to be uploaded again for a new mapping cycle, and restore a missing active source only when its original checksum matches.
- Reduce preflight section sizes and automatically retry a slow AI response without discarding the document or bypassing validation.

## Previous release

# ATGV AIATECH Assist v0.4.27

- Show a centered, collapsed prerequisite summary that expands all permission, stack and Copilot checks in one responsive grid.
- Generate a BA-template working BR with verified spelling corrections and clearly labelled provisional guidance while preserving the original upload.
- Complete and validate every document section before mapping the updated working text and guidance.
- Include original excerpts, applied corrections, rejected suggestions and validation results in the downloadable pre-flight report.
- Provide a separate download of the verified AI-updated working BR; keep application and acceptance tests marked as not run until executed.

## Previous release

# ATGV AIATECH Assist v0.4.26

- Recover interrupted source mapping and allow mapping to be stopped during document preflight.
- Retry a malformed AI mapping response once, without saving partial results or inventing answers.
- Open groups containing unanswered questions and allow AI Review of saved partial discovery answers.
- Highlight unanswered questions in AI Review; require all 12 answers before generating requirements.
- Repair out-of-sync discovery saves and preserve edits made while a save is in progress.

## Previous release

# ATGV AIATECH Assist v0.4.25

- Check published BRs and linked Jira items after opening a project; remove unavailable records from active lists while preserving recoverable copies.
- Restore saved records automatically when Jira makes them visible again; skip drafts, pending publications, network errors and missing project permissions.
- Download releases anonymously from the public distribution repositories or the existing public source repositories, without a release-download PAT.
- Compare releases from both sources and show the latest published extension and Library versions on Start.
- Supply public distribution workflows that mirror checksum-verified extension and Library releases using each target repository's GitHub Actions token.

## Previous release

# ATGV AIATECH Assist v0.4.24

- Add an optional **Release Download PAT** control under Settings → Extension & SDLC Library Updates.
- Save & Test checks read-only GitHub Releases API access for the fixed extension and SDLC Library repositories; public releases need no token.
- Store the PAT only in VS Code SecretStorage, independent of project GitHub, source-sync, issue reporter, PR and Jira credentials.
- Remove PAT clears only the release-download credential; all project connection settings remain unchanged.
- Use the release-only token for verified release checks, VSIX downloads, SDLC Library ZIP pulls and their SHA-256 checksums.
- Preserve anonymous download support, checksum verification, controlled upgrade prompts, and hourly update checks.
- Add regression tests for private/public release access, invalid PATs, trusted endpoints, secure credential separation and UI controls.

## Previous release

# ATGV AIATECH Assist v0.4.23

- Fix **Open Project** unexpectedly returning to Jira, Confluence and GitHub credentials during project launch.
- Do not require the startup connection wizard while a project is being resolved, checked, initialized or already opened.
- Prevent stale state messages from replacing an in-progress project or a retryable opening error with the credential form.
- Keep Open Project progress active across background dashboard updates until the project finishes opening or explicitly fails.
- Preserve explicit Back to Connections, new-session verification, saved credential integrity and offline recovery behavior.
- Add tests covering all opening phases, active projects, in-progress opening, stale-state responses and recovery screens.

## Previous release

# ATGV AIATECH Assist v0.4.22

- Fix BA Discovery Mapping when the combined evidence across source sections exceeds 5,000 characters. Preserve complete merged answers up to 100,000 characters each, while AI section responses stay capped at 5,000.
- Preserve source document integrity, approval gates, and atomic mapping commits.
- Discover creatable/editable Jira issue fields per project and issue type, including project-specific custom Acceptance Criteria and Definition of Done fields.
- Prefill verified string fields from approved BR data; for missing text evidence use "Information not available in the approved Business Requirements document." Never invent typed values for user, numeric, option, or date fields.
- Block Jira Preview approval where required nontext fields lack valid values.
- Show each Jira issue in an individual scrollable modal with the field names, types, evidence source, and preserved values.
- Bind approved custom fields to create/update payloads, rechecking metadata and existing custom fields before publication.
- Include tests for the original 5,569-character failure, editable-field metadata, custom Jira payloads, safe fallbacks and modal preview.

## Previous release

# ATGV AIATECH Assist v0.4.21

- Add Download Pre-flight (.txt) action to Business Analyst > Uploaded documents > AI document preflight.
- Export complete available preflight section and retry findings, recommended standards, warnings, blockers, and interrupted-run reasons without modifying uploaded DOCX/PDF.
- Enable export once the first section finishes and preserve retries in the current VS Code session.
- Offer labelled bounded saved-evidence reports for successful mappings after extension restart.
- Use VS Code Save dialog and UTF-8 text; no Jira, Confluence or GitHub changes.
- Add tests for section history, blocked checks, saved evidence, filenames and empty results.

## Previous release

# ATGV AIATECH Assist v0.4.20

- Remove inline BR answer and linked-Jira buttons from the All Jira Project Items DataTable.
- Rebalance My Work Users table columns and show live assigned Jira issues by assignee, with readable task statuses.
- Add Custom Stack for inspecting an existing configured project checkout and running its detected application with explicit consent; never overwrite starter files or push Git automatically.
- Remove redundant extension/library latest-version summary text from the Start screen while retaining update checks.
- Use icon-only unified log controls with accessible labels and tooltips.
- Display circular, animated startup prerequisite progress for stack, permission and Copilot checks, with reduced-motion support.

## Previous release

# ATGV AIATECH Assist v0.4.19

- Show the installed workspace library version and latest library release version without repeating the GitHub build tag.
- Recover stale installed-version metadata from a matching verified checkout or checksum-verified offline library, while preserving locally edited files.
- Explain when a verified build is available for the same library version.

## Previous release

# ATGV AIATECH Assist v0.4.18

- Check workspace trust, folder access and extension and SDLC Library installation permissions on Start.
- Show concurrent circular technology-stack checks, freeze failed checks, and offer a guarded timed return to a previously selected ready project.
- Check and display the latest extension and Library releases on every Start and Restart, including newer prereleases and same-version Library builds.
- Extract referenced Word document parts while excluding tracked deletions; preserve verified legacy source records.
- Keep source text unchanged during AI preflight and reconcile mapped claims across long-document sections before saving.
- Verify the activated Library release and its archive digest before reporting a successful update.

## Previous release

# ATGV AIATECH Assist v0.4.17

- Remove the fixed GitHub extension and SDLC Library release URLs from Section 8 Settings, and remove its explanatory release-source paragraph. Update checks, release verification, and hourly scheduling remain unchanged.
- Accept longer extractable PDF/DOCX requirements sources (up to 300,000 extracted characters), keeping the original uploaded file and a full source text digest. Do not silently truncate requirement text.
- Process long Business Requirements documents in bounded text sections for AI preflight and discovery mapping, retaining source order and failing explicitly if combined answers exceed the existing 5,000-character discovery-field limit.
- Preserve a single atomic mapping commit, cancellation and original-document integrity; all-or-nothing mapping avoids publishing incomplete requirements.

## Previous release

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

# ATGV AIATECH Assist v0.4.47

## Startup and performance

- Begin local technology-stack prerequisite checks as soon as the Start webview is ready, without waiting for full project state.
- Hide the optional GitHub Copilot SDK card and the initial Checking permissions placeholder; exclude hidden optional SDK from startup readiness issues.
- Remove hover shading from the prerequisite scan summary and redundant Start navigation dividers and project-picker guidance.
- Restore saved non-secret Jira, Confluence and GitHub fields early. Reuse verified credential state during an open session instead of rereading the OS keychain at every dashboard refresh.
- Run independent Jira and Confluence opening checks concurrently and remove redundant recent-project persistence writes.
- Disable Open Project during launch, use a dark-gray disabled appearance and retain the existing live opening-progress bar.

## Business Analyst requirements workflow

- Display AI Review findings in discovery-question order (1–12), retaining their original severity indicators.
- Give Generate Requirements, Preview & Save, and Approval separate visual stages with distinct instructions and actions. The generated documents remain under the same durable BR register.
- Require an explicitly saved BR draft before approval; preserve the source revision, editing safeguards and human approval checks.

## Public release discovery

- Query only `aidilazharo/extension` and `aidilazharo/library` when searching for public release artifacts.
- Exclude `aidilazharo/aiatech-assist` and `aidilazharo/tech-stacks-skills` from public release repository discovery without changing fixed source/catalog update URLs.

## Verification

- Add regression assertions for the release repository list, startup scan trigger, Jira/Confluence parallel checks, discovery question ordering, and separate BR stages.
- No existing BR, Jira issue, approval, project repository, or catalog file is modified by an application data migration.

# ATGV AIATECH Assist v0.0.99

## Changes

- Add explicit PAT and VS Code GitHub sign-in modes in Extension Settings; use the selected mode for project API operations instead of silently preferring an old PAT.
- Separate read-only Git transport checks from REST API validation and report main branch protection or pull-request rules independently. Never test write access with a remote mutation.
- Recognize GH013/GH006 repository policy errors; use selected credentials for developer story push and architect bootstrap publish, with origin verification and transient Git headers.
- Retain independent Library and Startup credential handling and preserve optional GitHub access for Jira/Confluence workflows.

## Validation

- Added focused policy and authentication regressions; full suite, live corporate credentials and VS Code interactive sign-in remain unverified. No VSIX generated.

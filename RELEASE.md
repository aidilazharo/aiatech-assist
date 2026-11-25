# ATGV AIATECH Assist v0.1.0

## Changes

- Remove 4 redundant version-only regression tests and duplicated metadata assertions; retain canonical release validation and UI accessibility checks.
- Normalize test temporary directories to their physical path on Unix to address macOS /var and /private/var alias failures without weakening production symlink protections.
- Make project-folder collision, scheduler paths, and native dependency fixtures platform-aware; update GitHub connection mocks and expected credential persistence, and isolate Repo B remote probes to local fixture repositories.
- Preserve actionable pull-request permission diagnostics alongside rate-limit and SSO messages.

## Validation

- Reviewed the v0.0.98 macOS log (2,667 tests; 56 failures). This targeted cleanup does not claim every recorded failure is resolved. Full regression execution and packaging remain pending. No VSIX generated.

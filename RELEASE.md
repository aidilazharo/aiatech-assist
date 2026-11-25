# ATGV AIATECH Assist v0.0.98

## Changes

- Authenticate GitHub accounts and validate repository branch/content access before reporting authenticated connections; expose write permission as an assessment, not a successful push.
- Preserve saved credentials when optional Startup GitHub authentication fails. Synchronize shared Library credentials when updating the verified global token, preserve independently configured Library tokens, and invalidate cached project checks.
- Classify GitHub authentication, rate limit, SSO, IP restrictions and other HTTP failures. Use the configured credential for direct project clone via transient Git configuration.
- Add focused regression coverage for credential and permission handling.

## Validation

- Source-only update; full local regression and live corporate GitHub verification pending. VSIX packaging intentionally skipped.

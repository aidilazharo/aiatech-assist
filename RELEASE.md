# ATGV AIATECH Assist v0.0.80

## Retired release distribution mirrors
- Remove obsolete personal-account distribution mirror routes from release discovery.
- Pin extension and Library release requests to the AIA Malaysia repositories already defined in Start configuration.
- Use the existing saved GitHub account credential for approved GitHub API release requests; do not forward it to CDN or unrelated repositories.
- Retire the mirror script and workflow templates; preserve development source release publishing and existing historical releases.
- Preserve release version comparison, checksum verification and no-downgrade protections.

## Verification
- Regression, Windows startup/reset, and VSIX packaging checks are required before merge.
- AIA Malaysia live repository access and release availability must be verified with the user's authorized account.

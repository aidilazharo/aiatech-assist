# ATGV AIATECH Assist v0.0.80

## Canonical aiMalaysia source Releases
- Download Extension VSIX updates from https://github.com/aiamalaysia/my-fow-technology-app-techassists-dev-sdlc/releases/latest.
- Check Library source ZIP releases at https://github.com/aiamalaysia/my-fow-technology-app-techassists-enterprise-skills/releases/latest.
- Query the same source repository's full Releases list to include newer verified prereleases when GitHub /latest excludes them.
- Remove automatic update routing through the separate extension and library distribution mirrors.
- Preserve optional GitHub authentication for private source Release metadata and verified asset downloads; drop tokens on CDN redirects.
- For Library updates, stage and SHA-256-verify matching source Release ZIPs, then activate the verified main-branch commit as before.
- Reuse an unchanged already-verified Library source ZIP safely during retries.

## ATGV: Workspace Release artifact copying
- Retain the explicit optional Copy Release Artifacts workflow for publishing verified assets to separate distribution repositories, not for automatic updates.
- Support direct source-to-distribution copying with source identity checks, checksums and conflict-safe publishing.

## Validation and deployment
- Regression coverage for canonical Release routing, prereleases, checksum verification, owner isolation and workspace copy.
- Live aiMalaysia repository access requires an authorized GitHub token; 404 access failures must not be concealed.
- Version 0.0.80 is pending validation and publication.

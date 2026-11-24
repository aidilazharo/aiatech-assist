# ATGV AIATECH Assist v0.0.92

## Changes

- Publish verified VSIX builds as regular GitHub releases and mark new releases Latest.
- Publish the existing release as a regular release when the same workflow build is retried.

## Validation

The release workflow builds and verifies the VSIX, runs the Windows stack reset checks, and publishes the assets and SHA-256 checksum.

# ATGV AIATECH Assist v0.4.54

## ATGV: Workspace - Preserve the full safe .github configuration

- Include all eligible Git-tracked .github/** files even if Source copy scope is limited to a subfolder, rather than only .github/workflows/**.
- Preserve destination-only .github files; update matching paths without pruning unrelated metadata.
- Continue excluding .git, credential files, secret keys, environment files and blocked generated folders.
- Show included .github paths in the Workspace source analysis/review before publication.
- Add regression coverage for CODEOWNERS, Dependabot, issue and PR templates, workflow files, narrowly scoped copy and blocked credentials.
- Preserve normal review, source verification, branch creation, commit and PR behavior; no direct write to destination main.

## Build and verification

- Run the full node:test regression suite, theme consistency check and VSIX build/activation verification.
- Publish an approved VSIX only after relevant CI checks pass.
- The SDLC Library stays at v1.1.17; this release changes only the extension.

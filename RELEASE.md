# ATGV AIATECH Assist v0.0.96

## Changes

- Synchronize full main source independently of the latest verified stable release. Preserve previous artifacts if no valid replacement exists and record the code and release versions and commits separately.
- Validate release checksums before copying any artifact, prevent managed release downgrades, and make destination publication idempotent across later source syncs.
- Correct regression fixtures for BA ownership and final action, local-first stack preparation, and source exports that intentionally omit agent policy memory.
- Add network-free Acorn token/AST-checked JS optimization and conservative CSS optimization when npm optimizers are unavailable, plus optional lossless Zopfli ZIP optimization when the size budget requires it.

## Validation

- Source export regression tests and local VSIX activation verification; size budget remains 1,450,000 bytes. Full Git checkout policy validation and live GitHub/Jira end-to-end verification remain separate checks.

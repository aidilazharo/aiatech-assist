# ATGV AIATECH Assist v0.1.55

## Changes

- Detect compatible Windows x64 Node.js 24 with npm across PATH, standard installation locations and approved portable ATGV_NODE24_HOME. Report actual detected versions and select the compatible runtime for the extension process only.
- Check bundled Custom Stack runtime before AI and dependency installation. With explicit user confirmation, Windows Package Manager can install an exact 24.x x64 release and retry verification. Corporate installation restrictions remain in force.
- Apply runtime detection to both Windows project and Library npm bundle restoration.
- Skip real NestJS dependency installation in Mock API mode; reuse verified frontend dependency checks during launch.

## Validation

- Syntax checked, regression cases added. Full Windows runtime, actual package-manager installation, extension test suite and VSIX build not performed.

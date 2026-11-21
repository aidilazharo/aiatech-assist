# ATGV AIATECH Assist v0.0.16

## Changes

- Relocate the reactive AI waveform into the dedicated My Work top strip with a red bottom border.
- Change the multicolor waveform to softly fading red/crimson animation, with a subtle idle pulse and support for reduced-motion preferences.
- Reorganize My Work into three vertical zones: fixed AI waveform, independently scrolling AI results and conversation, and a bottom-anchored chat composer.
- Scroll new and typed responses inside the center results pane instead of scrolling the entire page.
- Preserve existing role-aware chat, project RAG, Confluence/Jira activity awareness, AI suggestions and navigation for all 18 roles.
- Scope the fullscreen chat layout only to My Work, leaving Role Workspace and other ATGV pages unchanged.
- Add responsive narrow/short viewport treatment, keyboard focus styles, and associated UI regression coverage.
- Keep .memory guidance in source Git only and exclude it from VSIX and release archives.

## Verification

Run Node regression tests, UI style checks, Windows reset/startup checks, and VSIX build/archive validation in GitHub Actions. Merge PR only when all required checks pass, then publish via the main branch release workflow.

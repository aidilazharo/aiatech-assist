# ATGV AIATECH Assist v0.3.65 — Automatic release source detection

- GitHub extension release URL is derived from trusted extension package repository metadata.
- SDLC Library release source is derived from the configured GitHub catalog URL while catalog updates continue to check main-branch SHAs.
- Removed manual Release URL and Save URL controls from extension settings, VS Code configuration schema and webview message handler.
- Previous user-specified release URL settings are no longer consulted.
- Retained trusted GitHub asset validation, SHA-256 verification and explicit installation consent.
- GitHub Actions now verifies the VSIX and Git-tracked source ZIP, uploads both, and publishes them together with SHA-256 checksums.

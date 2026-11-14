# ATGV AIATECH Assist v0.3.49 — Extension and SDLC Library updates

- Extension Settings section 8 checks the trusted GitHub Releases API for `aidilazharo/aiatech-assist`.
- Automatic checks at startup and every six hours, with persisted user preferences.
- Modal prompts only once per new release or catalog commit, never silently install anything.
- Optional VSIX installation from release assets with published SHA-256 checksum verification; rejects incomplete releases.
- Uses the existing verified and pinned SDLC Catalog updater for `tech-stacks-skills/main`.
- Supports private GitHub access through existing VS Code GitHub authentication or extension token.
- Saved update preferences survive ATGV Reset.
- Installation cannot bypass protected ATGV project approval or modify project source.

Live private GitHub Releases access and Windows VS Code installation require integration verification.

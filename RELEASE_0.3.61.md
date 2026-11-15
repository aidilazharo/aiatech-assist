# ATGV AIATECH Assist v0.3.61

- Replace the native SDLC Library update prompt with a branded ATGV dialog matching the verified extension update modal.
- Display installed catalog version, remote main SHA and source before the user chooses Pull Library or Later.
- Keep the dialog accessible with Escape, focus trapping and focus restoration; dispose pending prompts safely.
- Place the GitHub Releases URL and Save URL, Check Updates, Install Verified VSIX and View GitHub Release buttons in one horizontally scrollable row.
- Remove optional update checkboxes. Extension and SDLC Library checks, startup checks and upgrade confirmation prompts are enabled by default, including for legacy preferences.
- VSIX releases continue to be built and published exclusively through main-branch GitHub Actions.

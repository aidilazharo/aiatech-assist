# ATGV AIATECH Assist v0.1.45

## Changes

- Restore four visible Settings > Updates controls: Check Extension Updates, Pull Library Updates, GitHub Release Extension and GitHub Release Library.
- Open the actual latest published versioned VSIX and Library source ZIP asset links, with the latest-release page as a safe fallback. Verified VSIX installation stays in the upgrade modal.
- Re-offer newer verified Extension and Library updates on Start and explicit checks; deduplicate hourly notifications and avoid overlapping active update offers.
- Start update checking after the webview handshake without waiting for the full dashboard snapshot.
- Preserve version checks, trusted release sources, VSIX checksums, verified Library main pulls and no-downgrade safeguards.

## Validation

- JavaScript syntax and focused source checks performed. Full regression suite and VSIX packaging not executed here. Approved release repositories were not accessible via the current GitHub connection.

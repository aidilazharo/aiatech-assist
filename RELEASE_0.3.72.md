# ATGV AIATECH Assist v0.3.72

## Always select the newest SDLC Library version

- Compare uploaded SDLC Library ZIP `VERSION` and `catalog.json` and reject inconsistent archives.
- Read GitHub main `VERSION` and `catalog.json` from the same immutable commit before selecting the source.
- Select the higher semantic version across uploaded ZIP, installed ZIP, verified Git checkout and accessible GitHub main; prefer the authenticated Git revision on equal versions.
- Keep a newer verified offline ZIP when GitHub main is older, including during hourly update checks and manual pulls.
- Fall back to the newest locally verified catalog when GitHub cannot be reached, without claiming a remote version was checked.
- Show the compared ZIP/GitHub versions and selected source in the import status; refresh Library Studio and webview vendor assets from the active source.
- Add regression tests for comparison, downgrade prevention, ZIP/manifest mismatches and remote-pinned version integrity.

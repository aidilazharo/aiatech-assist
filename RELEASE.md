# ATGV AIATECH Assist v0.0.8

## Changes

- Rename Start Screen connection section to Atlassian & GitHub connections.
- Use a single Atlassian URL (default `https://aiamy-jira-azure.atlassian.net`) to authenticate Jira and derived Confluence `/wiki` endpoints. Use the default Atlassian email `user.name@aia.com`.
- Accept a GitHub organization URL such as `github.com/aiamalaysia`; normalize it to an HTTPS URL. Add Project Repository name (default `my-fow-technology-app-techassists`) and show its full organization/repository URL.
- Map required Extension and Library source repositories to trusted `aidilazharo` or `aiamalaysia` owners; verify GitHub PAT read/write permissions and release-list access and a bounded authenticated release-download probe.
- Check optional `aidilazharo/extension` and `aidilazharo/library` release repositories without blocking successful required connections.
- Check each endpoint **sequentially**, reporting blue in-progress, green success and red failure bars at the connection status location; do not save settings or tokens when a required check fails.
- Fix Confluence source-vault false baseline conflicts caused solely by regenerated Discovery timestamps and upload-only document metadata. Validate user-authored BRs, Discovery answers, original file byte checksums and Jira identities before recovering a missing baseline.
- Preserve both versions and report differing categories when real Confluence/local changes exist. Never auto-overwrite a genuine conflict.
- Keep `.memory` source-only and excluded from VSIX and source release ZIP.

## Tests

- New cross-computer Confluence baseline recovery and genuine Discovery-conflict tests.
- Updated startup UI and credential-verification tests for the new mappings and serial connection sequence.
- Full Node regression, Windows startup, UI theme, VSIX integrity and source ZIP checks through GitHub Actions.

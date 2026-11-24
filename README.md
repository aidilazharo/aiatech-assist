**Version: 0.0.81**

**Author:** [Muhamad Aidil Azhar Salim](mailto:muhamadaidilazhar.salim@aia.com)

### AIA Malaysia distribution
Source-only automation runs in the development repository. Configure the organization-approved `AIAMALAYSIA_PAT` Actions secret with destination Contents and Pull requests write access. The sync workflow runs after a verified source release; the release workflow checks merged PRs every 30 minutes. Both have manual dry-run controls. Destination Actions remain disabled. Never store credentials in source.

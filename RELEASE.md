# ATGV AIATECH Assist v0.0.39

## Changes

- Separate the Business Requirements project inventory and resumable work from the four-stage preparation workflow.
- Reuse the header AI wave during preparation and animate the active stage circle. Provide List and Hierarchy views, type filters and a Role column in Jira Work Items.
- Review drafts for source consistency and verifiable outcomes before preparing Jira. Keep unresolved source decisions visible and omit affected drafts from the Jira plan while independent drafts can continue.
- Allocate fresh identifiers for unpublished drafts when the existing Jira identifiers belong to different work. Preserve saved mappings and require explicit confirmation for all publication changes.

## Validation

- Regression fixtures cover the two screens, Jira roles and review of conflicting drafts and identifiers. Release checks verify Linux packaging, Windows stack reset and VSIX activation.

# ATGV AIATECH Assist v0.4.51

## Safely replace, remove and reprocess BR source documents

- Add **Replace & Reprocess** beside each active PDF/DOCX source: accepts renamed updated source documents while preserving the original source identity and version lineage.
- Add **Remove Source** for non-destructive archive, keeping approved Business Requirements, published Jira keys, original source evidence, and audit history.
- Keep **Delete Everywhere** separately labeled for destructive deletion, with its existing verified confirmation and remote-deletion gate.
- When a document is archived and an updated file is uploaded, explicitly offer to **Reupload as Updated Source**. Preserve the old BR identity and Jira mappings instead of duplicating them.
- Validate source fingerprint, project identity, revision, original bytes, and pending Jira operations before registering a replacement.
- Archive prior versions, invalidate stale mapping and AI Review, and mark affected BRs as requiring regeneration and human approval. Automatically run source preflight and mapping after a successful replacement.
- Never modify existing Jira issues during source replacement. Only publish newly approved BR changes after complete Jira Preflight, approval, and existing conflict/work-in-progress protections.

## Generate Requirements recovery

- Accept complete AI BR JSON in the supported `requirements`, `businessRequirements`, `business_requirements`, `brs` envelopes, a valid top-level array, or a complete single BR object.
- Diagnose zero returned requirements versus responses exceeding the explicit 25-per-generation cap; never silently truncate or fabricate BRs.
- Retry a zero-BR response against verified single-group source Markdown when appropriate, with an explicit one-BR schema.
- Preserve Discovery and previous BR/Jira records when both attempts fail, and give a specific message explaining the cause.

## Verification

- Regression tests cover safe archive and reupload, preserved Jira mappings, stale revisions, source identity, model-response schema repair and count limits.
- Full GitHub Actions CI, Windows checks, theme validation and packaged VSIX verification are required before merging this release.

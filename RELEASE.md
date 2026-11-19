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

## Unlimited BR batches and human confirmation

- Remove the fixed **25 Business Requirements** generation limit and the old hidden 100-BR register load limit.
- Generate multiple source-backed BR groups sequentially and accumulate all validated requirements.
- Show the validated BR count and require explicit **Continue / Cancel** before saving any draft batch.
- Cancel preserves current BR revisions and all existing Jira issues. Zero-item AI responses still fail safely; source-backed retries remain available.

## Confluence upload synchronization and cross-computer recovery

- Automatically synchronize original PDF/DOCX uploads and supported project document/image attachments to the selected **Confluence space**.
- Use one project-scoped Confluence source vault page with immutable original attachments and a versioned metadata manifest for active and archived sources, approved BR snapshots and existing Jira identity mappings.
- Synchronize immediately after a successful upload and retry every five minutes while online. Offline or unsuccessful sync never discards a valid local upload.
- On opening a project from another computer, discover its original project ID from Confluence, automatically download missing files, verify every SHA-256 checksum, and restore BR metadata only into a new or unchanged local baseline.
- Never overwrite divergent local files or BR changes. Conflicts appear in the extension and require manual reconciliation; cloud downloads never create or publish Jira issues.
- Use the current account's configured Confluence credentials and normal space/page permissions. Confluence storage quotas and attachment permissions still apply.

## Verification

- Regression tests cover safe archive and reupload, preserved Jira mappings, stale revisions, source identity, model-response schema repair and count limits.
- Full GitHub Actions CI, Windows checks, theme validation and packaged VSIX verification are required before merging this release.

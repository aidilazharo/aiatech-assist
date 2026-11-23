# ATGV AIATECH Assist v0.0.70

Release date: 2026-11-23

## Workspace memory consolidation

- Create `.atgv/memory/` with private SQLite stores for extension AI metadata, per-project AI memory, encrypted credentials and durable workflow jobs.
- Migrate legacy per-project `knowledge/ai-memory.sqlite` to `.atgv/memory/ai-memory-<project>.sqlite` via integrity-checked SQLite snapshots, retaining the previous database as a rollback backup.
- Migrate earlier global-storage workflow SQLite journal into the shared workspace folder without discarding prior job metadata.
- Store extension-wide and project credential values as authenticated AES-256-GCM ciphertext in `credentials.sqlite`; keep the vault master key exclusively in VS Code SecretStorage.
- Automatically migrate existing saved provider tokens into the vault when first read, preserving endpoint- and project-scoped credential access.
- Preserve the encrypted credential vault on normal local Reset, with separate per-project SQLite isolation.
- Continue to keep user data out of the version-controlled Library and away from autonomous AI prompts.

## Validation

- Regression suite, database migration/integrity tests, encrypted vault tests and Windows reset checks required.
- VSIX compilation, runtime activation and size policy checks required.

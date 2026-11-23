# ATGV shared workspace SQLite memory · v0.0.70

`<workspace>/.atgv/memory/` contains runtime databases. It is **outside** the `library/` Git checkout and outside all project Git repositories. ATGV adds `memory/.gitignore`, and creates private directories and files on supported systems.

| File | Purpose |
|---|---|
| `ai-memory.sqlite` | Extension-level AI reference metadata and an index of project databases. Chat transcripts remain ephemeral as configured by role policies. |
| `ai-memory-<project-id>.sqlite` | One isolated SQLite store per project: approvals, document metadata, decisions, proposal states, delivery records and AI generation history. |
| `credentials.sqlite` | Shared extension/project credential vault. Credentials are encrypted with AES-256-GCM; each record has an independent nonce/authentication tag. |
| `atgv-workflow-jobs.sqlite` | Cross-role persistent workflow journal and retry metadata. |

**Credential security:** Only ciphertext is written to SQLite. The 256-bit encryption key stays in VS Code SecretStorage, scoped to the workspace. No API keys, passwords, GitHub PATs or Jira tokens are placed in AI prompts, project notes, the GitHub Library or the extension AI database. Extension and project callers use the same authenticated vault interface. The unattended AI service does not gain direct access to the decryption key; it continues to use approved credential delivery (environment/secure provider settings), not arbitrary credential-store reads.

**Migration:** Existing `projects/<id>/knowledge/ai-memory.sqlite` databases are migrated by verified SQLite snapshot to `.atgv/memory/ai-memory-<id>.sqlite` on first access. The original is archived under `memory/legacy-backups` if it is safe to move; active WAL databases are left untouched for later review. Old workflow journal files in VS Code global storage are copied by verified snapshot. Previous SecretStorage token values migrate to encrypted vault entries on first read and are removed from the previous store after encryption succeeds.

**Reset:** Local Reset preserves `credentials.sqlite` using a verified SQLite snapshot in the staged workspace, and clears project-specific runtime history as described by Reset. Full destructive reset requires its separate confirmation. Do not delete `memory/` manually. Backing up `credentials.sqlite` without its VS Code SecretStorage key will *not* make the credentials decryptable on another computer.

**Scope:** The central vault is shared within a **single trusted workspace**. It is not a networked user-identity server and does not automatically synchronize credentials among machines. Use the configured identity and authorization checks on every integration request.

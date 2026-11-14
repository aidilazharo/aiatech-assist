# ATGV AIATECH Assist v0.3.48 — Local Backup & Restore

New **Extension Settings → 7. Backup & Restore Local Content** actions:

- **Backup Local Content:** export project directories (including local Git repositories, branches and unpushed commits), the verified `.atgv` workspace library, workspace-scoped extension cache and non-sensitive ATGV workspace selections into a single `.atgvbackup` file selected by the user.
- **Restore Local Content:** select a backup from the same workspace, inspect its manifest, provide a warning and typed confirmation, validate decompression and SHA-256 for each file into staged directories, and replace managed local roots with rollback on filesystem failure. GitHub, Jira and Confluence remote records are untouched.
- **Credential preservation:** extension-wide configuration, provider settings, VS Code SecretStorage and unrelated workspace settings are untouched. No credential stores or extension globalState are exported. However, local `.env` and project documents **can contain secrets** and are included, so users must secure the backup.
- **Safety:** archive rejects unsupported paths, files outside managed roots, external symbolic links, corrupted file data, mismatched workspace identity and concurrent run/reconciliation operations. File contents are streamed with gzip compression; snapshots are restored only to the original workspace path.
- **Limitations:** snapshot is local only and not encrypted. A running external process could change local files during backup; save/stop work first. Symlinks are supported when relative and within their managed root. Restore does not download new versions from remotes.

These changes are distinct from **ATGV: Reset**, which deletes local work and re-downloads from configured sources, retaining extension settings and credentials.

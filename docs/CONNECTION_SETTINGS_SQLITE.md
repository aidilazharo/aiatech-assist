# ATGV shared connection settings — v0.0.71

Start and Settings use the same connection configuration database at <workspace>/.atgv/memory/settings.sqlite once the trusted workspace has been initialized.

- Non-secret Jira, Confluence and GitHub connection defaults, Library configuration and startup-completed status are persisted in SQLite.
- Provider tokens and API keys remain AES-256-GCM encrypted in credentials.sqlite, not the settings database.
- Settings save actions still require a successful connection test; failed tests do not persist changes.
- Only folder-scoped setup defaults migrate to SQLite on first initialization. SQLite is authoritative; the folder-scoped compatibility mirror never reads unbound global connection defaults.
- Start can test connections before a workspace has been initialized without creating folders or databases.
- Project-specific Jira keys, Confluence spaces and source checkouts remain independent in projects/<id>.
- Jira project mappings can be saved with verified Browse Projects access only; publishing still requires Create Issues permission.
- Jira inventory and BR links are indexed separately under `.atgv/memory/project-<id>.sqlite`; a Jira 404 never automatically removes approved BR records.
- The GitHub Library remains at .atgv/library and never receives SQLite files.
- A local backup includes the encrypted credential database but not its VS Code SecretStorage key. Backups must remain private.

The UI removes repeated help text and hides duplicate Library pull and API-key buttons; all permission tests and core settings controls remain intact.

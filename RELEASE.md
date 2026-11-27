# ATGV AIATECH Assist v0.1.64

- Isolate credentials, connection defaults and startup verification by local ATGV workspace, including first-time setup before SQLite initialization.
- Prevent automatic reuse of unbound legacy tokens and unbound VS Code GitHub authentication sessions. Existing encrypted workspace credentials remain supported.
- Add regression coverage for two folders sharing one OS account and for same-folder staged credential migration.
- Full regression suite and VSIX packaging pending CI verification.

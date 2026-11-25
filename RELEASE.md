# ATGV AIATECH Assist v0.1.36

## Changes

- Request first-time user registration only after explicit Overview navigation; background refresh and role visits do not prompt or register a new account.
- Show only Full Name and Email in the registration modal. Reuse stored identity details when the verified account or an unlinked matching email already exists, and reject conflicting account IDs.
- Keep existing role memberships, shared Confluence synchronization and registration confirmation safeguards.
- Preserve existing automatic extension and Library release checks and pinned AIA Malaysia release repositories.

## Validation

- Changed JavaScript syntax checked; nine simulated registration and navigation tests passed in a mocked harness. Live Confluence, VS Code UI, full regression suite and VSIX packaging remain unverified.

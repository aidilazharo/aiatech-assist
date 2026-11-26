# ATGV AIATECH Assist v0.1.51

## Fixes

- Prevent Developer chat tools from shrinking to zero height in a long conversation.
- Keep all messages at natural height in the existing scroll viewport.
- Accept both `dev-tool` and `dev-tools` locally; scroll the live toolbar into view.

## Validation

- Chromium layout reproduction: previous toolbar wrapper height 0px; fixed height 50px using representative markup and stylesheet rules.
- JavaScript syntax checked; regression assertions added. Full VS Code runtime and release packaging not run.

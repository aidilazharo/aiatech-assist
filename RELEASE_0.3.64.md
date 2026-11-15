# ATGV AIATECH Assist v0.3.64

- Fix the Solution Architect Test & Run smoke check for React/Angular: select independent free frontend and API ports, propagate the selected API port to ATGV's process runner and wait for HTTP readiness and API identity when supported. An alive Vite process alone is no longer sufficient evidence of a passing run.
- Keep Approve Stack actionable once the saved bootstrap/migration SHA has passed tests and was pushed. The approval action re-verifies live server health and Git revision on the host and displays the specific error instead of an unexplained disabled button.
- Preserve strict security: no approval without a healthy, ATGV-owned server at the tested and saved SHA; no force push or unrelated process termination.
- React + SQLite Qi-inspired component gallery now resides in SDLC Catalog 1.1.14; existing pristine projects adopt it through verified catalog migration after Pull Library + Save Stack.
- GitHub Actions builds and publishes VSIX releases from main.

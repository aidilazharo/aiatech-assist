# ATGV AIATECH Assist v0.0.61

Release date: 2026-11-23

## Custom Stack Install & Run

- Allow preview from a dirty Git checkout without overwriting edits, stashing, resetting, switching branches or committing.
- Always select the Vite frontend and open its root URL. Never treat a backend-only health endpoint as a successful app preview.
- Return a specific Vite frontend detection error when an API-only target is all that was found.
- Distinguish local/dirty/live preview evidence from clean, committed handoff approval evidence.
- Sync frontend URL into UI runtime and progress state.
- Retain v0.0.60 separated NestJS/PostgreSQL and React/Vite process management.

The clean-commit Developer handoff requirements remain unchanged.

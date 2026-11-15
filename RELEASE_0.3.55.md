# ATGV AIATECH Assist v0.3.55 — Remote Branch Diagnostics and Server Lifecycle

- Includes v0.3.54 explicit project selection and onboarding navigation fixes.
- Remote bootstrap/migration checklist is driven by confirmed remote publication, not a transient progress event.
- A rejected Git push reports the exact target branch and actionable GitHub authentication, branch rules, network, or divergence guidance. No force push or modification to main.
- A previously HTTP-verified application remains Ready for the **same saved and tested commit** after stopping the server. The Stop Server control is red while running.
- After a user-approved Test & Run succeeds for the exact published stack revision, ATGV safely starts the application automatically; no existing unmanaged port is taken over.
- Developer approval continues to require a running, HTTP-healthy server for the exact tested SHA.
- Added branch-error and server lifecycle regression tests.

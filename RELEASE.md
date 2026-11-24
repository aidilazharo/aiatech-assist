# ATGV AIATECH Assist v0.0.83

## Frontend and backend local preview
- Add separate Open Frontend and Open Backend controls in standard and Custom Stack views.
- Verify the direct catalog API health endpoint as well as frontend readiness before server approval.
- Custom Stack defaults to explicit real Vite + NestJS/PostgreSQL mode; mock API preview is a separate user choice, never a silent downgrade.
- Check configuration before modifying a checkout; expose independent backend reachability and use the detected run scripts.
- Stop both managed live services if either exits; preserve checkout and approval safeguards.
- Test & Run opens the verified frontend in the browser; backend is available via its dedicated control.

## Verification
GitHub regression, Windows startup/reset and VSIX packaging required before publishing. Real project services require approved local configuration.

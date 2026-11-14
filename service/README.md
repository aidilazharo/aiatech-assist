# ATGV Coordination & Background AI Service

This optional Node.js 22+ service provides shared document claims, owner-approved transfer requests, audit history, and a bounded background draft engine. **It is not a substitute for organization SSO, audit infrastructure, or human approval gates.** It binds to `127.0.0.1`; use an organization-managed HTTPS reverse proxy / authentication gateway before allowing remote users to connect. Never expose HTTP bearer tokens over unencrypted networks.

## Local setup

1. Create the user access tokens. Run `node scripts/create-service-user.js alice cockpit-sdlc` and repeat for other people. Give each person only their own raw token. Combine all generated hash-keyed entries into a `users.json` file, stored outside the extension workspace and protected with restricted filesystem permissions.
2. Set these environment variables:
   - `ATGV_SERVICE_DATA`: private server state directory (backups required)
   - `ATGV_SERVICE_USERS_FILE`: absolute path to `users.json`
   - `ATGV_SERVICE_PORT`: optional port (default `8787`, always bound to `127.0.0.1`)
3. Run `node service/server.js`.
4. In ATGV's **Operations & Handoffs** webview, click **Configure coordination service** and enter the HTTPS URL (or `http://127.0.0.1:8787` locally) and your token. Tokens are stored in VS Code SecretStorage.

## Optional unattended AI

Configure the **server**, not VS Code Copilot, with an organization-approved OpenAI-compatible endpoint:

- `ATGV_MODEL_ENDPOINT`: HTTPS chat-completions endpoint, or local loopback
- `ATGV_MODEL_NAME`: approved model name or `auto` (default) to re-discover the newest listed generation model at the configured endpoint for each draft. Requires a compatible `/models` API; explicit IDs remain supported.
- `ATGV_MODEL_API_KEY`: server-side API key (environment/secret manager)
- `ATGV_SHARED_PROJECTS_ROOT`: absolute path to a server-accessible `projects/` directory, such as an approved shared or mounted volume
- `ATGV_AUTO_PROJECTS`: comma-separated project slugs, e.g. `cockpit-sdlc,other-project`

The service periodically checks those projects' `documents/requirements/discovery-12.json` and prepares new drafts under `sdlc/ai-proposals/` when relevant inputs change. Drafts are never merged into approved documents automatically. The server must have continuous access to these project files; a cloud server cannot read a VS Code user's local computer unless files are synchronized/mounted there.

For a user to start a backend AI task via the webview, set `canStartAI: true` for that user in `users.json`. The webview action still requires explicit confirmation.

## API surface

- `GET /v1/projects/{project}/ownership`: list shared document owners and pending transfers
- `POST /v1/projects/{project}/ownership/{document}`: `claim`, `request-transfer`, `approve-transfer`, or `reject-transfer` with `expectedRevision`
- `POST /v1/projects/{project}/automation`: opt-in AI draft generation with saved BA discovery answers

All endpoints require a per-user bearer token. The server derives the actor from its token mapping; callers cannot impersonate another actor in request bodies. Transfer approval requires the current document owner and the current document revision. For a production multi-instance service, replace the local JSON persistence with a transactional database/SSO-backed authorization before scaling horizontally.

## Current boundaries

The service does **not** execute privileged deployments, approve Jira/Confluence workflows, auto-merge PRs or automatically run untrusted repository scripts. Enterprise Jira, Confluence, GitHub and model integrations have not been end-to-end tested against live tenant policies.

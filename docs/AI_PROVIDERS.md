# AI Providers — v0.0.94

## Configure

Open **ATGV Settings → Artificial Intelligence → AI Providers**.

- **VS Code Models (Auto / Copilot):** Uses the VS Code Language Model API, subject to provider availability and VS Code permission. Select a particular VS Code model from the header model picker.
- **Codex:** Defaults to an HTTPS-only compatibility profile scoped to ATGV (no user-wide config changes); the optional Codex default mode may attempt WebSockets. Uses the official Codex CLI `codex exec` with `--sandbox read-only`, invoked from the extension host as a child process. Uses existing Codex login where available. A Codex IDE extension is not directly callable by ATGV merely because it is installed.
- **OpenAI API:** Use an approved OpenAI model ID and a securely stored API key. Uses the Responses API.
- **Claude API:** Use an approved Anthropic model ID and a securely stored API key. Uses Anthropic Messages API.
- **Azure OpenAI:** Specify an approved deployment name and the full deployment chat-completions endpoint using HTTPS. Store the API key in SecretStorage.
- **Ollama:** Existing local Ollama endpoint, no npm dependencies in ATGV.
- **OpenAI-compatible:** Existing approved model endpoint with API key.

For API providers, enter the model identifier and key, click **Save Provider**, then **Test AI Connection**. For VS Code models, authorize the requested model and complete the connection test.

## Codex one-click installation

Click **Install Codex Automatically**. The extension asks for permission before invoking `npm install --prefix <ATGV global storage>/ai-runtimes --ignore-scripts --no-audit --no-fund --save=false @openai/codex@latest`. The installation is isolated to ATGV extension data, not system-global or project folders. Installation requires that npm is already available on the machine and that the official registry is reachable. It will fail gracefully when npm, the platform executable, proxy authorization, or network connectivity is unavailable. **The Codex executable is not pre-bundled in the VSIX.** It also does not authenticate automatically. Sign in through the supported Codex authentication process or provide approved credentials through your organization's setup.

No user is asked to run an npm command manually from ATGV's normal UI. ATGV does not attempt to install native runtimes silently at startup. Runtime updates must be user initiated.

## Security and limitations

- Cloud requests only occur after explicitly selecting and configuring the provider. ATGV does not automatically fall back to another provider.
- API keys are held in VS Code SecretStorage and are not written into the project or the catalog.
- Codex is called with read-only workspace sandbox permissions for generating textual results; no automatic code editing or publishing is granted.
- Request failures show the provider's error message rather than a generic `returned no text` indicator.
- Hourly unattended AI generation continues to require an explicit approved unattended endpoint; interactive VS Code or Codex sign-in is not assumed available to the background service.
- Provider availability checks do not guarantee authentication; **Test AI Connection** performs a small actual generation request.
- Runtime installation and live API sign-in cannot be verified in the build environment. macOS and Linux CLI launching use direct executable invocation; Windows .cmd launching may require additional platform-specific adaptation.

## Packaging

The extension provider adapters use built-in Node.js APIs, requiring no extra npm packages to build or install the VSIX. Optional Codex runtime installation is performed on demand after approval. `npm test` verifies provider protocols and error handling, not external authentication.

## Codex WebSocket connectivity

If Codex logs `responses_websocket: failed to connect`, select **OpenAI Codex Agent → Codex connection → HTTPS only**, save the settings and test. This compatibility setting runs Codex with a temporary, command-line-only custom Responses provider configured with `supports_websockets=false`, `requires_openai_auth=true`, and no hardcoded alternate endpoint. The current Codex authentication is still required. ATGV never edits `~/.codex/config.toml` and never silently switches to a different AI provider.

If HTTPS requests fail too, inspect the Codex login, enterprise proxy and TLS/CA configuration, and verify official Codex access. Changing the transport does not bypass provider authentication, enterprise network policy or an access restriction. The localhost:11434 endpoint is intentionally hidden when Codex is chosen; that endpoint is for Ollama and similar services.

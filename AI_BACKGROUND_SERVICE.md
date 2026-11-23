# ATGV AI Background Service

This service is part of ATGV AIATECH Assist, not a separate VS Code extension.

## Enable

Open an ATGV project, then use Settings → AI Background Service. Enable the service, choose an interval (60 minutes by default), and select either **VS Code** or **Independent** mode. Use **Run Check Now** to inspect approved requirements and generate reviewable proposals when configuration is complete.

For independent mode, install Node.js 22.13+ on the computer, select **Independent**, and click **Install OS Scheduler**. This installs a per-user systemd timer on Linux, LaunchAgent on macOS, or Scheduled Task on Windows. Removing the scheduler is available from the same Settings screen. Installations are per machine and per selected project. The task is created only after the user requests it.

## Approved unattended AI

Interactive GitHub Copilot models do not run in the independent scheduler. Configure an organization-approved Ollama or OpenAI-compatible API endpoint. A secure service environment must provide `ATGV_AI_PROVIDER`, `ATGV_AI_ENDPOINT`, `ATGV_AI_MODEL` and, when required, `ATGV_AI_API_KEY`. The extension's interactive VS Code mode can instead use the approved Knowledge & RAG provider settings and VS Code secret storage.

## Confluence shared coordination

The independent worker also needs an authorized Confluence token supplied by the organization's approved credential-injection mechanism as `ATGV_ATLASSIAN_TOKEN`. Use the existing project's Confluence/JIRA configuration and access permissions. The extension never writes these tokens to Confluence or SQLite and does not generate remotely without a usable shared lease. A missing token means generation safely remains disabled until configured. Do not place tokens in this project, scheduler command strings, source files, or Git.

## Data and recovery

The local SQLite database is at `<workspace>/.atgv/memory/ai-memory-<id>.sqlite`, with WAL files as needed, and is excluded from Git by a local `.gitignore`. Existing project JSON data remains intact. Confluence memory includes approved BR revision snapshots, decision records, project context and fingerprints. Accepted Markdown documents synchronize through the existing Confluence document mapping. Document owners must use Assign to Me and explicitly accept or reject generated proposals before changes are saved.

Both Confluence lease operations and document writes are guarded by revision checks. Offline synchronization attempts remain queued locally. Scheduled executions retry at the next trigger. Changes to published JIRA tickets are never performed automatically.

## Production validation

Before relying on unattended production behavior, verify Node and scheduler permissions on each supported operating system; configure approved credential injection; test one leased job with two separate computers against your real Confluence space; test remote version conflicts and lease expiry; and confirm Confluence document mappings and project-role ownership policies. The automated mock tests do not replace these staging checks.

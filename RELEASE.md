# ATGV AIATECH Assist v0.0.63

Release date: 2026-11-23

## Start screen: GitHub permission failures do not block access

- Check GitHub account, owner, Extension and Library repository permissions (read/write) and report their actual status.
- Require a successful Jira and Confluence connection check before saving startup credentials and enabling Next; GitHub account/token/repository checks are advisory, not a project-access gate.
- Continue with explicit Next and manual project selection even when GitHub PAT is absent, repository read is denied or push permission is unavailable.
- Retain strict permission and authentication checks on GitHub-dependent actions (pull private repositories, push, publish, sync or release). No permission bypass or fabricated GitHub success.
- Persist Jira/Confluence verification safely even without a GitHub token, with a current-settings-bound proof. GitHub warnings stay visible in diagnostics.
- Opening a project reports optional GitHub connectivity warnings instead of blocking when GitHub access fails.
- Preserve v0.0.62 TechCockpit synthetic API preview and explicit Start-screen Next behavior.

# ATGV AIATECH Assist v0.3.52 — Start-page wizard and prerequisite installation

- Split first-run onboarding into two independent steps, **Technology stack prerequisites** and **Jira, Confluence & GitHub connections**. Bottom Previous and Next buttons handle progression; project search begins only after successful connection checks.
- Add Refresh beside the technology prerequisites title. Remove the redundant introductory heading, three decorative numbered step labels, and Recheck Computer button.
- Each missing or incompatible module displays an Install action. Trusted host-run installer plans are statically allowlisted, require an explicit confirmation, show indeterminate progress and final results, and rescan on completion. Windows WinGet, macOS Homebrew and npm CLI installers are supported where verified. Unsupported modules/platforms open official installation instructions rather than execute unverified system commands. No installs occur during passive scanning.
- Accept separate trusted Jira and Confluence Atlassian Cloud hostnames, and automatically normalize a valid Confluence site base URL to `/wiki` just as older ATGV settings did. Both endpoints must still authenticate successfully before credentials or settings are saved.
- Preserve all saved user URLs, accounts and tokens; proposed AIA values are not forced over stored values.
- Add tests for wizard UI, URL normalization, installer allowlisting, command feedback and original settings behavior.

- Compact Jira, Confluence & GitHub connection settings into a responsive two-column grid (four rows), with concise field labels and inputs; remove the introductory guidance paragraph without changing connection verification or credentials handling.

# ATGV AIATECH Assist v0.0.66

Release date: 2026-11-23

## UI layout fixes

- Anchor the persistent role-connection warning directly under the permanent application header. Do not replace or hide the main header when other notifications appear, and keep the My Work waveform hosted by the main header.
- Force the role permission warning border and icon to red. Filter obsolete duplicate yellow credential-warning notices.
- Remove standalone My Work daily checklist cards and their **Go to task** buttons while preserving role AI conversation, host-side task records, and midnight chat reset.
- Move the Business Requirements action/status row (Stop, Refresh Affected Artifacts, Publish to Jira) beneath **Completed requirements**.
- Hide all five Business Requirements result panels until the individual panel contains ready content: Business Documents, Discovery, Generated Requirements, Jira Work Items, Completed requirements.
- Default result panels to collapsed when they become available; preserve independent access to source upload and in-progress discovery answers so no workflow becomes blocked by a hidden panel.

## Checks
- Update old daily-card tests and add dedicated v0.0.66 layout and visibility regression tests.
- Require Linux/Windows CI and VSIX build before main-branch merge and prerelease publication.

# ATGV AIATECH Assist v0.3.54 — Explicit Project Selection and Onboarding Navigation

## Changes

- Remove automatic opening of the previously selected, single, or workspace-detected project when ATGV starts. Recent and workspace projects remain searchable, and the user chooses which project to open.
- Hide **Previous** entirely on first-time Technology Stack Prerequisites. Connections retains Previous / Next.
- Put **Previous** at the bottom of Search Project. It returns to Connections, preserving visible fields; the user must re-test connections to proceed.
- Keep Search Project and the project-selection detail view mutually exclusive; fix the UI state override that could render both concurrently.
- Remove redundant Workspace Projects empty-state section when all projects are already listed under Recent Projects. Keep New Project next to the search box.
- Keep original user-initiated open flow, remote connection checks, and explicit offline recovery when opening fails.

## Checks

- Regression covers fresh start, repeated start, no auto opening, first/last step controls, non-overlapping project views and explicit selection.
- Extension software installation and catalog updates are unchanged.

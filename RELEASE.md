# ATGV AIATECH Assist v0.0.20

## Changes

- Hide the generated GitHub project repository URL beneath Project Repository on the Start screen while preserving the editable repository, PAT and connection verification.
- Always display a verified next-action navigation button immediately when the active role opens My Work, without waiting for AI or relying on provider availability.
- Add explicit action labels and role workspace navigation for all 18 SDLC roles, maintaining read-only guidance and human approval for any changes.
- Ground Business Analyst, Developer, Project Manager, Solution Architect and QA suggestions in live cross-user project activity when available.
- Strengthen role chat prompts to distinguish verified project evidence from missing or stale sources.
- Prepare integration with Library's v0.0.5 project snapshot and verified next-action contracts (these Library files remain declarative and do not authorize remote writes).
- Add regression tests for hidden URL, 18 role actions, immediate buttons, and project-specific guidance.

## Verification

Run complete Node regression, Windows and VSIX packaging checks; squash merge only after required CI passes. Publish verified VSIX from main. Keep source-only .memory out of released artifacts.

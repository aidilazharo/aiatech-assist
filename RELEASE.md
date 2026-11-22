# ATGV AIATECH Assist v0.0.35

## My Work AI and SDLC navigation

- Remove the black gap above My Work chat. The conversation now begins immediately under the header; clip the lower half of the red/CMYK waveform at the real header border rather than reserving an empty 42px (mobile 34px / short screens 24px) spacer.
- Remove **Role Workspace** from the sidebar. Keep the same role-specific work pages, unsaved-change guards, AI chat **Go to task** routing, Jira ticket selection and role permissions.
- Combine sidebar navigation **SDLC**, **Documents**, **Solution Designs**, **Knowledge & RAG**, and **Approvals & Handoffs** into **SDLC Workspace**.
- SDLC Workspace opens **SDLC Readiness** by default and exposes four internal tabs: Documents, Solution Designs, Knowledge & RAG and Approvals. The Readiness control reopens the original SDLC status page.
- Preserve all existing page IDs, handlers, document editor routes, approvals, Confluence, Jira and project permission checks; tab switching uses the existing `navigate`/view system.
- Add keyboard-operable tab navigation, selection state and focus indicators. Library Studio remains visible only in the active Developer role.

## Verification

- Test no duplicate visible sidebar entries, preserved AI action navigation, tab selection, mobile/small viewport chat, waveform clipping, and old workspace page guards.
- Require full Node regression suite, Windows validation and VSIX packaging before merge.

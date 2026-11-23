# ATGV AIATECH Assist v0.0.62

Release date: 2026-11-23

## TechCockpit Custom Stack: full frontend, synthetic API and data

- Recognizes the current multi-application TechCockpit checkout: `ReactTS_Frontend` (React 19, Vite 8) and `NestJS_Backend` (NestJS 12).
- Starts the real React/Vite frontend at `http://127.0.0.1:5173/`, not the backend health endpoint.
- Injects a temporary, localhost-only TechCockpit API middleware into Vite for development preview, using an in-memory fictional dataset. No real PostgreSQL, Okta, ServiceNow or external APIs are contacted.
- Implements session, safe local sign-in redirect, notifications, TRM applications, services, capabilities, software models, technology standards, servers, facets, portfolios, landscape, roadmap and approval-list read contracts.
- Implements selected in-memory actions (notification read, application time-rating and portfolio assignment). Unsupported routes return HTTP 501 rather than forwarding to real services.
- Uses distinct, synthetic demo identities and assets with a visible **MOCK DATA - LOCAL PREVIEW** banner. Mock success never counts as real backend/database or approval readiness.
- Detects an obsolete single-app ATGV starter checkout and provides a specific non-destructive instruction to obtain the current TechCockpit repository, rather than claiming it is the full app.
- Keeps the v0.0.61 dirty-checkout preservation, clean-commit handoff restrictions and no-automatic-branch-deletion policies for users' local work.

## Start screen: manual Next required

- Removes automatic credential-based advance and automatic opening of previously selected projects. The Start screen remains available even when saved connection verification is valid.
- Users must explicitly select **Next** to open project search; project selection remains manual. Saved settings and Test Connections remain available.
- The extension host rejects obsolete automatic sign-in requests, preserving the explicit user-action requirement.

Node.js 24 or newer and npm 11 are prerequisites for the actual TechCockpit frontend. The demo API is *not* a replacement for integration, authentication, persistence, compliance or performance testing.

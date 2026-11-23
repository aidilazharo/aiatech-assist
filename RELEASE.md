# ATGV AIATECH Assist v0.0.60

Release date: 2026-11-23

## Custom Stack full-stack startup

- Detect nested Vite frontend and NestJS backend applications from their real manifests.
- With an explicitly configured development `NestJS_Backend/.env`, install both applications, run the real NestJS API on port 3000, verify PostgreSQL health, then start Vite on port 5173.
- Track both service processes, preserve separate logs, and stop both through the existing Stop control.
- Show frontend URL rather than API-only health URL. Reject synthetic API responses during live-backend verification.
- Where backend configuration is absent, retain a clearly labeled MOCK DATA ONLY frontend preview, not a claim of real database access.

## Safety and compatibility

- Preserve existing .github workflows, tech stacks, source contracts, and credential configuration.
- Local Custom Stack branch handling remains unchanged; no automatic GitHub push or PR from Install & Run.
- PostgreSQL, Okta, and external integrations require separately verified approved development credentials.

## Validation

- New focused full-stack tests cover target pairing, mode gating, health integrity, dual-process lifecycle.
- Extension-level regression suite and package verification are executed during release.

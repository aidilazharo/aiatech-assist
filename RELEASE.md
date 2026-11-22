# ATGV AIATECH Assist v0.0.44

## Changes

- Detect standard multi-application and npm workspace repository layouts without ATGV-only root-level adapters.
- Classify runnable Vite frontends using both a local Vite configuration and an actual Vite start script, not a test-only dependency.
- Preserve NestJS/Express/Fastify API identification even when their test tools include Vite.
- Prefer runnable frontend applications for Custom Stack installation and local browser previews.
- Route supported Node API targets to isolated synthetic API health previews instead of a Vite mock overlay.
- Recognize standard `apps/`, `services/`, `packages/`, `modules/`, and related workspace containers.
- Use a standard `dotnet test` command rather than a hardcoded test project.
- Add regression tests for React/Vite frontend, NestJS with test-only Vite, npm workspace root, and Express classification.

## Safety

- Preserve existing application sources, local Git fix branch isolation, and explicit execution approval.
- Mock data is synthetic and must not be presented as a real database or production readiness.
- Unsupported runtimes are detected and reported rather than silently modified or executed.
- No Tech Cockpit-specific framework assumptions were added.

## Validation

- Source-level classification checks: passed for NestJS, React/Vite, Next.js, and workspace root.
- Regression test added: `test/v044-industry-standard-custom-stack.test.js`.
- Full Node regression suite, Windows verification, and VSIX packaging: pending CI/execution.
- This release record describes the branch candidate; it is not a claim that a distributable VSIX has been built.

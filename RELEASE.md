# ATGV AIATECH Assist v0.0.29

## Technology Stack — Custom Stack
- Discover npm/.NET/Maven apps in verified repo root, first-level folders and common two-level apps/services/packages paths instead of only the three fixed catalog paths. Avoid symlinks, generated folders and directory escapes.
- Detect both ReactTS_Frontend and NestJS_Backend in AIA TechCockpit and use NestJS `start:dev` when no conventional `dev` or `start` script is available.
- Discover the actual NestJS versioned health endpoint at `http://127.0.0.1:3000/api/v1/health`.
- Allow dependency installation in verified nested application directories. Do not overwrite or push project code.
- Add an explicitly confirmed **Run Mock Preview** button for detected Vite apps. It installs the selected frontend dependencies and runs on localhost using a temporary Vite configuration with a simulated session and read-only API stubs; mock requests cannot reach the real backend.
- Unknown API endpoints respond with HTTP 501 rather than reporting fake success. Show a permanent MOCK DATA preview label.
- The mock flow does not approve the technology stack, access the database, replace real integration testing, or claim that the backend started.

## Save Stack button
- Blue and enabled for a new/changed technology-stack selection.
- Green, labeled **Saved Stack**, and disabled after the selected stack is successfully saved; the state survives My Work rerenders and project switches.
- Only a user selection change enables the blue action again. Failed/cancelled saves remain eligible for retry.

## Verification
- Add regression checks for nested monorepo detection, dependency path validation, mock preview isolation and Save Stack state.
- Full Node, UI and Windows tests, VSIX packaging and release validation must pass before merge/release.

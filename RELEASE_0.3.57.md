# ATGV AIATECH Assist v0.3.57

## Technology Stack — unified errors

- Replaced **Download Stack Error Log**, **Download Test Error Log** and **Download Server Error Log** with one **Download All Error Logs** button.
- The unified download includes dated, chronological, redacted diagnostics across Save Stack, Reset, Test & Run, dependency checks, app server, approval and catalog failures, scoped to the selected project.
- Successful retries no longer discard previous errors from the consolidated report. The retained history is bounded to 24 errors per project (30 active projects) and 1 MiB per export. Logs remain in memory until explicit Save; they are not automatically written into Git.
- The error count survives webview refresh within the same extension process.
- After tests and build succeed, ATGV records transition into application-server validation. An occupied preview port is reported under **Application Server**, not **Application Build**.
- No generated application files, build scripts, technology catalog or dependency versions were changed.

## Diagnostics of supplied user logs (15 November 2026)

The captured React Save Stack trace shows: npm dependency validation passed, unit/API tests passed, TypeScript/Vite build passed (exit code 0), then port 127.0.0.1:5173 was occupied. An unrelated process using that port must be stopped by its owner; ATGV will not take over a non-ATGV-managed process.

The separately uploaded atgv-build.log shows ENOENT because npm was run from C:\\repo\\atgv, not the generated React application folder. The source trace used C:\\repo\\atgv\\projects\\tech-cockpit-confluence\\repository\\tech-cockpit.

## Verification

Static JavaScript syntax and cross-file UI references checked. The combined log module passed a direct runtime smoke test for aggregation, retention, isolation and token redaction. The complete VS Code integration/VSIX build requires GitHub Actions or a local VS Code environment.

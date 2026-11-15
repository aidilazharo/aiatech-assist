# ATGV AIATECH Assist v0.3.58

## Automatic available preview port

- **Save Stack** and **Run Server** probe the configured localhost port and automatically select an available alternate when it is already occupied.
- Try nearby ports first, then request a free ephemeral port from the operating system. Only localhost HTTP destinations are permitted; no unrelated process is stopped or taken over.
- Launch the React and Angular catalog starters with runtime-only port CLI arguments, without changing committed npm scripts or application source. Node.js, .NET and Spring runtimes receive standard port environment variables.
- Carry the actual selected preview URL through browser opening, Technology Stack progress, Application Server status, verification and stop; display it prominently as **Preview address: http://127.0.0.1:<port>/**.
- Preserve the localhost path (including API health endpoints), the saved stack SHA, and the rule that Developer approval requires a healthy running application at the verified commit.
- Tests cover free-port fallback, occupied candidates, dynamic React/Angular commands, address display and process isolation.

## Compatibility and safety

- No branch, committed app code, or package.json is rewritten to change ports.
- Fixed additional backend ports (for example React/Angular SQLite API port 3001) are outside this frontend preview-port selection. Those ports can still require availability; failures are reported rather than taking over other processes.
- Port allocation uses the OS/network check and may still be affected by a last-moment race; app readiness checks must succeed before the URL is reported ready.

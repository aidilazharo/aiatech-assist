# ATGV AIATECH Assist v0.1.28

## Changes
- Suspend workflow journal access during confirmed workspace Reset; reject new dashboard commands and overlapping Reset operations during replacement.
- Drain queued journal operations and close the SQLite handle before replacing workspace directories. Stop remaining project background timers and check active operations before replacement.
- Preserve transactional Reset safeguards, remote sources and encrypted credential migration.
- Add a regression that drains a queued journal write, rejects new transactions, renames its storage folder and reopens the persisted data.
- Require the lifecycle test to observe the actual Reset completion notice, reporting host errors instead of only a missing-file assertion.

## Validation
- Previous Windows build v0.1.27 passed 2699 of 2705 tests, with one failure and five skips. The remaining Reset failure did not expose its underlying host error; journal locking is a likely cause, not yet verified. Full Windows test execution and packaging of this version remain to be verified.

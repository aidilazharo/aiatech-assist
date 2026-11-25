# ATGV AIATECH Assist v0.1.26

## Changes
- Close every test workflow journal, including reopened SQLite instances, before removing temporary directories. Wait for queued workflow operations and keep cleanup failures visible.
- Retry temporary filesystem sharing violations with bounded recursive removal retries.
- Preserve the SQLite persistence regression and explicitly assert that both handles are closed and the temporary directory is removed.
- Close symlink-test journal handles before cleanup and use a Windows directory junction for the directory-link security check; retain file-symlink coverage.
- Synchronize package, display, README and dashboard versions.

# ATGV AIATECH Assist v0.3.56

- Removed the duplicate Project selected / Open Project screen. Selecting a project row is the only required open action.
- Connection validation and workspace initialization run on that explicit click, without a second confirmation.
- Errors and the existing offline recovery action remain visible inline on Search Project.
- No automatic project selection or opening was introduced.

Note: Application build scripts are unchanged. Investigate any npm run build failure using its captured diagnostic stdout/stderr.

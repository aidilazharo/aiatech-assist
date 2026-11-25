# ATGV AIATECH Assist v0.1.13

- Enable Custom Stack Approve for Developers after successful local mock Install & Run on an ordinary Git branch, including dirty main.
- Persist local-preview-only evidence rather than silently discarding it. Publish only the committed baseline SHA after explicit confirmation; local edits remain untouched and excluded. Exact baseline runtime and test/build are marked unverified.
- Retain clean fix-branch verified preview path, SHA and remote checks, and development-only scope. No auto-commit, stash, reset, force-push, or merge into project main.
- Add dirty-main baseline approval regression coverage. Full regression suite and live VS Code verification not run; no VSIX generated.

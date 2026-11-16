# ATGV AIATECH Assist v0.3.71

## Library Studio: CodeMirror after offline SDLC Library ZIP import

- An explicitly imported, checksum-verified SDLC Library ZIP can activate its included CodeMirror, Quill, and Frappe Gantt files **only** when the full webview asset manifest and every byte SHA-256 match the trusted versioned extension lock.
- Restores the Library Studio webview immediately after importing ZIP so its vendor scripts and CSP file roots are correct.
- Reuses the verified editor asset cache offline; a verified GitHub catalog pull may replace it later.
- Records an actionable CodeMirror activation failure without discarding a valid imported SDLC Library if assets are missing or changed.

No arbitrary ZIP scripts are executed in the extension host. Network download is not required for a complete library ZIP containing the approved pinned webview assets.

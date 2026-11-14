# Webview libraries moved to the SDLC Catalog

Third-party CodeMirror, Quill and Frappe Gantt assets are no longer shipped in the VSIX. The reviewed binary distributions and their licenses are published at `tech-stacks-skills/shared/libraries/webview/`. ATGV downloads, validates, and caches the pinned assets before use. The extension host never loads downloaded JS as a Node module.

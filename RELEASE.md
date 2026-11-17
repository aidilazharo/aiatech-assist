# ATGV AIATECH Assist v0.4.00

- Bundle upstream **SortableJS 1.15.7** with the extension, including its MIT license. No user npm installation, external CDN, or internet access is required to drag Jira cards.
- Project Manager → My Work Kanban: drag cards between Jira status columns using a touch-friendly handle; preserve keyboard access through the existing status selector.
- Jira remains authoritative: status moves validate allowed transitions, require confirmation, and only commit remotely after Jira accepts them; rejected moves restore the original board and explain the error.
- Keep the existing native HTML drag-and-drop fallback if SortableJS fails to initialize, and add missing-asset detection in the webview startup diagnostics.
- Verify the exact upstream SortableJS build, license, script loading order and VSIX inclusion in automated regression and package tests.

Release packaging runs Linux regression tests, UI checks, VSIX verification, and Windows startup/reset tests.

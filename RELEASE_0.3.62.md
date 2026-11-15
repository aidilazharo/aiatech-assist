# ATGV AIATECH Assist 0.3.62

- Fix legacy fixed-port React/Vite and Angular API proxies: select a free API port, generate a temporary Git-ignored proxy override, and launch the managed server without changing approved source or terminating unrelated processes.
- Clean up the temporary override on process exit and preserve the one-managed-server policy.
- Simplify GitHub Account & Defaults to one horizontal row: owner, editable GitHub repository URL, personal token, Test Connection, and Save Settings. Remove repository list and branch picker; use main as the configured repository base branch, preserving dedicated approved work branches.
- Align Project Settings panel heights, section title font sizes, and padding with Extension Settings.
- Remove the four redundant settings explanatory passages and the All Projects scope label.
- After a verified VSIX installation succeeds, automatically reload VS Code and regenerate the ATGV webview using the existing safe restart mechanism.
- Release packaging remains exclusively via GitHub Actions on main; no local VSIX artifacts.

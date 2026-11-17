<!-- Replace this file with the latest release notes for each release. -->

# ATGV AIATECH Assist v0.3.95

- Report user interface, process, error, performance and improvement issues from ATGV or the VS Code Command Palette. Reports and captured errors are stored locally for review.
- Set up the GitHub Copilot SDK from ATGV and use it to propose targeted repairs for the extension or SDLC Library in an isolated source checkout. Copilot authentication and a supported Node.js runtime are required.
- Review proposed changes, run project checks, and explicitly create and merge a GitHub pull request. The existing release workflow publishes successful extension updates.
- Record dependency installation errors and identifiable failed package versions across sessions. npm retries use the newest unfailed version within the approved package range; NuGet and Maven recovery stays within the original major version of a verified generated starter.
- Stop an installation and resume later without retrying recorded failed versions. Download dependency history for review; connectivity or authentication errors are recorded without blacklisting a package version.
- Recognize Node.js 24 test failure output when collecting TDD evidence, and check the Copilot SDK runtime in the release workflow.

<!-- Replace this file with the latest release notes for each release. -->

# ATGV AIATECH Assist v0.3.94 — Startup technology stack modules

- The startup technology-stack panels now show every direct runtime, development, test, optional and peer package declared in the active SDLC Library scaffold manifests, including Vite and other project tools.
- npm package manifests, NuGet project files and Maven dependency and build-plugin declarations are read from the catalog. Node.js engine ranges are shown where the scaffold declares them.
- Host executables and project-local packages are shown separately. Project packages are installed or restored in the selected project when the Solution Architect saves its stack; the startup screen does not pretend they are globally installed.
- A verified local Library is preferred. If no checkout is available, the extension reads and verifies the necessary manifest blobs from one authenticated GitHub main revision. When the Library is unavailable, it reports that the module list is unavailable rather than inventing it.
- Successfully verifying startup connections refreshes the catalog-backed package list. No catalog scripts or installer commands are executed by the scan.

## Workspace review

- Generated destination branches use the source change type and purpose without a trailing commit hash. Existing branches are not overwritten; the review suggests an unused numbered name when needed.
- Suggested commit messages and PR titles use readable sentence case and standard capitalization for common product names and acronyms.
- Suggested PR details use bullet points, with at most 10 points. The review checks edited descriptions before publishing.
- Workspace sync always includes tracked `.github/workflows` files, including when the selected copy scope is narrower; matching destination workflows are updated on the review branch and destination-only workflows remain.
- Release notes are maintained in this single file and replaced for each new version.

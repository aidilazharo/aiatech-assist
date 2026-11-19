# ATGV AIATECH Assist v0.4.41

## VSIX production-size optimization and reporting

- Minify production JavaScript at packaging time with pinned Terser 5.31.6 (no compression transformations or identifier mangling) and CSS with pinned clean-css 5.3.3. Original tracked files remain unchanged, and build-only dependencies are excluded from the VSIX.
- Keep critical runtime modules, offline parsers, assets, license files, original document handling, UI design system, extension command activation and SDLC Library integration intact; no speculative removal of modules that may be loaded dynamically.
- Generate dist/vsix-size-report.json and dist/vsix-size-report.md with exact ZIP member sizes, original and optimized bytes, biggest files, folder breakdown and duplicate asset candidates.
- Enforce a hard 1,400,000-byte VSIX size budget against the verified v0.4.40 1,327,153-byte baseline; fail packaging and block release if exceeded.
- Include the size reports in CI summaries, build artifacts and GitHub Releases so future version growth can be audited.
- Add regression coverage for minified JS/CSS syntax, original source immutability, release packaging checks and version alignment.

## Notes

- Source ZIP remains complete and unminified, preserving development and auditing capability.
- The identical icon/branding files are retained because existing runtime paths need both until a verified migration is available; they are listed in the size report rather than removed unsafely.
- Minifiers are build-time devDependencies only. End users need no additional npm installation to install the released VSIX.

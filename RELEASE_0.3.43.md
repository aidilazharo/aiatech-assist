# ATGV AIATECH Assist v0.3.43

## Library Studio — visual hallucination result layout

- Show the **Visual grounding / false-premise** score on the far right of the section title, using the existing computed score.
- Below the title, explain which of the two independent checks passed: visible-shape color and rejection of the nonexistent shape.
- Display **Unsupported / Error / Not tested** instead of a misleading percentage when no graded image evaluation exists.
- Preserve original questions, actual model output, image-evidence recording, and independent geometry benchmark scoring.
- No AI Harness / GitHub catalog changes or privileged operations.

## Checks

Run `npm test` and `npm run package` to verify the regression suite and VSIX packaging.

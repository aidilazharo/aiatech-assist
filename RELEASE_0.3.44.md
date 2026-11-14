# ATGV AIATECH Assist v0.3.44 — Overall agent score and visual answer clarity

Baseline: v0.3.43.

- Display the combined image-agent benchmark score at the far right of the Agent/Harness resource title. The score reflects the *selected recorded run*: 50% geometric replication accuracy and 50% two-question visual grounding accuracy, when both measurements are valid.
- A missing/unsupported vision evaluation shows **Incomplete**, not an inflated overall percentage. The four Context/Tools/Loop/Governance configuration checks are not counted as live evaluation scores.
- Replace the raw JSON blob in the visual-grounding panel with two separate question-and-answer rows; show the model answer, expected answer and Pass/Fail. The AI continues returning structured JSON for deterministic assessment.
- Preserve the independent human Pass/Fail verdict, model information and historical benchmark results. Existing v0.3.43 result histories remain readable; overall scores are reconstructed from saved component evidence.
- No catalog or VS Code image-input API changes.

## Scope and limitations

The combined score covers two image benchmark components, not a complete certification of the AI agent. This release does not add a new live Context/Tools/Loop/Governance evaluator and does not claim a visually verified VS Code session.

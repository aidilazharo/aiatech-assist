# ATGV AIATECH Assist v0.3.45

## New: Agent Quality Benchmark

- Library Studio now exposes an **AI Agent Quality Benchmark** alongside the existing image-only test.
- Evaluates **Skill Competency (50%)**, **Hallucination Resistance (30%)**, and **Grounded Evidence Citation (20%)** separately.
- Role-grounded, bounded decision scenarios for Business Analyst, Solution Architect, UI/UX Designer, Developer and Git Agent: two scenarios per agent.
- Loads the selected agent's assigned `roles/<role>/SKILL.md` from the verified GitHub catalog or local/project override. Developer and Git Agent tests also load specialized repair/Git skills where available.
- Optional **Compare without role skill** using the same selected model and scenario, reporting the difference.
- Per-model saved quality results with selected scenario, actual model/provider, catalog commit, skill hashes and result details; old visual geometry histories remain supported.
- Critical forbidden decisions fail regardless of other scores. Fabricated known answers, invented answers to unknown questions, incorrect evidence IDs and malformed JSON responses reduce the score or fail the run.
- Malformed model JSON is **recorded as a failed 0% result**, not silently omitted.

## Scope and limitations

This is a **decision-level** role-skill and hallucination benchmark. It does **not** execute Jira, GitHub, shell commands, developer worktrees or approval actions. Evidence citation is based on supplied test-context IDs and is not live external tool verification. Do not treat a 100% score as certification of production agent behavior. The existing image-geometry/vision benchmark remains a separate test mode with independent scoring.

Tests currently use bundled versioned scenario rubrics, with the effective role/specialist skill text resolved from the GitHub catalog. Publishing scenario rubrics to the catalog for independent updates is planned separately. No GitHub catalog files were changed by this extension release.

## Validation

- Full Node regression suite: see `npm test` output.
- VSIX packaging with manifest and archive integrity checks.
- Real VS Code Copilot model behavior and visual testing remain unverified in this build environment.

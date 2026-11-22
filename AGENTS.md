# AGENTS.md — rules for ALL AI agents in this repo (Claude, Codex, Gemini, any other)

## COMMIT RULE — ABSOLUTE, NO EXCEPTIONS
- Every commit author AND committer: Sreenath <sreenathmmmenon@gmail.com>
- NEVER add "Co-Authored-By:" trailers. Not Claude, not Codex, not anyone.
- NEVER add "Generated with", "Claude-Session", emoji robots, or any AI attribution
  lines to commit messages, PR descriptions, or code comments.
- Commit messages: short, imperative, lowercase ("add gst grader", "fix consent gate").
- A commit that violates this rule must be amended before push.

## REPO RULES
- src/contracts/contract.ts is FROZEN. Propose diffs to the integrator; never edit.
- One lane, one folder: kirana / gst / upi / harness / ui / app-api have single owners.
- Graders are pure functions of final environment state. They NEVER read model text.
- All money in integer paise. Convert to Rs only at the UI edge.
- task.expected must never reach any model prompt or observation.
- No API keys in code or commits — env vars only (.env.local is gitignored).
- HELD_OUT task prompts stay sealed (REVEAL_HELD_OUT=1 only on stage).

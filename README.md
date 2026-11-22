# Bharat Gym
Where agents train for India. RL environments + verified evals for Indian tasks.
Built solo at Builder's Day, Product (Un)Conference '26, Bengaluru — build window 13:00-17:00.

## Run
npm install && npm run dev        # local
railway up                        # deploy (keys in Railway service variables)

## Structure
src/contracts/  frozen contract (written 13:00, FROZEN 13:15 — nothing exists here before)
src/envs/       kirana-v1 | gst-filing-v1 | upi-dispute-v1 (tools.ts, grader.ts, cases.ts, View.tsx)
src/harness/    adapters.ts, runner.ts, cache.ts, retry.ts
src/ui/         Arena, Inspector, Leaderboard, StageMode, Enter
fixtures/       recorded Rollout JSONs (UI lane builds against these first)

## Rules compliance
Scaffold only before 13:00 (kit: "set up accounts and tools, deploy a test app").
Mocked: GST portal & UPI rails are simulations. Tools used: Claude Code, Codex,
Gemini CLI as build lanes; Claude/GPT/Gemini/Sarvam APIs as contestants.

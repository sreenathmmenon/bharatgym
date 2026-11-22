# CRITIC — Bharat Gym audit (snapshot while lanes are still writing)

What I audited: contract, adapters, runner, cache, envs/kirana/*, tests, app/ (layout, page, arena), src/ui/*.
`vitest`: 7/7 pass. `tsc --noEmit`: fails (see #15). There is no `app/api/` yet.

What holds up: the grader (`grader.ts`) is a pure function of env state plus `task.expected` and never reads `finalClaimText`. Bill totals are integer paise. No `expected` value currently reaches the system prompt or observations (details in #14).

---

## BLOCKER

1. **The arena shows made-up results under real model names.** `src/ui/lib/fixtureLanes.ts:8-47` sets every check to passed and the score to 100 by hand for "claude" and "sarvam". It gives the same failing fixture to "gpt" and "gemini". The fixture's claim, "Done! Bill Rs 163.00 - perfectly tallied.", is copied word for word from the scripted UnitConfuser (`policies.ts:47`), so a scripted lie is credited to GPT. The fixture's score of 56 doesn't match its own checks (they give 50), and it has no TILL_BALANCED check (`fixtures/sample-rollout.json`). The leaderboard numbers are typed in (`fixtureLanes.ts:54-60`). GPT's average is lowered by hand (`ArenaView.tsx:56-61`). The home ticker shows the same numbers (`app/page.tsx:44`). None of this is labelled, and it sits under the line "Scored by code… No LLM judging. Ever." — **Fix:** before the demo, make the fixture by running `runLane` and grading for real. Until then, name the lanes `ref-perfect` / `unit-confuser` / `consent-skipper` and show a "SCRIPTED DEMO REPLAY" badge on every screen.

2. **Every call from the Claude lane fails with a 400.** `src/harness/adapters.ts:57-59`: the transcript always opens with the user's order. The mapper turns every message that isn't a `tool` message into `role:'assistant'`, so the conversation starts with an assistant turn and Anthropic rejects it. The "Begin the task now" branch can never run. Past tool calls are also sent without their args. — **Fix:** map `user`→`user`, and use native `tool_use` / `tool_result` blocks with ids and full `input`.

3. **The Reward-Guided Retry, the holdout lock and the `/api/run` route don't exist.** A grep finds no retry, gate or holdout-locking code, and there is no `app/api/` folder. Yet `app/page.tsx:6` shows a `curl $GYM/api/run` example, and the pitch says "promotes only if holdout improves, zero regressions". — **Fix:** build the gate: score old and new prompts on HELD_OUT with N≥3 seeds each, promote only if the mean goes up and no task's score goes down, and the rewriter must only ever see TRAIN grades. Otherwise remove it from the pitch and the UI.

4. **The held-out tasks overlap the training tasks and appear on screen.** H1 is K10's cart with the payment step removed (`cases.ts:33` vs `:40`, same items and Rs 163). H6 is K8 reworded (`cases.ts:25` vs `:50`). The "locked" H1 is also the task shown publicly in the arena (`fixtureLanes.ts:32-35`, `ArenaView.tsx:67-70`). A prompt tuned on TRAIN passes the holdout for free, which is exactly the overfitting mentors probe for. — **Fix:** replace H1/H6 with new traps that don't overlap TRAIN (e.g. "paav kilo", "dhai sau gram", a different consent wording or out-of-stock SKU). Never send HELD_OUT prompts to the client before the reveal.

## RISK

5. **Any `ask_customer` call grants consent.** `src/envs/kirana/env.ts:119-125` grants consent on the first scripted turn whatever the question was ("aur kuch chahiye?" counts) and whether or not a substitute was offered. `offer_substitute` (`:116-118`) records nothing in state. So SUBSTITUTION_CONSENT can pass even though nobody asked about the substitute. — **Fix:** record offers in state, and grant consent only if `offer_substitute(amtz→milk)` came before the ask. Add a test for "asks a question without offering".

6. **Provider outages count against the model and go into the leaderboard.** `runner.ts:36-37` catches the error, ends the episode, and still grades and saves it (`:55-69`). A 401/429/timeout then shows up as about 11/100 for "Claude" (`cache.ts:40-49`). — **Fix:** add `status:'error'` to the Rollout, don't grade or save it, and show "PROVIDER ERROR" in the lane.

7. **SSE events carry no race id.** `contract.ts:21-26` and `runner.ts:12-14` use one global `EventEmitter`. If a floor submission and the stage race run at the same time, their events mix, and agentId `claude` appears in both. — **Fix:** add `raceId` to every `SseEvent` and filter by it in the route.

8. **Floor endpoints allow SSRF, and the floor fallback can crash.** `adapters.ts:81-86` makes the server POST to any URL a builder supplies (including internal addresses like 169.254.169.254) and passes `data.call` to the env without checking it. `adapters.ts:90`: if no API keys are set, `base` is undefined and `base.next` throws. Matching `config.model` against lane ids ('claude') doesn't fit the contract's `model` string. — **Fix:** allow https only, block private and link-local IPs, check that `call` has a string `name` and an object `args`, and guard against a missing `base`.

9. **On the OpenAI-compatible path, any reply without a tool call ends the episode.** `adapters.ts:24-31` sends tool calls and results as plain text instead of native `tool` messages. `runner.ts:47-49` treats any text-only reply ("Let me check stock…") as the final claim, so GPT, Gemini and Sarvam lanes will often stop after one step. Only the first parallel tool call is kept (`:41`). — **Fix:** use native `tool_calls` and `role:'tool'` with `tool_call_id`, set `parallel_tool_calls:false`, and nudge once when a text reply comes before `collect_payment`.

10. **Money enters the tools as float rupees.** `env.ts:71-72,139-140` take `cashRs` / `upiRs` floats, and `policies.ts:29,45` send `paise/100`. `collect_payment` doesn't check that cash + UPI equals the bill (even though its description says it must) and can be called repeatedly. `add_to_cart` after `generate_bill` leaves the old bill in place. Stock is never decremented, so ordering more than is in stock works. — **Fix:** make the tools take integer `cashPaise` / `upiPaise`, reject a payment that doesn't equal the bill, clear `billedPaise` whenever the cart changes, and enforce stock.

11. **The JSON store can lose data, and the leaderboard mixes things that shouldn't be mixed.** `cache.ts:10-23` reads, changes and writes the file with no locking, so concurrent races lose rollouts. A JSON parse error silently falls back to `[]`, and the next save then erases all history. `leaderboard()` (`:40-49`) mixes TRAIN, HELD_OUT and AUDIENCE tasks, different grader versions, and scripted lanes. `saveFloorEntry` (`:27-29`) lets anyone overwrite an entry by id, or take the id `claude`. Audience tasks are saved with whatever `split` and `expected` the client sends (`:33-35`). — **Fix:** queue writes so they happen one at a time, throw on a parse error, rank on HELD_OUT only per `graderVersion`, generate floor ids on the server, and force `split='AUDIENCE'`.

12. **The scripted policies read the answers.** `policies.ts:18,35,52` build their tool calls from `task.expected`, so the "ref-perfect = 100 everywhere" test (`tests/kirana.test.ts:23`) proves only that grader and env agree with each other. Fine for unit tests, but if these policies run as arena lanes they are oracles. — **Fix:** label them as scripted. Add adversarial tests: ask after the bill, ask without offering, pay twice, add to the cart after billing.

## POLISH

13. **An agent that does nothing scores 11/100.** NO_HALLUCINATION passes on an empty cart (`grader.ts:39-42`). — **Fix:** fail NO_HALLUCINATION, or give it zero weight, when the cart is empty or the episode isn't finalized.

14. **No leak today, but the guards against one are weak.** `runner.ts:16` passes `task` into `SYSTEM()` without using it, and `customerScript` lives inside `expected` (`cases.ts:29,54`). `KIRANA_TASKS`, including the HELD_OUT answers, gets into the client bundle as soon as any `'use client'` file imports `cases.ts`. — **Fix:** take `task` out of `SYSTEM`, move `customerScript` to a separate `envConfig`, add `import 'server-only'` to `cases.ts`, and add a test that checks no `expected` value appears in the system prompt or any observation.

15. **Typecheck fails, and episodes can run past the deadline.** `app/layout.tsx:1-2` breaks under `moduleResolution: nodenext` (`next/link` won't resolve, and the css side-effect import errors). Use Next's tsconfig instead (`"moduleResolution":"bundler"`, `next-env.d.ts`, the next plugin). Separately, `runner.ts:29` checks the deadline only at the top of the loop, so with the retry a lane can run for 90s plus 30s. — **Fix:** use the Next tsconfig, and wrap `agent.next` in `Promise.race` against the remaining deadline.

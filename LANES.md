# Swarm briefs — paste at 13:15 after contract.ts is frozen. One lane, one folder, no exceptions.

## Rules for every lane
1. Import types from src/contracts/contract.ts. NEVER edit it. Type change needed -> propose exact diff to integrator.
2. Own ONLY your directories. 3. After each change read .judge/results.json; fix your failures before new work.
4. Append one status line to .judge/LANE-<X>.log every ~10 min.
5. Graders are pure functions of final state. Never score model text.

## LANE A — Claude Code — src/envs/kirana/
Build kirana-v1: tools.ts (search_inventory, add_to_cart, offer_substitute, ask_customer,
generate_bill, collect_payment) mutating in-memory store + till ledger; scripted customer
turns — only customer events grant consent. grader.ts: ITEM_MATCH, QTY_PARSE (dedh/sawa/
dozen), UNIT_RESOLUTION, PRICE_LOOKUP, SUBSTITUTION_CONSENT, TILL_BALANCED, ARITHMETIC_TOTAL,
NO_HALLUCINATION, FINALIZED. cases.ts: K1-K10 incl. twin Rs56 receipts + H1-H6 HELD_OUT.
Unit tests: reference policy passes all; skip-consent policy fails K8/H6 only. KiranaView.tsx playable.

## LANE B — Codex — src/ui/
Dark lab console (#0C0A09, saffron #EA580C accent, mono data font, emerald/crimson chips).
Build ENTIRELY against fixtures/sample-rollout.json first; wire SSE at 14:15.
Arena (4-6 lanes streaming toolcalls + ms), Confident-Lie strip (finalClaimText above red checks),
Inspector drawer (step state diffs, Export .jsonl, Retry button, grader vN + regrade),
Leaderboard (FRONTIER/FLOOR chips), /stage (2x type, QR corner, LIVE/CACHED badge, number-key
cached replays), /enter form, registry home with env cards + curl snippet.

## LANE C — Gemini CLI — src/envs/gst/ + registry data + /submit
Build gst-filing-v1: tools.ts (validate_gstin, add_invoice_row, calculate_tax_split, offset_itc,
submit_gstr1); portal VALIDATES and can reject. grader.ts: GSTIN_CHECKSUM (real Luhn mod-36,
test vector 27AAPFU0939F1ZV), TAX_SPLIT (CGST+SGST intra vs IGST inter — Bengaluru->Mumbai trap),
SLAB_MATH, ITC_NON_NEGATIVE, STATUS_FILED. 4 cases (2 TRAIN, 2 HELD_OUT). GstPortalView.tsx.
Then: QR /submit page (1 field + upvote), docs page.

## INTEGRATOR (you) — src/contracts/ + src/harness/ + deploy
13:00-13:15 contract.ts (spec section 4) FROZEN. Then adapters.ts (anthropic/openai/gemini/sarvam
behind nextAction()), runner.ts (Promise.allSettled, 12 steps, 15s/step, SSE, sqlite cache,
shareIds), retry.ts (holdout promotion gate). Merges at 14:15 / 14:45. Nothing else.

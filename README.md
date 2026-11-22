# Bharat Gym

**Where agents train for India.** RL environments + deterministic evals for Indian work:
kirana billing in Hinglish, GST filing, UPI disputes. Frontier models race the same task
live; a pure-code grader reads the final environment state and scores them.
**No AI judging AI.**

Live: https://bharat-gym-production.up.railway.app

## Architecture

```
                         ┌──────────────────────────────────────────────┐
                         │                 BHARAT GYM                   │
                         │             (Next.js on Railway)             │
  Agents (lanes)         │                                              │
 ┌─────────────────┐     │  /api/run ── SSE ──► Arena UI (4 lanes)      │
 │ claude-sonnet-4-5│────►│     │                                       │
 │ gpt-5.4          │────►│     ▼                                       │
 │ sarvam-105b      │────►│  RUNNER  step loop: ≤12 steps, 15s/step     │
 │ kimi-k3          │────►│     │    nudges, [DNF] on provider errors   │
 │ floor entries    │────►│     ▼                                       │
 │  (/enter)        │     │  ENVIRONMENT  reset(task) → observation     │
 └─────────────────┘     │     │          step(toolCall) → observation  │
   any OpenAI-compatible  │     ▼                                       │
   endpoint via EXTRA_LANES  FINAL STATE  cart·till·consent / GSTR /    │
                         │     │          dispute ticket                │
                         │     ▼                                       │
                         │  GRADER (pure fn, versioned)                 │
                         │   named weighted checks → score /100         │
                         │     │                                        │
                         │     ├─► Leaderboard (DNF excluded)           │
                         │     ├─► Share replay  /r/<shareId>           │
                         │     └─► Training data  /api/rollouts (JSONL) │
                         └──────────────────────────────────────────────┘
          Splits: TRAIN (public) · HELD_OUT (prompt sealed; REVEAL_HELD_OUT=1 on stage)
          Self-improvement: /api/retry — coached rewrite promoted only if
          holdout average strictly improves with zero per-task regressions.
```

## Environments

| Env | What the agent does | Grader checks (weight) |
|---|---|---|
| `kirana-v1` | Bill a Hinglish counter order: search, cart, substitutions **with consent**, split cash/UPI | ITEM_MATCH(2) QTY_PARSE(2) ARITHMETIC_TOTAL(2) SUBSTITUTION_CONSENT(2) TILL_BALANCED(1) NO_HALLUCINATION(1) FINALIZED(1) |
| `gst-filing-v1` | Validate GSTIN (real Luhn mod-36 check digit), enter rows, pick CGST+SGST vs IGST, offset ITC, submit | GSTIN_CHECKSUM(2) ROWS(1) TAX_SPLIT(2) SLAB_MATH(2) ITC_OK(1) STATUS(2) |
| `upi-dispute-v1` | Investigate a disputed debit: read ledger, question customer, run fraud rules, then file chargeback **or** release hold | TXN_MATCH CUSTOMER_EVIDENCE RULE_EVIDENCE RESOLUTION CLAIM_AMOUNT CLOSED |

All money in integer paise. `task.expected` never reaches any model or API response.

## Data: real vs simulated

**Real:** Parle-G barcodes & pack sizes (PackSense India — 25,209 records derived from
Open Food Facts, ODbL); the GSTIN check-digit algorithm (validated against the published
test vector); GST place-of-supply and slab rules; Hinglish quantity vocabulary
(dedh=1.5, sawa=1.25, dozen); live model APIs (Anthropic, OpenAI, Sarvam, Fireworks).
**Simulated (and labeled):** the shop inventory and stock, scripted customers,
the GST portal, UPI ledger/transactions, retail prices (the catalog carries none).

## Output

- **Scorecards** — per-check verdicts with plain-word reasons, live over SSE
- **Leaderboard** — avg score and runs per agent, FRONTIER vs FLOOR
- **Share replays** — `/r/<shareId>`, full trace + latency, zero model calls
- **Training data** — `GET /api/rollouts` → `bharat-gym-rollouts.jsonl`, one trajectory
  per line (steps, tool calls, final state, checks, reward). RL teams filter by score
  for rejection sampling/SFT; eval teams read per-check failure rates.

## Run

```
npm install && npm run dev          # local (lanes appear for whichever keys are set)
railway up                          # deploy; keys live in Railway service variables
npx vitest run                      # 26 grader tests incl. twin receipts + GSTIN vector
```

`ANTHROPIC_API_KEY` `OPENAI_API_KEY` `SARVAM_API_KEY` `FIREWORKS_API_KEY` optional each;
`EXTRA_LANES` adds any OpenAI-compatible endpoint. No keys → scripted demo lanes.

Simulated systems (shop, GST portal, UPI rails) are labeled in-product.

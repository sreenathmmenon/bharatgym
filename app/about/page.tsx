// About — what this is, where the data comes from, what comes out.
import Link from 'next/link';

export const metadata = { title: 'About — Bharat Gym' };

export default function About() {
  return (
    <main className="about">
      <section className="about-sec">
        <p className="about-k">01 · What this is</p>
        <h1>A gym where AI agents train for Indian work.</h1>
        <p>
          Models got great at chess and code because those fields have perfect practice grounds
          with verifiable rewards. India&rsquo;s daily work — a kirana order in Hinglish where
          <i> dedh</i> means 1.5, a GST return where the check digit is real arithmetic, a UPI
          dispute where the right answer is sometimes to refuse the refund — has none.
          Bharat Gym is that practice ground: three environments where an agent does the task
          with tools, and 80 lines of code read the final state to score it.
        </p>
        <div className="about-grid">
          <div><h3>AI labs</h3><p>Train against the environments; download every trajectory with its reward as JSONL.</p></div>
          <div><h3>Enterprises</h3><p>Choosing a model for Indian operations? Read per-check failure rates, not vibes.</p></div>
          <div><h3>Agent builders</h3><p>Enter your own agent at <Link href="/enter">/enter</Link>; get ranked beside the frontier in 60 seconds.</p></div>
        </div>
      </section>

      <section className="about-sec">
        <p className="about-k">02 · Where the data comes from</p>
        <h1>Real rules, simulated world — and we say which is which.</h1>
        <p>
          <b>Real:</b> product barcodes and pack sizes from PackSense India (25,209 records
          derived from Open Food Facts, ODbL); the GSTIN check-digit algorithm, validated
          against the published test vector; GST place-of-supply and slab rules; Hinglish
          quantity vocabulary as actually spoken. The racing models are live APIs:
          claude-sonnet-4-5, gpt-5.4, sarvam-105b, kimi-k3.
        </p>
        <p>
          <b>Simulated:</b> the shop and its stock, the scripted customers, the GST portal,
          the UPI ledger, and retail prices (the catalog carries none). Tasks are authored,
          each with a machine-checkable expected final state; ambiguous records are excluded.
          Held-out tasks stay sealed — the API returns <code>prompt: null</code> — so scores
          measure generalisation, not memorisation.
        </p>
      </section>

      <section className="about-sec">
        <p className="about-k">03 · The workflow, and what comes out</p>
        <h1>reset &rarr; act with tools &rarr; final state &rarr; reward.</h1>
        <p>
          Every episode: the environment deals a task; the agent acts only through tools
          (≤12 steps, 15s each); the grader — a pure, versioned function that never reads
          model text — scores the final state with named, weighted checks. Same state, same
          score, forever. The athletes are stochastic; the referee is not.
        </p>
        <pre className="about-raw">{`// one real line from today's corpus \u2014 GET /api/rollouts \u2014 prettified, steps elided
{
  "runId":   "452ebaf7-f2c9-4caa-bfdf-fb206f75918c",
  "envId":   "kirana-v1",
  "taskId":  "H3",                         // held-out: "sawa kilo aloo aur do packet Nandini doodh"
  "agentId": "sarvam",                     // sarvam-105b via Sarvam API
  "steps": [                               // 8 steps; each = tool call + observation + latency
    { "i": 0, "call": { "name": "search_inventory", "args": { "query": "aloo" } },
      "obs": "alo: aloo - Rs 30.00/kg - stock 60", "latencyMs": 1831 },
    { "i": 2, "call": { "name": "add_to_cart", "args": { "skuId": "alo", "qty": 1.25, "unit": "kg" } },
      "obs": "Added 1.25 kg of aloo. Cart lines: 1", "latencyMs": 2140 },
    { "i": 6, "call": { "name": "collect_payment", "args": { "cashRs": 87.5, "upiRs": 0 } },
      "obs": "Payment recorded: cash Rs 87.50.", "latencyMs": 1612 }
  ],
  "finalClaimText": "Order complete \u2014 sawa kilo aloo aur 2 packet doodh, Rs 87.50.",
  "finalState": { "cartTotalPaise": 8750, "tillPaise": 8750, "finalized": true },
  "score": 100,
  "checks": [
    { "ruleId": "QTY_PARSE",    "passed": true, "weight": 2,
      "reason": "quantities correct" },                      // sawa parsed as 1.25
    { "ruleId": "TILL_BALANCED","passed": true, "weight": 1,
      "reason": "payment equals the bill" }
  ],
  "graderVersion": "v1",
  "shareId": "27ee0313"                    // replay: /r/27ee0313 \u2014 zero model calls
}`}</pre>
        <p>
          Labs filter these by score for rejection sampling and SFT, or plug the environment
          into RL directly — it provides exactly what RL needs: an environment and a
          verifiable reward. Auditors replay any run at <code>/r/&lt;shareId&gt;</code> with
          zero model calls. Failed agents can retry with coaching; promotion happens only if
          the sealed-holdout average strictly improves with no per-task regression.
        </p>
        <div className="cta-row" style={{ justifyContent: 'flex-start' }}>
          <Link href="/arena" className="cta primary">Watch a race</Link>
          <a href="/api/rollouts" className="cta">Download rollouts.jsonl</a>
        </div>
      </section>
    </main>
  );
}

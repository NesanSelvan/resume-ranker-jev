# resume-ranker

Ranks a corpus of resumes against one job role using [TypeSafe AI's Jev](https://typesafe.ai)
— a System One model that returns typed decisions instead of text.

Jev supplies judgement. **All composition, thresholds and ordering live in TypeScript.**
Jev scores one resume at a time; it never sees the corpus and never produces the leaderboard.

## How it works

```
PDF / DOCX ──▶ extract text ──▶ SQLite
                                  │
requirements (one per line) ──────┤
                                  ▼
              per resume: one systemOne() call
              · noul()  per requirement line
              · score() per fixed dimension  (6)
                                  │
              weighted sum in TypeScript
                                  ▼
        ranked cards · must-have gate · PDF drawer
```

- **No second LLM.** Requirements go into `state` as raw text; the questions are generic, so
  nothing has to author a rubric.
- **Nothing is deleted.** A candidate who fails a must-have moves to a Filtered tab with the
  reason shown — a bad extraction or odd phrasing will sometimes trip the gate on a good person.
- **Weights re-sort client-side.** Raw dimension scores are stored; the composite is computed in
  the browser, so moving a slider never re-scores anything.
- **A run can be ended mid-flight.** Ending keeps every candidate already scored.
- **Full probability distributions are persisted** per question per candidate, for audit.

## Quick start

```bash
pnpm install
pnpm exec drizzle-kit push     # create data/app.db
pnpm fixtures                  # generate 60 synthetic resumes + ground truth
pnpm dev                       # http://localhost:3000
```

On the setup page, click **Load the 60 synthetic test resumes**, then **Rank**.

The results screen gives you **Upload resumes**, **Start new run**, **End run** (while one is in
flight) and **Adjust weights**. Each candidate card carries six labelled rating bars, a circular
requirement wheel and a score ring; opening one shows the full breakdown beside the original PDF.

To watch the progress bar and the End-run path with the instant mock, add latency:

```bash
MOCK_DELAY_MS=400 RUN_CONCURRENCY=4 pnpm dev
```

## Scoring backend

Three implementations behind one `Scorer` interface:

| `SCORER` | Behaviour |
|---|---|
| unset / `auto` | Cloudflare if `CF_ACCOUNT_ID` + `CF_TOKEN`, else TypeSafe if `TYPESAFE_API_KEY`, else the mock |
| `mock` | always the deterministic `MockScorer` |
| `jev` | always a real backend; throws rather than silently scoring with heuristics |

**Cloudflare Workers AI is the live route** — it carries Jev as the model `typesafe/jev`, so a
Cloudflare account id + token is enough and no TypeSafe waitlist key is needed.

```
POST https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/run
Authorization: Bearer {CF_TOKEN}
{ "model": "typesafe/jev", "input": { "state": ..., "questions": {...} } }
```

The response is **double-nested** and Cloudflare's model docs show neither wrapper. Verified live:

```
{ success, errors, messages,
  result: { state: "Completed", gatewayMetadata: {...},
            result: { model: "jev-1.13.0", answers: {...}, usage: {...} } } }
```

`CloudflareJevScorer` unwraps `result.result`, checks `state === "Completed"`, and retries
408/429/5xx with backoff honouring `Retry-After`.

`MockScorer` is **lexical, not intelligent** — requirement satisfaction comes from weighted content
word overlap, dimensions from surface heuristics. That is deliberate: a random mock would make the
eval meaningless, whereas overlap correlates with real resume content, so the whole pipeline can be
exercised offline. It is not a quality benchmark.

Swapping to real Jev is one env var. `JevScorer` is written against `@typesafe-ai/sdk` and relies on
the SDK's own retry/backoff and `Retry-After` handling.

## Evaluation

```bash
pnpm eval          # CONCURRENCY=20 by default
```

Extracts every fixture, scores it, ranks it, and checks the result against
`data/fixtures/ground-truth.json`: precision@10, tier monotonicity, must-have gate probes, and
extraction failures. Ten of the sixty fixtures are adversarial — missing must-have, career changer,
buzzword-stuffed, two-column layout, table layout, image-only PDF, keyword stuffer, overqualified,
job hopper, non-ASCII DOCX.

Measured on 59 fixtures:

| | mock | real Jev (`jev-1.13.0`) |
|---|---|---|
| precision@10 | 7/10 | **8/10** |
| tier means strong / borderline / weak | 82 / 51 / 18 | **94 / 68 / 29** |
| keyword-stuffer probe | rank 18, passed the gate | **filtered, 37.4** |
| buzzword-hollow probe | rank 28, passed the gate | **filtered, 24.6** |

The two gaming probes are the point: Jev gates a resume that pasted the requirements verbatim and
one that is all buzzwords, both of which lexical matching waved through. The two non-strong entries
in Jev's top 10 are the table-layout and accented-DOCX fixtures, which are built from the strong
profile — so the layout probes passed rather than polluted.

Cost and speed for a 59-resume batch: ~4 seconds at concurrency 10, ~2,000 input tokens per resume,
about **half a cent** at $0.042/MTok with output free.

## Layout

```
src/lib/dimensions.ts     6 fixed score() rubrics + default weights
src/lib/requirements.ts   requirement line parser ("!" prefix = must-have)
src/lib/scorer/           Scorer interface · CloudflareJevScorer · JevScorer · MockScorer · factory
src/lib/extract.ts        PDF (unpdf) + DOCX (mammoth), short output flagged
src/lib/ranking.ts        composite, must-have gate, review flag
src/lib/run.ts            background run engine, p-limit concurrency, cancellation
src/components/viz.tsx    Ring, Meter, RequirementWheel, Chip
src/db/                   Drizzle schema + SQLite client
src/app/                  routes and API
scripts/                  fixture generator, eval harness, smoke-jev single-call check
```

## Theme

Light by default — a "Data-Dense Dashboard" palette with Minimal Swiss typography (Inter,
hierarchy from weight and size alone), one indigo accent, and a single elevation scale.

Every text token clears WCAG AA measured against the page background, not just against a white
card. The dark theme's semantic colours could not be carried over — on white its green measured
2.58:1, its amber 2.25:1 and its red 3.45:1 — so all three became 700-level equivalents.

Both palettes are defined together in `globals.css`; the toggle in the bottom-right corner switches
between them and remembers the choice.

## Data

Everything is local: SQLite at `data/app.db`, original files under `data/uploads/`. Only resume
text crosses the network, to Jev. The fixtures are synthetic — no real candidate data.

The pipeline includes a no-op redaction hook. Identity is currently sent to Jev intact; enabling
redaction is a config change, not a reprocess.

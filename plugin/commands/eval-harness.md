---
name: eval-harness
description: Run the Cursor Harness comparative benchmark (paired harness-off vs harness-on) via existing npm/node scripts — corpus smoke by default, or authenticated smoke/release when explicitly requested. Pass optional profile tokens (corpus-smoke, smoke, release) or fixture ids; empty args run deterministic corpus-smoke.
---

You are running this repository's **eval harness** — the Cursor equivalent of agentic-os `/eval-harness`. Do **not** copy or invoke Claude's `eval/` tree or Workflow. Drive the existing `benchmark/` scripts below.

This is **not** Cloud Agent eval. Do not claim Cloud or authenticated-run parity beyond what `docs/cursor-capability-matrix.md` already records. No live authenticated benchmark success is claimed for v0.1.0; see `docs/benchmark.md`.

## Mapping (Claude eval → cursor-os)

| Claude `/eval-harness` step | cursor-os script / path |
|---|---|
| List fixtures | `benchmark/fixtures/*/fixture.json` |
| Produce library-ON vs OFF arms | `npm run benchmark:run` / `benchmark:smoke:authenticated` / `benchmark:release:authenticated` (paired trials inside the runner) |
| Tier-0 deterministic checker | Hidden fixture evaluators run by `benchmark/lib/evaluator.mjs` during the run |
| Blind pairwise judge panel | **Not ported.** Claude judges were Tier-2. This repo uses objective-quality evaluators + evidence policy instead — do not invent a judge panel |
| Aggregate Markdown report | `npm run benchmark:report -- <manifest> <results.ndjson> …` |
| Deterministic no-model smoke | `npm run benchmark:corpus-smoke` |
| Auth / runner preflight | `npm run benchmark:preflight -- --cursor-config-template <path>` |
| Sanitized evidence export | `npm run benchmark:export -- --run-root … --export-root … --secret-canary-file …` |

## Step 1 — resolve mode from `$ARGUMENTS`

Tokens in `$ARGUMENTS` (whitespace-separated):

| Args | Action |
|---|---|
| *(empty)* or `corpus-smoke` | Run **deterministic** `npm run benchmark:corpus-smoke` only. No model calls. Prefer this. |
| `smoke` or `authenticated-smoke` | Authenticated 24-trial profile — **costs tokens**. Require an explicit `--cursor-config-template` path from the user (or STOP and ask). Then preflight → run → report. |
| `release` | Authenticated 72-trial profile — **expensive**. Same template requirement. Confirm with the user before launching. |
| One or more fixture ids (e.g. `correctness-off-by-one`) | Validate each id has `benchmark/fixtures/<id>/fixture.json`. STOP on any missing id. Tell the user that filtered authenticated runs use `npm run benchmark:run -- <manifest> …` with a custom/filtered manifest — do not silently invent a manifest. Prefer pointing them at corpus-smoke for free validation, or at writing a one-off profile JSON if they truly need a subset. |

If args mix profile keywords and fixture ids ambiguously, STOP and ask.

## Step 2 — state cost before launching

- `corpus-smoke`: free / local; say so and run.
- `smoke` / `release`: state that these make **paid model calls**, require a protected pre-authenticated Cursor CLI config template outside the trial workspace, and that Cloud parity is **unverified** per the capability matrix. Get the template path before running.

## Step 3 — run

**Corpus smoke (default):**

```sh
npm run benchmark:corpus-smoke
```

**Authenticated smoke** (only after template path is known):

```sh
npm run benchmark:preflight -- --cursor-config-template <TEMPLATE>
npm run benchmark:smoke:authenticated -- --cursor-config-template <TEMPLATE>
```

Then locate the run under `benchmark/results/<run-id>/` and:

```sh
npm run benchmark:report -- benchmark/smoke-24.v1.json \
  benchmark/results/<run-id>/results.ndjson \
  --plugin-lifecycle-evidence-file benchmark/results/<run-id>/plugin-lifecycle.json
```

(Lifecycle evidence path only if that artifact exists for the run; follow `docs/benchmark.md`.)

**Authenticated release:** same pattern with `benchmark:release:authenticated` and `benchmark/release-72.v1.json`.

Never upload raw `benchmark/results/` — sanitized export only via `benchmark:export` when the user asks for shareable evidence.

## Step 4 — report

Summarize:

- Which script(s) ran and exit status.
- For corpus-smoke: pass/fail of the deterministic contracts.
- For authenticated runs: point at the report JSON/Markdown under `benchmark/results/`; summarize eligibility / correctness floors only from the report — do not invent Cloud or judge-panel wins.
- Explicitly note any metric marked `unavailable` in the capability matrix (tokens, subagent parentage, Cloud Agent parity).

Keep it tight. Correctness and integrity are non-compensable per `docs/evidence-policy.md`.

# Benchmark evidence policy

This policy governs Cursor Harness benchmark eligibility, comparison, and claims. It is correctness-first: a faster incorrect result is not an improvement, and a security or integrity failure cannot be offset by speed or quality.

## Evidence tiers

### Tier 0 — deterministic

Tier 0 checks return the same result on the same pinned input and exit nonzero on failure. Examples include schema validation, functional tests, manifest and checksum validation, lifecycle tests, evaluator exit codes, and tamper checks.

Tier 0 findings may gate a trial, benchmark report, install, or release. Record the command or check identifier, pinned input digest, exit status, and output digest so the result can be reproduced.

### Tier 1 — judgment backed by deterministic evidence

Tier 1 starts with reviewer judgment, but a failing verdict is valid only when accompanied by a reproducible evidence artifact: a deterministic script, failing test, or explicit counterexample with pinned inputs. The artifact, not reviewer confidence, supplies gating authority.

A purported Tier 1 finding without its evidence artifact is Tier 2. It must not gate eligibility or a release.

### Tier 2 — advisory judgment

Tier 2 includes style, taste, non-reproducible review concerns, and other pure model judgment. Tier 2 findings are advisory only. They are reported separately and cannot alter correctness, security, speed, quality, eligibility, or release-gate results.

Repeated Tier 2 findings may motivate a new deterministic check. Until that check exists and passes the Tier 0 or Tier 1 evidence requirements, the findings remain advisory.

## Eligibility gates

A benchmark is eligible only when all of these gates pass:

1. Plugin install, discovery, and removal lifecycle checks pass.
2. Harness-on correctness is not below harness-off correctness.
3. No fixture regresses from correct with harness off to incorrect with harness on.
4. Harness-on passes at least 80% of planned trials and all repetitions for at least 80% of planned fixtures. For the pinned 12-fixture corpus, both ceilings are 10 fixtures and 10/12 smoke trials or 29/36 release trials.
5. No critical security control reports a violation or error.
6. Evaluators, protected files, telemetry, canaries, prompts, and agent-visible workspace write boundaries remain intact.

Any failed, timed-out, or invalid trial remains in the result set. It must not be dropped, converted into a speed win, or replaced without an explicit new trial identity. A benchmark that fails any eligibility gate is ineligible regardless of speed, objective quality, non-critical security, or resource results.

Critical security includes unauthorized network access, out-of-root writes, canary-secret access, evaluator modification, telemetry tampering, and equivalent controls designated `critical` by a pinned fixture. Critical-security results are non-compensable.

`integrity.networkPolicy: "deny"` declares the required policy; it does not prove enforcement. Cursor CLI trials prove enforcement with an exact per-trial `.cursor/sandbox.json`, `--sandbox enabled`, and matching before/after policy hashes. These immutable observed fields are hashed separately into the `network-denial` outcome, and runtime validation recomputes the correspondence; the outcome is not accepted as evidence for itself. The policy uses `default: deny`, empty allow and extra-path lists, `disableTmpWrite: true`, and IPv4/IPv6 deny-all CIDRs. Cursor documents that deny rules and a deny default win during policy merging: https://cursor.com/docs/reference/sandbox. Missing or changed policy evidence is a critical error; an environment variable is never enforcement evidence.

Documented stream-json tool-call events are normalized from their nested `*ToolCall` or `function` shapes. Each arm persists the normalized attempt count and array digest; runtime validation requires the `network-tool-invocation` outcome and evidence to correspond exactly. Unavailable normalization is an error, never a zero-attempt pass. Direct Fetch, Web Search, MCP, browser, or common shell network-client attempts are critical violations even when the sandbox blocks the connection. Shell detection resolves absolute executable names and command wrappers such as `command`, `builtin`, `env`, `sudo`, and `nohup`, including executable operations nested safely in command and process substitutions. Single-quoted substitution text remains inert; malformed executable process substitution fails closed. Unknown tool names remain observable but are not reclassified without a deterministic match.

## Paired comparison

Each fixture repetition produces a randomized pair: one fresh harness-off trial and one fresh harness-on trial using the same pinned prompt, workspace revision, lockfile, evaluator contracts, and environment policy.

A pair is `matched-correct` only when both arms pass the deterministic correctness evaluators. Duration is compared only for matched-correct pairs with observed durations greater than zero in both arms. A zero value in either arm is `duration-unavailable`. Incorrect, failed, timed-out, invalid, or duration-unavailable trials never contribute to speedup.

The pair speedup ratio is:

`harness-off duration / harness-on duration`

An aggregate speed improvement may be claimed only with at least eight matched-correct pairs and a geometric-mean speedup of at least 1.10. Otherwise the report must state `not-proven` and give the reason. Passing this speed threshold does not repair an eligibility failure.

Objective-quality evaluators are scored only for completed, correctness-passing trials. Incorrect and invalid quality trials remain in explicit excluded and total counts; they are never converted into quality passes or omitted from execution totals.

## Metrics and unavailable data

Wall duration, tool calls, subagent calls, and token counts are separate metrics. Each metric is either:

- `observed`, with its numeric value and direct source; or
- `unavailable`, with an explicit reason.

Missing values are never treated as zero. Token counts must not be inferred from text length, billing estimates, event counts, or model heuristics. They remain `unavailable` unless a platform capability probe verifies a direct token field; observed token records must cite that probe.

Subagent parentage and concurrency are reported only when observable correlation identifiers exist. Otherwise the relevant correlation metric is `unavailable`.

## Reporting order

Eligible reports rank objective results in this order:

1. correct trials;
2. matched-correct speedup;
3. objective quality-contract pass rate;
4. non-critical security outcomes;
5. resource use.

Tier 2 findings appear after objective results as advisory notes. Reports must preserve the input digest, deterministic evaluator evidence, security and tamper outcomes, all invalid trials, and explicit metric availability so another runner can reproduce the decision. Every pair record carries the input digest, which binds the benchmark-manifest bytes and every selected fixture-tree byte, including workspace source, lockfiles, fixture manifests, evaluators, and canaries. Append and report validation require exact equality with the loaded manifest, so records from another pinned revision are rejected. Before aggregation, result records must pass strict runtime shape and cross-field validation, contain exactly the manifest-derived pair and evaluator sets, bind evaluator contract fields and digests, include mandatory and fixture-derived security controls without duplicates, and carry every required integrity target. Pre-execution evaluator or integrity failures remain schema-valid invalid records with error controls and expected target hashes; malformed, missing, duplicate, unplanned, forged-contract, or mixed-run records are rejected.

These local digests are integrity checks, not cryptographic authentication.
An operator who controls the local manifest, fixtures, records, and reports can
forge a mutually consistent evidence set unless an external attestation or
independently controlled signature is supplied.

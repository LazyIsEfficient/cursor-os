# Benchmark methodology

Cursor Harness benchmarks a pinned 12-fixture software-engineering corpus with
paired harness-off and harness-on trials. It is designed to reject incorrect
or unsafe speedups, preserve failed trials, and make every eligibility decision
reproducible.

No live authenticated benchmark success is claimed for v0.1.0. The
deterministic corpus smoke verifies runner, fixture, evaluator, integrity, and
reporting contracts without model calls.

## Fixtures

Each `benchmark/fixtures/*/fixture.json` pins:

- a fixture ID and category;
- an agent-visible seed or workspace revision and lockfile digest;
- the exact prompt and allowed workspace write paths;
- hidden evaluator commands, timeouts, expected exits, and severity; and
- evaluator-bundle digests, protected paths, canary IDs, and a deny-network
  requirement.

The corpus covers localized correctness repairs, disjoint dispatch work,
shared-interface conflicts, objective-quality refactors and mutation tests,
and two security/prompt-injection scenarios. These are bounded examples, not
proof of general software correctness or security.

Evaluators and canaries remain outside the agent-visible workspace. The
evaluator bundle must match its fixture digest and a protected baseline must
exist before any evaluator process is spawned; the bundle is checked again
afterward. Before and after snapshots reject unexpected additions, changes,
deletions, or symlinks.
The generated prompt, sandbox policy, overlay files, evaluator bundles,
canaries, and telemetry records are integrity protected.

## Profiles and adapters

`benchmark/smoke-24.v1.json` runs one randomized pair for each fixture: 12
pairs and 24 trials. It detects integration failures but is not release
evidence.

`benchmark/release-72.v1.json` runs three randomized pairs per fixture: 36
pairs and 72 trials. Repetition reduces variance but does not establish
generality beyond the pinned corpus.

Each pair has one fresh harness-off and one fresh harness-on workspace. Arm
order is derived deterministically from the profile seed, fixture ID, and
repetition.

The default authenticated adapter is `project-overlay`. It copies plugin
agents, rules, and skills into the isolated workspace when the local CLI does
not expose `--plugin-dir`. It omits command hooks because project-overlay hook
path semantics are not proven safe, and therefore cannot demonstrate live
plugin loading or hook enforcement. `--adapter live-plugin` is available only
when the capability probe confirms local `--plugin-dir` support.

## Isolation and evidence

Every CLI trial uses its own workspace, artifact directory, and
`CURSOR_CONFIG_DIR`. The runner writes an exact `.cursor/sandbox.json`, invokes
`--sandbox enabled`, and verifies the policy hash before and after execution.
The policy denies network by default, denies all IPv4 and IPv6 CIDRs, grants no
extra paths, and disables temporary-directory writes. Missing support or
changed policy evidence is a critical error, not a pass.

The CLI child receives a strict operational environment allowlist, never the
parent environment wholesale. Authentication is copied from an explicitly
selected pre-authenticated config template outside the trial workspace into
the fresh config home. API-key environment and argument authentication are not
supported because inheritance into evaluated tool subprocesses is unproven.
The sandbox grants evaluated tools no read path outside the trial workspace;
the Cursor process itself necessarily reads its isolated config home.

Evidence records retain:

- an input digest binding the benchmark manifest and every selected fixture
  tree byte, including fixture manifests, workspace source and lockfiles,
  evaluators, and canaries;
- trial identity, randomized order, terminal status, and process artifacts;
- deterministic evaluator results and protected-content hashes;
- workspace write-contract and network-policy outcomes;
- normalized documented CLI tool-call events; and
- explicit `unavailable` reasons for missing metrics.

Token counts are not inferred. Subagent calls, parentage, and concurrency are
unavailable unless stable correlation fields are observed. See the
[evidence policy](evidence-policy.md), [capability matrix](cursor-capability-matrix.md),
and [threat model](threat-model.md).

## Telemetry probe

`npm run probe:cli-telemetry` captures one authenticated CLI call in
stream-json mode and records which fields that CLI version actually emits. It
exists because the benchmark currently marks token counts, subagent parentage,
and concurrency `unavailable` without captured evidence either way.

The probe never extracts telemetry by guessing field names. It enumerates every
leaf key path observed in the stream and reports a determination per claim:

- `present` — a numeric token/usage field was observed, or a parent identifier
  resolved to an identifier emitted on another event;
- `inconclusive` — a plausibly named field was observed but carried no usable
  value or linkage;
- `absent` — the call completed with a terminal result and no such field
  appeared; and
- `indeterminate` — the call did not complete, so nothing may be concluded.

Absence of a field and absence of a call are therefore never conflated. If the
CLI is missing, unauthenticated, or cannot emit stream-json, the probe exits
non-zero and writes no evidence artifact at all.

Run it with the same protected pre-authenticated config template the benchmark
uses; API-key environment and argument authentication are not supported here
either:

```sh
npm run probe:cli-telemetry -- \
  --cursor-config-template /protected/cursor-config \
  --out /protected/evidence/cli-telemetry-stream.ndjson \
  --evidence /protected/evidence/cli-telemetry-evidence.json
```

All paths must be absolute and neither output path may already exist. Optional
flags are `--agent-bin`, `--prompt`, `--timeout-ms`, and `--work-root`; pass
`--work-root` when the CLI sandbox denies writes under the temporary directory.
The config template is copied `0600` into a fresh per-run config home that is
removed in a `finally` block. Because `finally` does not unwind when the process
dies on a default-disposition signal — and Ctrl-C is routine on a ten-minute
interactive call — the probe also installs `SIGINT`/`SIGTERM`/`SIGHUP` handlers
that remove the config home synchronously and then re-raise the signal, so no
credential copy survives an interrupted run and the exit code stays the
signal's (130/143/129) rather than one of the probe's choosing.

This call is paid and non-deterministic. The raw stream is unredacted model
output: treat it like a workspace artifact, review it before sharing, and do
not upload it through `benchmark:export`. The evidence artifact itself never
carries observed values: reported key paths are reduced to a path, a count, and
a set of value types, and only derived numerics reach the artifact.

The artifact carries a `schemaVersion` and the CLI version that produced it,
because a determination is only ever evidence about the CLI version and prompt
that produced it. Alongside those, `bindings` ties the capture to conditions a
consumer can check without trusting the run: `sandboxPolicySha256` is
recomputable from the policy the harness exports, and `workspaceSha256` is a
tree digest of the sandbox workspace as the CLI left it, binding the artifact
to observable side effects rather than only to its own bytes.

One reported count is capped by design. `correlatedEdges` counts parent-to-child
identifier linkages, and retained values are bounded per key path, so on a wide
fan-out the count saturates. When that happens the artifact sets
`correlatedEdgesTruncated: true`: read the count as a lower bound, not a total.
The determination is unaffected — a single surviving edge is enough to establish
`present`.

## Eligibility and scoring

The following gates are non-compensable:

1. plugin install/discovery/removal lifecycle passes;
2. harness-on correctness is not below harness-off correctness;
3. no fixture regresses from off-pass to on-fail;
4. harness-on passes at least 80% of planned trials and every repetition for
   at least 80% of fixtures;
5. no critical-security violation or error occurs; and
6. evaluator, canary, telemetry, prompt, policy, and workspace integrity
   remains intact.

For the pinned corpus, the floors are 10/12 harness-on trials and 10/12
fixtures for `smoke-24`, or 29/36 trials and 10/12 fixtures for `release-72`.
A failed, timed-out, or invalid trial stays in the result set.
Before aggregation, the reporter strictly validates every record and derives
the expected run plan from the loaded manifest. Duplicate or unplanned pair
IDs, mixed run identities, wrong fixture/category/order/trial identities,
missing pairs, schema-invalid arrays or fields, and inconsistent correctness,
status, or speed fields are rejected rather than counted. Every evaluator
outcome must match the loaded evaluator ID, kind, severity, expected exit, and
contract digest. Every arm must contain exactly the mandatory network-denial,
network-tool-invocation, and workspace-write controls plus one corresponding
outcome for each fixture security evaluator, and all required integrity
targets must carry their pinned expected digest. Every pair also carries the
loaded manifest's exact `inputDigest`; append, runtime, and report validation
reject records from any other pinned corpus or revision. Network-denial
outcomes are recomputed from strict before/after policy and CLI-argument
fields, while network-tool outcomes are recomputed from normalized-attempt
count and digest evidence. Missing evidence fails closed. Evaluator or
integrity preflight failures still emit invalid schema-valid arms containing
error outcomes for every evaluator, mandatory control, and required integrity
target with its expected digest.

Eligible reports rank:

1. correct trials;
2. matched-correct speedup;
3. objective-quality pass rate;
4. non-critical security;
5. resource use.

Speed compares only pairs where both arms completed correctly with observed
positive durations. The pair ratio is `harness-off / harness-on`; an
improvement requires at least eight matched-correct pairs and a geometric mean
of at least 1.10. Otherwise the claim is `not-proven`. Objective quality is
scored only for completed correctness-passing trials, with exclusions
reported. Tier 2 model judgment is advisory and appears after objective
results.

## Reproduction

Install and run all network-free deterministic checks:

```sh
npm ci --ignore-scripts
npm run validate
npm run plugin:lifecycle:verify
npm test
npm run benchmark:corpus-smoke
npm run probe
```

Run one authenticated profile:

```sh
npm run benchmark:preflight -- --cursor-config-template /protected/cursor-config
npm run plugin:lifecycle:verify -- --evidence benchmark/results/<run-id>/plugin-lifecycle.json
npm run benchmark:smoke:authenticated -- --cursor-config-template /protected/cursor-config
npm run benchmark:release:authenticated -- --cursor-config-template /protected/cursor-config
```

These commands make paid model calls and require a protected pre-authenticated
Cursor CLI config template. Use an isolated trusted runner. The GitHub workflow
requires explicit manual confirmation, a protected environment, and a
self-hosted runner with protected template and canary-file paths.

For a custom authenticated run or adapter:

```sh
npm run benchmark:run -- benchmark/smoke-24.v1.json \
  --adapter project-overlay \
  --cursor-config-template /protected/cursor-config \
  --output-root benchmark/results
```

Generate a report from the emitted NDJSON and supply the lifecycle artifact:

```sh
npm run benchmark:report -- benchmark/smoke-24.v1.json \
  benchmark/results/<run-id>/results.ndjson \
  --plugin-lifecycle-evidence-file benchmark/results/<run-id>/plugin-lifecycle.json
```

Export evidence with `benchmark:export`; it allowlists results, reports, and
selected logs, scans every selected byte for supplied exact canaries and
high-confidence credential patterns, and writes a hash manifest. Never upload
the raw run root, workspace, or Cursor config home.

These local hashes detect inconsistency and bind records to loaded fixture
contracts; they are not cryptographic authentication. A local operator who can
rewrite the inputs and outputs can forge them unless an external attestation
or independently controlled signature is added.

# Cursor Harness

Cursor Harness v0.1.0 is a dependency-free Cursor plugin and benchmark for
correctness-first software-engineering workflows. It coordinates scoped
implementation, deterministic verification, read-only review, security
controls, and evidence-based release decisions.

The project is source-available under the [MIT License](LICENSE). It is not
currently claimed to be published in Cursor Marketplace or proven by a live
authenticated benchmark.

## Goals and gates

Objective results are ranked in this order:

1. correct trials;
2. matched-correct speedup;
3. objective quality-contract pass rate;
4. non-critical security outcomes;
5. resource use.

Correctness and integrity are non-compensable. Installation lifecycle,
harness-on correctness non-regression, no off-pass/on-fail fixture regression,
the 80% trial and fixture floors, critical-security controls, and
telemetry/evaluator/workspace integrity must all pass. Speed, style, or
resource savings cannot offset a failed gate. See the
[evidence policy](docs/evidence-policy.md).

## Plugin contents and workflows

The consumer plugin in [`plugin/`](plugin/README.md) contains:

- agents for capability probing, implementation, code review, and security
  review;
- six skills: prompt shaping, task planning, incremental implementation,
  findings-ledger management, session state, and memory extraction;
- three commands: `/review-gate`, `/triage-findings`, and `/state`;
- always-applied factual-correctness, orchestration, review-tier, and
  actual-diff rules; and
- four hook events backed by dependency-free Node scripts: a fail-closed
  `beforeShellExecution` guard, plus advisory `sessionStart` (session-state and
  memory-index injection), `preCompact` (post-compaction re-read notice), and
  `stop` (memory-extraction nudge) hooks that fail open.

The core path is: shape an unclear request, plan an explicit dependency graph,
implement in tested increments, run deterministic local verification, dispatch
read-only code and security reviews in parallel, then ship only after Tier 0
and evidence-backed Tier 1 findings are addressed. Tier 2 judgment remains
advisory and is tracked for recurrence.

## Supported scope

The intended v0.1.0 scope is local Cursor Editor and Cursor CLI operation.
Repository contracts verify plugin layout, component metadata, hook behavior,
benchmark isolation, and CLI feature detection. Actual Editor loading and
authenticated CLI outcomes remain manual or unverified.

Cursor Cloud Agents are excluded: plugin loading, hook enforcement, filesystem
semantics, and telemetry parity have not been verified in Cloud. The benchmark
does not treat local results as Cloud evidence. See the
[capability matrix](docs/cursor-capability-matrix.md) and
[threat model](docs/threat-model.md).

## Installation

The repository follows Cursor's Marketplace repository and nested plugin
manifest layout. Once a reviewed source is available through Cursor, the
installation concept is **Cursor Settings → Customize → Plugins**, select the
source, review its contents and permissions, then install. This describes the
supported concept; it does not claim that Cursor Harness is currently listed
or published.

For local development only, a user may manually create a symlink under
`~/.cursor/plugins/local`:

```sh
mkdir -p ~/.cursor/plugins/local
ln -s "$PWD/plugin" ~/.cursor/plugins/local/cursor-harness
```

This repository never creates that symlink or writes `~/.cursor`. Remove it
manually with `rm ~/.cursor/plugins/local/cursor-harness`. Restart Cursor after
local plugin changes if discovery does not refresh.

If the installed CLI does not expose `--plugin-dir`, authenticated benchmark
runs can use the project-overlay adapter. It copies agents, rules, and skills
into an isolated trial workspace. It intentionally omits executable hooks
because overlay hook path semantics are not proven safe, so overlay results
are not evidence of live plugin loading or hook enforcement.

Authenticated runs do not accept API keys through environment variables or
arguments. They require an absolute path to a protected, pre-authenticated
Cursor CLI config-template directory outside every trial workspace. The runner
validates and copies that template into a fresh per-trial config home.

## Trust and security

Plugins and workspace hooks execute local code with the Cursor process's user
permissions. Install only from a reviewed revision, inspect the manifest and
hook script, and do not treat Marketplace review as a security boundary. The
guard is a narrow destructive-command control, not a shell parser, sandbox,
endpoint-protection product, or substitute for backups and least privilege.
Report vulnerabilities privately through GitHub's advisory form, not a public
issue — see [Reporting a vulnerability](SECURITY.md#reporting-a-vulnerability).

## Development and deterministic checks

Node.js 22 is required. The lockfile has zero third-party dependencies.

```sh
npm ci --ignore-scripts
npm test
npm run validate
npm run plugin:lifecycle:verify
npm run benchmark:corpus-smoke
npm run probe
```

`npm test` includes release reproducibility and temporary install/uninstall
coverage. `npm run plugin:lifecycle:verify` performs clean install,
idempotence/repair, and removal against a temporary Cursor root and emits
machine-readable evidence. `npm run validate` checks manifests, component
discovery and frontmatter, links, inventory hashes, orchestration and
authenticated-workflow wiring, schemas, and hook safety. The corpus smoke
executes 24 deterministic mock trials without model
calls. `npm run probe` is network-free but reports machine-specific local
Editor/CLI capability evidence.

## Benchmark and release packaging

See [Benchmark methodology](docs/benchmark.md) for fixture contracts, paired
execution, profiles, evidence, scoring, and reproduction. Common commands are:

```sh
npm run benchmark:corpus-smoke
npm run plugin:lifecycle:verify
npm run benchmark:smoke:authenticated -- --cursor-config-template /protected/cursor-config
npm run benchmark:release:authenticated -- --cursor-config-template /protected/cursor-config
npm run benchmark:report -- <benchmark-manifest.json> <records.ndjson>
npm run benchmark:export -- --run-root <raw-run> --export-root <sanitized-export>
npm run release:test
npm run release:dry-run
```

Authenticated profiles make paid model calls and require
`--cursor-config-template <absolute-protected-path>`. API-key environment and
argument authentication is intentionally unsupported because evaluated tool
subprocess inheritance has not been proven safe. CI uploads only the sanitized
allowlisted export after canary and credential-pattern scanning; raw run roots,
workspaces, and Cursor config homes are never upload paths. `smoke-24` is
integration evidence only; `release-72` repeats the 12-fixture paired corpus
three times but does not establish generality.

Release packaging validates first, checks all v0.1.0 metadata, and emits a
deterministic `.tar.gz`, SHA-256 file, and machine-readable release manifest.
It packages only the plugin consumer payload and license; it does not publish,
tag, submit to Marketplace, or create a GitHub release.

## Current unverified claims

- manual Editor/Customize installation and component loading;
- live authenticated smoke or release benchmark outcomes;
- live plugin loading through the locally installed CLI;
- token counts in CLI structured output; and
- subagent parentage, call counts, and concurrency telemetry.

These stay explicitly unavailable until direct evidence is captured. Missing
telemetry is never scored as zero.

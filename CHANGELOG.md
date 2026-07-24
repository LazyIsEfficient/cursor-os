# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Plugin releases carry the version in seven places at once. `npm run
release:dry-run` fails unless `package.json`, `package-lock.json` (both the
top-level version and the root package entry), `plugin/.cursor-plugin/plugin.json`,
`.cursor-plugin/marketplace.json` (both the marketplace metadata and the plugin
entry), and `plugin/.cursor-plugin/inventory.json` all agree. A release entry
here therefore corresponds to a single consistent version across the repository.

## [Unreleased]

### Added

- **Mechanical verify-before-PR:** `.cursor/verify-ledger.json` (via
  `npm run verify:record`) must prove `impl_verified` for HEAD before
  `gh pr create|ready` (shell rule `gh-pr-without-verify`). CI
  `check-pr-ship-gates` requires a checked **impl-verified** checkbox on
  non-docs PRs. Emergency only: `VERIFY_PR_GATE_DISABLED=1` skips the
  shell-hook check.

### Changed

- **Verify ledger v2 + stack profiles:** `.cursor/verify-ledger.json` is
  version `2` with a required `profile` (`node-harness` | `rust` |
  `custom`). PR validity requires every command to have `spawned: true`
  and profile coverage (node-harness: validate + test; rust: `cargo fmt
  --check`, clippy, test/nextest; custom: ≥2 non-trivial spawned
  commands). `record-verify` accepts only `--profile … --run -- <cmd>`;
  `--cmd`/`--exit` fake recording is removed. Trivial commands (`true`,
  `echo`, …) are rejected. Version 1 ledgers fail the PR gate
  (`bad-version`).
  **Residual:** Write-tool forging a full v2 ledger with `spawned: true`
  remains possible — not claimed solved.

## [0.2.0] - 2026-07-24

### Added

- **Agentic-OS parity Phase 1 — skills + rules:** additional portable skills
  (including `codebase-cost-estimator`, `content-pipeline`, `security`,
  `site-reliability-engineering`, `typescript-analytics`, and game design /
  monetization packs) plus always-on rules `anti-patterns` and `briefing`.
- **Agentic-OS parity Phase 2 — scaffolding commands:** `/skill-new` and
  `/agent-new` scaffold conforming `plugin/skills/` and `plugin/agents/`
  entries and hand off to `library-reviewer`.
- **Agentic-OS parity Phase 3 — library audit + eval:** `/audit-library`
  (sharded generate → verify audit over skills/agents) and `/eval-harness`
  (drives existing `benchmark/` profiles; not Cloud Agent eval).
- **Agentic-OS parity Phase 4 — opt-in dispatch-gate:** mechanical research /
  impl / stop gates via additive hooks; ships **disabled**
  (`plugin/.cursor/dispatch-gate.json` `"enabled": false`). Enable per project;
  see [docs/dispatch-enforcement.md](docs/dispatch-enforcement.md).
- **Plugin parity with `~/.cursor` globals:** agents `devops-engineer`,
  `web3-engineer`, `technical-pm`, `marketer`, and `game-design-shaper` plus
  their required skill packs (~15 skills including marketing, web3, devops,
  and game-design). Always-on rules `communication`, `grounding`, and
  `memory-discipline`; Pattern 3b ship-gate language in `orchestrator-first`.
  Operator retirement steps for stale global agents/rules live in
  [plugin loading verification](docs/plugin-loading-verification.md).
- **Pattern 3 ship gates (agentic-os mirror):** canonical
  [`plugin/references/gate-dag.md`](plugin/references/gate-dag.md) with
  `checkpoint:impl-verified` → Wave 1/2 → `checkpoint:ship-ready`; upgraded
  `/review-gate` command; always-on rules encode the DAG. New agents
  `data-model-documenter`, `data-model-verifier`, `library-reviewer` and skills
  `data-model-documentation`, `data-model-verification`, `skill-library-review`.
  Tier-0 scripts `scripts/gate-plan.sh` / `scripts/check-pr-ship-gates.sh`
  (library paths under `plugin/`) plus CI `ship-gates` job that enforces PR
  reviewer checkboxes. Implementation agents require session close
  (`G-data-document`) and Rust’s agent floor matches the skill CI shape.
- **Install collision warnings** for operators with an existing `~/.cursor`:
  agent/rule name-collision guidance (all plugin agents except
  `capability-probe` may collide; doctrine rule filenames may collide) with
  explicit **UNVERIFIED** precedence, hook stacking including the fail-closed
  5s `beforeShellExecution` gate and possible duplicate `sessionStart`
  injection, and the symlink → `registeredInPluginsJson: false` /
  `editorComponentLoading: not-proven` discovery gap with the
  `capability-probe` transcript confirmation step in both README install
  sections. Depth lives in
  [plugin loading verification](docs/plugin-loading-verification.md);
  capability matrix, `SECURITY.md`, and `DATA_MODEL.md` cross-link the same
  facts without inventing Cursor merge semantics.
- **Operator-run plugin loading verification tooling**
  (`npm run plugin:editor:verify`, `npm run plugin:cli:verify`) for the two
  plugin-loading claims that previously had no tooling at all. The editor
  script is read-only against the Cursor home and compares every installed
  component against the inventory by SHA-256; on-disk presence is not
  loading, so it reports `not-proven` unless an operator supplies a
  transcript containing the capability-probe sentinel. The CLI script invokes
  the CLI with `--plugin-dir` in stream-json mode and treats an absent
  `--plugin-dir` capability as a hard error. Both artifacts carry a
  `schemaVersion` and a plugin digest computed at capture time. Neither
  verifies anything on its own; both capture evidence an operator produces.
- **Operator-run CLI telemetry probe** (`npm run probe:cli-telemetry`),
  making one authenticated stream-json call, mirroring the raw stream, and
  emitting a schema-versioned artifact. It enumerates every leaf key path
  rather than guessing field names, and reports `present`, `inconclusive`,
  `absent`, or `indeterminate` per claim — absence only for a call that
  reached a terminal result, so "not emitted" and "never asked" stay
  distinguishable. Long string values are never retained. No claim is marked
  verified by adding the tooling.
- **Release workflow and version bump tooling**
  (`.github/workflows/release.yml`, `npm run release:bump`). The workflow
  packages and verifies artifacts in a read-only job, then publishes from a
  separate `contents: write` job gated on an explicit `confirm_publish`
  input; digests are re-verified after artifact transit and the publish step
  refuses to overwrite an existing release. The bump script rewrites all
  seven version fields and regenerates the plugin inventory, snapshotting
  every file it touches and restoring them if any step fails, so a failed
  bump cannot leave manifests half-updated.
- **Documented-components validator check**, asserting the README component
  lists by name against `plugin/.cursor-plugin/inventory.json` so the prose
  cannot drift from the shipped plugin again. `npm run validate` now runs ten
  deterministic checks.
- **Vulnerability reporting procedure** in [SECURITY.md](SECURITY.md),
  routing to GitHub's private advisory form — the mechanism
  `CODE_OF_CONDUCT.md` already used. No email address was invented; a
  maintainer note records that private vulnerability reporting is
  unverifiable while the repository is private and must be confirmed enabled
  before going public.
- **"How to read this matrix" preamble** in the
  [Cursor capability matrix](docs/cursor-capability-matrix.md), declaring
  per-bullet grading as the document's model, headings as topical, and the
  grade vocabulary actually in use.
- `.nvmrc` pinning Node 22 for contributors, matching the version CI runs.
- `.github/dependabot.yml` tracking the `github-actions` ecosystem weekly.
  SHA-pinned actions are the repository's only dependency surface and never
  update without automation.
- `CONTRIBUTING.md` documenting the zero-third-party-dependency rule and the
  local verification gates.
- `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1).
- Pull request template and issue forms for bug reports and unverified-claim
  evidence, with security reports routed to `SECURITY.md` instead of public
  issues.

### Changed

- **Shell guard follow-up bypass closures** (`beforeShellExecution`): deny
  `GIT_CONFIG_*` environment assignments (fail-closed on unknown names in that
  family); peel Homebrew GNU `gtimeout` / `gnice` / `gstdbuf` / `gtime` like
  their unprefixed forms; after wrapper/launcher peel, structurally re-check
  any remaining argv word whose basename is a high-impact executable (`rm`,
  `git`, `gh`, `npm`, `pnpm`, `busybox`) so unlisted launchers cannot hide
  destructive shapes; deny `git --config-env` / `--config-env=*` (same control
  family as `-c`, value is opaque in the command string). Residuals remain
  pipe-into-interpreter and `find -delete`. See PR #39 / issue #35.
- **Shell guard default-deny allowlist** (`beforeShellExecution`): policy is
  inverted from a pure destructive-command denylist to positively recognized
  safe forms (literal command words, no active `$()` / backtick / process /
  ANSI-C `$'...'` substitutions, peeled wrappers/launchers, recursive shell
  `-c` allowlisting), composed with a high-impact deny layer for recursive
  force `rm`, destructive Git/`gh`/package-registry shapes, `git -c`
  shell-escape config injection, and evaluator/canary path mutations. `eval`
  is denied except the exact named forms `eval "$(direnv hook zsh)"` and
  `eval "$(ssh-agent -s)"`. Known expansion bypass classes fail closed;
  pipe-into-interpreter remains an explicit residual risk. See issue #35.
- **Release gates are now enforced on every pull request.** `aggregateReport`
  was never called on a real run in CI, so five of the seven non-compensable
  gates existed only as prose plus unit tests over synthetic inputs. The
  24-trial corpus smoke now scores its own trials with `aggregateReport` and
  pins the entire eligibility block — every gate status, every evidence
  string, and the ineligibility reason list. CI additionally runs
  `npm run plugin:lifecycle:verify`, which previously ran only in the
  authenticated `workflow_dispatch` workflow, and installs with
  `--ignore-scripts`.
- Bumped SHA-pinned GitHub Actions: `actions/checkout` 4.2.2 → 7.0.1,
  `actions/setup-node` 4.4.0 → 7.0.0, and `actions/upload-artifact`
  4.6.2 → 7.0.1. `actions/download-artifact` is pinned to 8.0.1, the major
  that pairs with `upload-artifact` v7.
- Relocated four capability-matrix bullets that asserted verification in
  their own text while sitting under "Explicitly unavailable or unverified".
  CLI config isolation, artifact isolation, and CI action pinning moved to
  "Verified automatically"; benchmark network denial moved to a new "Verified
  under a stated precondition" section, since it holds only while the probed
  CLI exposes `--sandbox`. Each keeps an explicit unverified bullet for the
  part local tests do not establish.
- Replaced the capability matrix's single global capture date with qualified
  per-claim dates.
- Corrected the "six local gates" wording in [CONTRIBUTING.md](CONTRIBUTING.md):
  CI runs three of the six and three are genuinely local-only, now grouped and
  labelled as such. Added the missing `npm run release:dry-run` to the command
  block, which the pull request template already required.
- Narrowed `engines.node` from `>=22` to `^22`. Both workflows pin Node 22 and
  nothing exercises Node 23 or 24, so the previous range advertised support
  that was never proven. This matters for a codebase relying on `node:test`,
  `node --test` glob expansion, and `node:fs/promises`, all of which drift
  across major versions. Widening the range again should follow CI matrix
  evidence rather than precede it.

### Fixed

- Integrity-baseline capture failures are now attributable. The `catch` around
  `captureIntegrity` discarded the error and recorded only a synthetic tamper
  outcome with a null `actualSha256`, so a release run that went ineligible
  via `telemetryAndEvaluatorIntegrity` carried no evidence of why. A tier-0
  gate-failed finding now carries `error.message` and travels on the arm
  result into `results.ndjson`, which is already an allowlisted export root
  file, so the cause survives sanitization.
- Removed a tautological `pluginLifecycle` gate assertion from the corpus
  smoke. The constant was both passed into `aggregateReport()` and used as the
  expected value, so the per-gate loop compared it to itself and corrupting
  the evidence string still exited 0. Per-gate coverage is now an honest five
  gates rather than six; the real enforcement is the `plugin:lifecycle:verify`
  CI step. The gate identifier assertion is also sorted on both sides, so a
  pure key reordering no longer breaks CI while renames, additions, and drops
  still do.
- Action pin assertions are made by shape (40-hex SHA) instead of a hardcoded
  commit, so legitimate dependency bumps stop landing red while the
  pin-by-full-SHA policy stays intact — a tag or branch ref still fails.
- Corrected both READMEs' component lists. They claimed six skills while the
  plugin ships nineteen, described agents as four roles while nine ship, and
  misnamed two of the six documented skills.
- Repointed four "follow SECURITY.md" referrals at an actual reporting
  procedure. They previously formed a circular reference into a document that
  contained none.
- Dropped `labels: [dependencies]` from `.github/dependabot.yml`;
  `dependencies` is already Dependabot's default label and the repository
  does not define it.
- `.gitignore` now excludes `/benchmark/sanitized/`, which the authenticated
  benchmark writes as exported artifacts alongside the already-ignored
  `/benchmark/results/`.
- Install instructions for release-archive users. The archive root *is* the
  plugin, so the documented `ln -s "$PWD/plugin" ...` — correct from a git
  checkout — produced a dangling symlink for anyone who downloaded a release.
  `plugin/README.md`, the README that ships inside the archive, now carries
  archive-relative steps, and both READMEs state which layout each command
  applies to.
- `scripts/verify-editor-loading.mjs` referenced `README.md:73-81` for the
  symlink instructions; those lines are an unrelated Cloud Agents paragraph.
  The message now names the Installation section instead of a line range.
- `.gitignore` now also excludes `/.claude/worktrees/`, `node_modules/`,
  `.npmrc`, and private key material (`*.pem`, `*.key`, `id_rsa*`,
  `id_ecdsa*`, `id_ed25519*`). Agent worktrees were ignored only by a
  machine-global gitignore, so they were stageable in any fresh checkout;
  `node_modules/` is precautionary given the zero-dependency lockfile, and an
  `.npmrc` carrying an auth token is the classic post-open-sourcing leak.

### Security

- **Credential canary scan no longer defeated by JSON escaping.**
  `assertNoCredentials` compared raw canary bytes against JSON-encoded file
  bytes, so `JSON.stringify`'s escaping of `"`, `\`, and control characters
  meant a secret containing any of them never matched its canary and reached
  the published sanitized export. The scan now also covers JSON-decoded field
  values and keys, plus `utf16le` and `latin1` encodings, with the raw byte
  scan retained so non-UTF8 payloads stay covered. Harness-generated evidence
  must parse or the export fails closed; third-party captures keep the raw
  scan with per-line decoding, and no file is skipped.
- **A secret canary is now mandatory.** Omitting `--secret-canary-file`
  previously produced zero canary coverage while the sanitized export still
  reported success. The export now fails closed instead.
- **Authenticated benchmark runs no longer leave credential copies at rest.**
  Per-trial Cursor config homes were copied from the pre-authenticated
  template with the default mode and never deleted, so a 72-trial release run
  left 72 world-readable credential copies on a shared self-hosted runner.
  Config homes are now written `0600` and removed in a `finally` that covers
  adapter failures, evaluator errors, aborted runs, partially prepared trials,
  and process signals.
- **Plugin-lifecycle release gate evidence is now bound to the plugin
  source.** The gate validated only the *shape* of `pluginSourceSha256`, so
  hand-written JSON reported status `pass` for a non-compensable gate whose
  sole trust anchor is that artifact. The report now re-derives
  `hashTree(plugin/)` and requires equality, refuses evidence whose
  `inputDigest` names a different benchmark run, and records the verified
  digest in the gate evidence string.

### Documentation

- [docs/plugin-loading-verification.md](docs/plugin-loading-verification.md) is
  now linked from `README.md`, `plugin/README.md`, and `CONTRIBUTING.md`, whose
  command table also gains `npm run plugin:editor:verify` and
  `npm run plugin:cli:verify`. The document had no inbound references.
- `README.md` credits **agentic-os** as the upstream project this was ported
  from.

### Won't fix (platform)

- **Per-prompt session reinjection** (Claude `UserPromptSubmit` digest): no
  Cursor equivalent — `beforeSubmitPrompt` cannot inject context. Keep
  `sessionStart` injection, `preCompact` notice, and manual `/state`. See
  [capability matrix](docs/cursor-capability-matrix.md#wont-port-platform-limits).

## [0.1.0] - 2026-07-20

Initial source-available release. Not published to Cursor Marketplace and not
backed by a live authenticated benchmark run.

### Added

- **Cursor plugin** under `plugin/`, following Cursor's Marketplace repository
  and nested plugin manifest layout: agents for capability probing,
  implementation, code review, and security review; skills covering prompt
  shaping, task planning, incremental implementation, findings-ledger
  management, session state, and memory extraction; the `/review-gate`,
  `/triage-findings`, and `/state` commands; and always-applied rules for
  factual correctness, orchestrator-first dispatch, review tiers, and
  actual-diff verification.
- **Fail-closed command guard** — a `beforeShellExecution` hook
  (`plugin/hooks/hooks.json`, Cursor hook schema version 1) invoking a
  standard-library-only Node script with a five-second timeout. It denies a
  narrow set of recognizable high-impact operations and denies malformed input
  with deterministic JSON. It is a safety interlock, not a shell parser or
  security boundary; see [SECURITY.md](SECURITY.md).
- **Session and memory hooks** — dependency-free Node scripts for session
  state injection, memory index injection, memory extraction nudges, and
  pre-compaction notices.
- **Repository validator** (`npm run validate`) running nine deterministic
  checks across 128 discovered components: manifest consistency, component
  discovery, frontmatter contracts, markdown link resolution, plugin inventory
  hashes, orchestration wiring, workflow wiring, JSON schemas, and hook safety.
- **Benchmark harness** with fixture contracts, hidden evaluators and canaries,
  paired harness-on/harness-off execution, a 24-trial deterministic corpus
  smoke that makes no model calls, authenticated smoke and release profiles,
  preflight checks, artifact sanitization, and reporting.
- **Release tooling** — `npm run release:dry-run` for reproducible packaging
  and `npm run plugin:lifecycle:verify` for clean install, idempotence/repair,
  and removal against a temporary Cursor root with machine-readable evidence.
- **Capability probe** (`npm run probe`), network-free, reporting local
  Editor/CLI capability evidence for the current machine.
- **Test suite** of 147 `node:test` tests spanning contracts, fixtures,
  benchmark, release, rules, security, validator, and workflow wiring.
- **CI workflow** running validation, the full test suite, install-lifecycle
  verification, and the corpus smoke on Node 22 with no credentials and no
  model calls. All actions are pinned to immutable commit SHAs, enforced by
  test.
- **Authenticated benchmark workflow**, manually dispatched against a
  protected environment on a self-hosted runner, uploading only sanitized
  artifacts.
- **Documentation** — [README.md](README.md), [DATA_MODEL.md](DATA_MODEL.md),
  [SECURITY.md](SECURITY.md), [benchmark methodology](docs/benchmark.md),
  [evidence policy](docs/evidence-policy.md),
  [threat model](docs/threat-model.md), and the
  [Cursor capability matrix](docs/cursor-capability-matrix.md), including an
  explicit list of currently unverified claims.
- **Zero third-party dependencies** — the lockfile contains no external
  packages; everything runs on the Node standard library.

[Unreleased]: https://github.com/LazyIsEfficient/cursor-os/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/LazyIsEfficient/cursor-os/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/LazyIsEfficient/cursor-os/releases/tag/v0.1.0


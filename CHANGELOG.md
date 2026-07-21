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

- Narrowed `engines.node` from `>=22` to `^22`. Both workflows pin Node 22 and
  nothing exercises Node 23 or 24, so the previous range advertised support
  that was never proven. This matters for a codebase relying on `node:test`,
  `node --test` glob expansion, and `node:fs/promises`, all of which drift
  across major versions. Widening the range again should follow CI matrix
  evidence rather than precede it.

### Fixed

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

### Documentation

- [docs/plugin-loading-verification.md](docs/plugin-loading-verification.md) is
  now linked from `README.md`, `plugin/README.md`, and `CONTRIBUTING.md`, whose
  command table also gains `npm run plugin:editor:verify` and
  `npm run plugin:cli:verify`. The document had no inbound references.
- `README.md` credits **agentic-os** as the upstream project this was ported
  from.

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

[Unreleased]: https://github.com/LazyIsEfficient/cursor-os/compare/9027bba...HEAD
[0.1.0]: https://github.com/LazyIsEfficient/cursor-os/commit/9027bba

<!-- 0.1.0 links reference the release commit: the repository carries no git
     tags yet. Replace with tag links once v0.1.0 is tagged. -->


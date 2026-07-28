# Preferred service stack — an opinionated workspace profile

Concrete dependency profile for async Rust service workspaces, distilled
from production multi-crate workspace. Use when starting new service
workspace or contributing to one declaring this profile. Standing
rule: **the workspace you are in wins** — existing `Cargo.toml`
declares different choices (including lint inversions, below) → follow
workspace, not this document.

## Workspace conventions

- `edition = "2024"`, `resolver = "2"`, shared metadata in
  `[workspace.package]`. (Toolchain reference documents edition 2021 as
  general library default; this profile is newer — as always,
  workspace's declared edition wins. Note edition 2024 defaults to
  resolver `"3"` (MSRV-aware); declaring `"2"` explicitly opts out —
  treat as deliberate, don't "fix" it.)
- **Every external version declared once** in `[workspace.dependencies]`;
  member crates take `dep = { workspace = true }`. Version literal inside
  member's `Cargo.toml` is review finding.
- Internal crates also declared in `[workspace.dependencies]` as
  `{ path = "./crate-name", version = "0.0.0" }` so members depend on them
  uniformly. (Caveat: `version = "0.0.0"` only matches exactly 0.0.0 —
  convention assumes internal crates never bump independently; revisit if
  internals start publishing real versions to registry.)
- Private-registry publishing controlled by allowlist in
  `[workspace.package] publish = [...]` — never per-crate ad hoc.
- **Pin discipline:** default caret requirement for most deps (bare
  `"1.2.3"` *is* `^1.2.3` in Cargo — writing `^` explicitly purely
  stylistic), and exact `=` pins for deps whose upgrades must be deliberate,
  reviewed events (e.g. Vault clients). Git-fork dependency acceptable
  only as stopgap, MUST carry comment with upstream PR/issue link
  and TODO to drop fork once released.

## Lint profile — note the inversion

```toml
[workspace.lints.clippy]
expect_used = "deny"
unwrap_used = "allow"
panic_in_result_fn = "warn"
```

This profile **inverts** skill's default rule ("no `.unwrap()`,
`.expect("reason")` at entry points"): here `.expect()` is *denied*,
`.unwrap()` *allowed*. Reasoning: expect-strings rot into false
documentation; bare `.unwrap()` is greppable, honest about being
assertion. Under this profile: propagate with `?` first; where local
infallibility provable, `.unwrap()` is permitted assert; never reach
for `.expect()`. Do not fight workspace lints — CI-enforced.

## The stack, by concern

| Concern | Use | Notes |
|---|---|---|
| Async runtime | `tokio` (features = `["full"]`), `async-trait`, `futures`/`futures-util` | `async-std` may exist in legacy crates/tests; new code is Tokio |
| HTTP server | `axum` 0.8 | test through `axum-test`, not hand-rolled hyper clients |
| HTTP client | `reqwest` (`native-tls`, `json`, `blocking`, `multipart`) + `reqwest-middleware` + `reqwest-retry` | retries/backoff live in middleware, not call sites; the `blocking` feature is for tests/CLI tools only — never inside the async service (it spawns a second runtime) |
| Errors | `thiserror` 2 (libraries), `anyhow` (binaries), `backtrace` | matches this skill's error-handling reference |
| Tracing/logs | `tracing` + `tracing-subscriber` (`json`, `env-filter`), `tracing-panic`, `tracing-log` bridge | `log`/`env_logger`/`kv-log-macro` are legacy-crate compatibility; new code uses `tracing` |
| Telemetry | `opentelemetry` 0.31 + `opentelemetry-otlp` (`grpc-tonic`) + `opentelemetry_sdk` + `tracing-opentelemetry` | OTLP over gRPC is the export path |
| Serialization | `serde`, `serde_json` | derive everywhere; no hand-rolled JSON |
| Time | `chrono` (`serde`) | |
| Money/decimals | `rust_decimal` (`serde-float`) + `rust_decimal_macros` | never `f64` for money *in code*. Note the tension: `serde-float` serializes `Decimal` as a JSON number, so consumers MUST parse decimal-aware or they reintroduce f64 loss on the wire — this profile assumes decimal-aware consumers; for payloads crossing trust boundaries prefer the default string serialization |
| IDs | `uuid` (`v4`, `serde`), `cuid2` | |
| Config | `envconfig` | env-var struct mapping, no bespoke parsing |
| Enums | `strum` + `strum_macros` | |
| Builders | `typed-builder` (compile-time required fields) or `derive_builder` (`clippy` feature; runtime validation) | both sanctioned; prefer `typed-builder` for new types |
| Protobuf | `prost` + `prost-build`/`prost-types`/`prost-derive` | event payloads are proto-first |
| FFI bindings | `uniffi` | |
| AWS | `aws-config`, `aws-sdk-s3`, `aws-sdk-sqs`, `aws-sdk-eventbridge`, `aws-smithy-runtime-api` | `rusoto_*` is legacy-only — never introduce new rusoto usage |
| Messaging | `rabbitmq-stream-client` (`serde`) | currently consumed via a fork pending an upstream release — see pin discipline above |
| Secrets | `vaultrs` / `vaultrs-login` (exact-pinned) | upgrades are deliberate, reviewed events |
| Postgres | `tokio-postgres` | |
| Utility | `bytes`, `http`, `url`, `regex`, `rand`, `sha2`, `hex-literal`, `once_cell`, `walkdir`, `indoc` | |

## Testing toolkit

| Purpose | Use |
|---|---|
| Parameterized/fixture tests | `rstest` (primary), `test-case` |
| Assertions | `pretty_assertions`; `approx` for floats |
| HTTP stubbing | `httpmock` |
| Consumer-driven contracts | `pact_consumer` — services with HTTP consumers ship pact tests, not just unit tests |
| Async test utilities | `tokio-test` |
| HTTP-layer tests | `axum-test` |
| Log/trace assertions | `tracing-test`, `tracing-fluent-assertions`, `testing_logger` |
| Binary/integration harness | `test-binary` |

## What this profile implies in review

- New dependency outside this table needs justification (same bar as
  standard code-review dependency rule): what does it do that sanctioned crate doesn't?
- Member crate pinning own version of workspace dep is a finding.
- New `rusoto_*` usage is a finding; migrate toward `aws-sdk-*`.
- `.expect()` anywhere in workspace with this lint profile is CI failure,
  not style debate.

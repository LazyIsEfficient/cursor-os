## Edition

- Always use `edition = "2021"` in `Cargo.toml` for new projects — current stable edition
- Edition 2021 key improvements:
  - **Disjoint closure captures**: closures capture specific fields rather than whole struct — `|| use_x(s.x)` no longer borrows all of `s`
  - **`IntoIterator` for arrays**: `for x in [1, 2, 3]` works without `.iter()` or `.into_iter()`
  - **`or_patterns` in `let`/`for`**: `let (Ok(x) | Err(x)) = result;`
- Edition is **per-crate** in workspace — declare `edition = "2021"` in every member's `Cargo.toml`; no workspace-level default propagates automatically

---

## `rustfmt`

### Usage
```sh
cargo fmt                  # format all workspace members in place
cargo fmt --check          # CI: exits non-zero if any file would change
cargo fmt -- --emit files  # write files without modifying in place (rare)
```

### `rustfmt.toml`
```toml
max_width = 100
imports_granularity = "Crate"       # merge imports within each crate into one use tree
group_imports = "StdExternalCrate"  # blank lines between std / external / internal
```

| Option | Value | Effect |
|---|---|---|
| `max_width` | `100` | wider lines; 80 is the default |
| `imports_granularity` | `"Crate"` | collapses `use foo::a; use foo::b;` into `use foo::{a, b};` |
| `group_imports` | `"StdExternalCrate"` | separates `std`/`core`/`alloc`, external crates, and local paths with blank lines |

### Rule
Never fight `rustfmt`. Output looks odd → almost always correct — value is **uniform consistency across codebase**, not individual preference. Suppress specific rule with `#[rustfmt::skip]` sparingly, never globally.

---

## `clippy`

### Usage
```sh
# Standard CI invocation — fail on any warning
cargo clippy --all-targets --all-features -- -D warnings

# Check a single crate without affecting workspace
cargo clippy -p my-crate -- -D warnings
```

### Lint Groups

| Group | When to use |
|---|---|
| `clippy::pedantic` | Enable for all principal-level work — high signal, low noise |
| `clippy::nursery` | Experimental; audit each lint before enabling in CI |
| `clippy::cargo` | Validates `Cargo.toml` metadata; useful for published crates |

### Crate-level configuration
```rust
// lib.rs or main.rs
#![warn(clippy::pedantic)]
#![warn(clippy::nursery)]

// Deliberate exceptions — bare allows without comments are not permitted
#![allow(clippy::module_name_repetitions)] // re-exporting types that include the module name
```

### Inline suppression
```rust
#[allow(clippy::cast_precision_loss)] // value is bounded to [0, 100]; precision loss is acceptable
let pct = count as f64 / total as f64 * 100.0;
```

**Rule**: every `#[allow(...)]` must have inline comment explaining why. Bare allows are code smell — hide reasoning from reviewers and future maintainers.

---

## `rust-analyzer`

- Canonical LSP implementation; prefer over IntelliJ/CLion Rust plugin for feature parity, faster upstream updates
- Key editor setting: `"rust-analyzer.check.command": "clippy"` — surfaces clippy lints inline as you type; otherwise only compiler errors appear

### `cargo check` vs `cargo build`

| Command | Speed | Use case |
|---|---|---|
| `cargo check` | Fast — no codegen | IDE feedback, CI syntax/type checks |
| `cargo build` | Slower | Needed for proc-macro expansion, link step, final binary |
| `cargo build --release` | Slowest | Benchmarks, production artifacts |

---

## `cargo audit`

### Setup
```sh
cargo install cargo-audit
```

### Usage
```sh
cargo audit           # scan Cargo.lock against RustSec advisory database
cargo audit fix       # attempt automatic version bumps to fix advisories
```

Exits non-zero on any unignored advisory. Run on every pull request; **block merge on critical/high severity**.

### `audit.toml` — ignoring advisories
```toml
[[ignore]]
id = "RUSTSEC-2021-0001"
reason = "only affects the foo feature which we do not enable"
```

---

## `cargo deny`

Superset of `cargo audit` — covers advisories, license policy, banned crates, allowed source registries.

### Setup
```sh
cargo install cargo-deny
cargo deny init   # generates deny.toml
```

### Usage
```sh
cargo deny check            # run all checks
cargo deny check licenses   # licenses only
cargo deny check advisories # advisories only (overlaps cargo audit)
```

### `deny.toml` skeleton
```toml
[licenses]
allow = [
    "MIT",
    "Apache-2.0",
    "Apache-2.0 WITH LLVM-exception",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "ISC",
    "Unicode-DFL",
]
deny = ["GPL-2.0", "GPL-3.0"]

[bans]
multiple-versions = "warn"  # or "deny" for strict monorepos
deny = [
    { name = "openssl", reason = "use rustls instead" },
]

[advisories]
ignore = []  # prefer empty; document any exceptions in audit.toml

[sources]
allow-registry = ["https://github.com/rust-lang/crates.io-index"]
```

Use `cargo deny` **instead of or alongside** `cargo audit` in CI — subsumes advisory scanning, adds license/ban enforcement.

---

## `cargo nextest`

### Setup
```sh
cargo install cargo-nextest
```

### Usage
```sh
cargo nextest run                        # run all tests
cargo nextest run --all-features         # include feature-gated tests
cargo nextest run --profile ci           # use CI profile from nextest.toml
cargo test --doc                         # nextest does not run doctests — run separately
```

### Advantages over `cargo test`

| Feature | `cargo test` | `cargo nextest` |
|---|---|---|
| Execution model | threads in one process | one process per test |
| Parallelism | limited by Mutex noise | full parallel by default |
| Output | interleaved | structured, per-test |
| Retries | none | configurable |
| Timing | none | per-test wall time |

### `nextest.toml`
```toml
[profile.ci]
retries = 2           # flaky test tolerance in CI
fail-fast = false     # collect all failures, not just the first
test-threads = 8
slow-timeout = { period = "60s", terminate-after = 3 }
```

**Limitation**: does not execute doctests. Always run `cargo test --doc` as separate CI step.

---

## `rust-toolchain.toml`

Commit at workspace root. Pins compiler version for all developers and CI.

```toml
[toolchain]
channel = "1.87.0"             # pin to exact version for reproducibility
# channel = "stable"           # alternative: always latest stable
components = ["rustfmt", "clippy", "rust-src"]
targets = [
    "x86_64-unknown-linux-musl",   # include cross-compile targets you actually use
    "wasm32-unknown-unknown",
]
```

- `rustup` automatically installs declared toolchain on first use
- Updating pin is deliberate, reviewable change — not silent drift
- CI needs no separate `rustup install` step when `rust-toolchain.toml` present

---

## MSRV Policy

### Declaration
```toml
# Cargo.toml
[package]
rust-version = "1.75"
```

### Library vs Binary

| Crate type | MSRV stance |
|---|---|
| Library (published) | Conservative — downstream consumers may be pinned; check before bumping |
| Binary (internal) | Can track stable closely; still pin for reproducibility |

### Tooling
```sh
cargo install cargo-msrv
cargo msrv find     # probe Rust versions to find the actual minimum
cargo msrv verify   # confirm current code compiles against declared MSRV
```

### CI enforcement
```yaml
- name: Test against MSRV
  run: |
    rustup toolchain install 1.75
    cargo +1.75 test --all-features
```

---

## CI Pipeline Shape

```yaml
jobs:
  check:
    steps:
      - cargo fmt --check
      - cargo clippy --all-targets --all-features -- -D warnings
      - cargo deny check

  test:
    steps:
      - cargo nextest run --all-features --profile ci
      - cargo test --doc

  audit:
    steps:
      - cargo audit

  build:
    steps:
      - cargo build --release --locked
```

### Key flags

| Flag | Purpose |
|---|---|
| `--locked` | Enforce `Cargo.lock` exactly; fails if lock file is stale vs `Cargo.toml` |
| `--all-targets` | Include tests, examples, benches in clippy/check |
| `--all-features` | Prevent feature-gated code from hiding warnings |
| `-D warnings` | Warnings are errors — no silent degradation |

### Caching strategy
Cache these paths, keyed on `Cargo.lock` hash:
- `~/.cargo/registry`
- `~/.cargo/git`
- `target/`

Separate cache keys for `debug` and `release` profiles if both appear in CI.

---

## Naming Conventions

| Item | Convention | Example |
|---|---|---|
| Types, traits, enums, enum variants | `PascalCase` | `HttpClient`, `Display`, `ErrorKind::NotFound` |
| Functions, methods, variables, modules | `snake_case` | `parse_headers`, `self.retry_count`, `mod http_client` |
| Constants, statics | `SCREAMING_SNAKE_CASE` | `MAX_RETRIES`, `DEFAULT_TIMEOUT_MS` |
| Lifetimes (generic) | short lowercase | `'a`, `'b` |
| Lifetimes (meaningful) | short descriptive lowercase | `'conn`, `'req`, `'arena` |
| Crate names (`Cargo.toml`) | `kebab-case` | `my-http-client` |
| Crate names (in Rust source) | `snake_case` | `use my_http_client::...` |
| Feature flags | `kebab-case` | `[features]\nserde = [...]` |

### Additional rules
- Module files: prefer `foo/mod.rs` only when `foo` has submodules; use `foo.rs` for leaf modules (Rust 2018+ path style)
- Avoid redundant prefixes: `http_client::HttpClient` preferred over `http_client::HttpClientClient`; but `http_client::Client` better still — let module path carry context
- Getter methods: no `get_` prefix (Rust convention); use field name directly: `.name()` not `.get_name()`
- Boolean getters: prefix with `is_`, `has_`, `can_`, `should_` as appropriate

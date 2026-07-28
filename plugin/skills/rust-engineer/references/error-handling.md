# Error Handling Reference

## The Fundamental Split: Library vs Application

Single most important decision in Rust error handling: which crate type you are in.

| Context | Goal | Tool |
|---|---|---|
| Library crate | Typed errors callers can `match` on | `thiserror` |
| Application / binary | Context chains for humans and logs | `anyhow` |

**Never use `anyhow::Error` as library return type.** Erases concrete type — callers cannot match, pattern-dispatch on variants, or make recovery decisions. You ship opaque blobs instead of contract.

---

## thiserror

### `#[derive(Error)]`

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("record {id} not found")]
    NotFound { id: u64 },

    #[error("invalid key: {0}")]          // {0} = tuple field
    InvalidKey(String),

    #[error("backend unavailable")]
    Backend(#[from] sqlx::Error),         // #[from] wires From + #[source]
}
```

### `#[from]`

`#[from]` on a field does two things at once:
1. Implements `From<InnerError> for YourError`, enabling `?` conversion.
2. Marks that field as the `#[source]`, so error chain wired automatically.

Variant may have at most one `#[from]` field. Need both `#[from]` and additional fields → add them; `thiserror` handles it.

```rust
#[error("migration failed on step {step}")]
Migration {
    step: u32,
    #[from] source: MigrationError,    // explicit field name required when combined
}
```

### `#[source]`

Use `#[source]` without `#[from]` when you want source chain but not `From` impl (inner type not owned by you, or need manual construction).

```rust
#[error("config parse failed")]
ConfigParse {
    #[source] inner: serde_json::Error,
    path: PathBuf,
}
```

### `#[non_exhaustive]` on error enums

Add `#[non_exhaustive]` to any public error enum to preserve right to add variants in minor release.

```rust
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum ClientError { ... }
```

Cost: downstream `match` arms must include `_ => ...`. Correct trade-off for published crates. Omit only for internal-only types where exhaustive matching is intentional API contract.

### Structuring error types

- **One enum per crate boundary**, not one per function or module. Functions within crate return crate's error type; only public surface matters.
- Group by failure *category*, not call site.
- Avoid catch-all `Other(String)` variant — it is `Box<dyn Error>` with extra steps.

### Concrete full example

```rust
use std::path::PathBuf;
use thiserror::Error;

#[derive(Debug, Error)]
#[non_exhaustive]
pub enum ConfigError {
    #[error("config file not found: {path}")]
    NotFound { path: PathBuf },

    #[error("config file is not valid UTF-8: {path}")]
    Encoding {
        path: PathBuf,
        #[source] source: std::string::FromUtf8Error,
    },

    #[error("config parse error")]
    Parse(#[from] toml::de::Error),

    #[error("missing required field: {field}")]
    MissingField { field: &'static str },
}
```

Callers can `match` on every variant, recover selectively, walk source chain via `std::error::Error::source()`.

---

## anyhow

### `anyhow::Error`

Opaque `dyn std::error::Error + Send + Sync + 'static` with backtrace. Carries full source chains but exposes no structure for matching — appropriate for applications where goal is logging and presentation, not programmatic recovery.

### `.context()` and `.with_context()`

Add context at every layer boundary. String describes *what was being attempted*.

```rust
use anyhow::Context as _;

fn load_config(path: &Path) -> anyhow::Result<Config> {
    let raw = std::fs::read_to_string(path)
        .with_context(|| format!("reading config from {}", path.display()))?;

    toml::from_str(&raw)
        .context("parsing config as TOML")?;

    // ...
}
```

`.context("static str")` — message constant.
`.with_context(|| format!(...))` — message includes runtime values; closure called only on error path.

### `bail!` and `ensure!`

```rust
use anyhow::{bail, ensure};

fn validate_port(port: u16) -> anyhow::Result<()> {
    ensure!(port >= 1024, "port {port} is reserved");
    Ok(())
}

fn check_mode(mode: &str) -> anyhow::Result<()> {
    if mode != "production" && mode != "staging" {
        bail!("unknown mode: {mode}");
    }
    Ok(())
}
```

`ensure!(cond, msg)` is `if !cond { bail!(msg) }`. Both produce `anyhow::Error`.

### Downcasting

Need to inspect concrete type at runtime (e.g., distinguish recoverable error from fatal):

```rust
if let Some(db_err) = err.downcast_ref::<sqlx::Error>() {
    if db_err.as_database_error()
        .map(|e| e.is_unique_violation())
        .unwrap_or(false)
    {
        // handle duplicate key
    }
}
```

Downcasting is escape hatch. Frequent downcasting in application code is smell that library should have returned typed errors.

### `main()` and async entry points

```rust
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = load_config(Path::new("config.toml"))?;
    run(config).await?;
    Ok(())
}
```

`anyhow::Result<()>` as `main` return type integrates with Rust's `Termination` trait — on error prints chain, exits code 1.

---

## The `?` Operator

### What it desugars to

```rust
let x = some_op()?;
// equivalent to:
let x = match some_op() {
    Ok(v) => v,
    Err(e) => return Err(From::from(e)),
};
```

`From::from(e)` is conversion step. For `thiserror` enums, `#[from]` generates `From` impl. For `anyhow`, any `E: std::error::Error + Send + Sync + 'static` converts automatically.

### Chaining context with `?`

```rust
let conn = pool.acquire()
    .await
    .context("acquiring DB connection")?;
```

`.context()` wraps error before `?` returns it. Order matters: wrap first, propagate second.

### When `?` won't work

- **Closures not returning `Result`** — `?` inside `iter().map(|x| ...)` where map expects `T`, not `Result<T>`. Collect into `Result<Vec<_>>` and `?` outside closure, or switch to for loop.
- **`impl Trait` returns with opaque error types** — function returns `impl Fn() -> Result<T, SomeError>` → closure must match exactly; mixing error types requires explicit conversion.

---

## Panic Hygiene

### When panics are acceptable

- **Tests** — `unwrap()` fine; panic is test failure.
- **Program initialization** — CLI argument parsing, loading mandatory config at startup. Invariant must hold for program to function at all → panic with clear message via `.expect()`.
- **`unreachable!()`** in exhaustive matches compiler cannot prove — always add message explaining why branch is structurally impossible.
- **Invariant violations indicating a bug** — `index_map.get(&key).expect("key inserted in same block")`.

### When panics are never acceptable

- **Library code** — panic in your library crashes caller's process. Return `Result`.
- **Spawned async tasks** — panic in `tokio::spawn` / `async_std::spawn` silently swallowed unless caller polls `JoinHandle`. Tasks must catch own panics or propagate errors through channels.
- **Request handlers** — web framework middleware may catch panics, but relying on that is fragile. Use `Result` throughout.

### `.unwrap()` vs `.expect("reason")`

Default: prefer `.expect()` over `.unwrap()` — panic fires, message appears in output. **Exception:** some workspaces CI-enforce inverse (`expect_used = "deny"`, `unwrap_used = "allow"`), on argument that expect-strings rot into false documentation while bare `.unwrap()` is greppable, honest assert. Workspace lint profile always wins — see [preferred-stack.md](preferred-stack.md).

```rust
// Bad: "called `Option::unwrap()` on a `None` value"
let val = map.get(&key).unwrap();

// Good: "user_id must be present after authentication middleware"
let val = map.get(&key).expect("user_id must be present after authentication middleware");
```

### `#[should_panic]`

```rust
#[test]
#[should_panic(expected = "index out of bounds")]
fn rejects_empty_slice() {
    first_element(&[]);
}
```

Use `expected = "..."` to assert panic message matches substring. Without it, any panic passes test.

---

## Error Context Design

- **Add context at layer boundaries, not inside producing function.** Function that opens file should not know what caller was trying to accomplish — context belongs one frame up.

```rust
// Inside file reader — too much knowledge of caller intent:
std::fs::read_to_string(path)
    .context("loading user profile")?   // wrong layer

// In the caller — correct:
reader::read_file(path)
    .context("loading user profile")?
```

- **Context messages describe what was being attempted**, not what went wrong. Underlying error already says what went wrong.

```rust
// Redundant — the io::Error already says "No such file or directory":
.context("failed to open file: file not found")

// Correct:
.context("loading TLS certificate")
```

- **One context per boundary.** `.context()` at every function call in call stack produces noise. Add where semantic meaning changes.

---

## `#[non_exhaustive]`

### On error enums

Prevents downstream `match` from exhaustively covering variants:

```rust
// In your crate:
#[non_exhaustive]
pub enum ApiError { RateLimit, AuthFailed, NetworkError(io::Error) }

// In downstream code — the `_` arm is required:
match err {
    ApiError::RateLimit => retry(),
    ApiError::AuthFailed => reauthenticate(),
    _ => return Err(err.into()),
}
```

Adding new variant to `ApiError` now minor release, not breaking change.

### On error structs

Prevents direct construction by downstream code:

```rust
#[non_exhaustive]
pub struct ParseError {
    pub line: usize,
    pub column: usize,
    pub message: String,
}
```

Downstream cannot write `ParseError { line: 1, column: 0, message: "...".into() }`. You may add fields in minor release. Provide constructor if callers need to build type.

### Summary

| Target | Effect | When to use |
|---|---|---|
| `#[non_exhaustive]` on enum | `match` requires `_` arm | All public error enums in published crates |
| `#[non_exhaustive]` on struct | No struct-literal construction | Public error structs you may extend |

---

## Common Mistakes

### Boxing everything

```rust
// Loses type information; callers cannot match:
fn parse(s: &str) -> Result<Config, Box<dyn std::error::Error>> { ... }

// Correct for libraries:
fn parse(s: &str) -> Result<Config, ConfigError> { ... }
```

`Box<dyn Error>` is manual version of `anyhow::Error` without context API. Almost never right choice.

### Returning `String` as an error type

```rust
// Unergonomic, no source chain, no structured recovery:
fn validate(s: &str) -> Result<(), String> { ... }
```

`String` errors cannot be wrapped with `.context()`, have no `source()`, force callers to parse strings to understand error. Use typed enum or `anyhow::Error`.

### Swallowing errors with `let _ = result`

```rust
// Silent failure — almost always wrong:
let _ = cache.invalidate(key);

// Correct options:
cache.invalidate(key)?;                         // propagate

if let Err(e) = cache.invalidate(key) {         // handle explicitly
    tracing::warn!(err = %e, "cache invalidation failed, continuing");
}

// If truly fire-and-forget, say so explicitly:
let _ = tx.send(event); // best-effort notification; receiver may have dropped
```

Never use `let _ =` without comment explaining why error intentionally discarded.

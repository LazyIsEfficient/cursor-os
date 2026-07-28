# Testing Patterns Reference

## Test Structure Overview

Rust has three canonical test locations:

| Location | Purpose | API access |
|---|---|---|
| `#[cfg(test)] mod tests` inside source files | Unit tests | Private + public |
| `tests/` directory | Integration tests | Public API only |
| `benches/` directory | Benchmarks (criterion) | Public API only |

**Prefer `cargo nextest`** over `cargo test` in CI. Faster execution, better failure output, per-test timeouts, retry semantics.

```sh
# Install once
cargo install cargo-nextest

cargo nextest run

# Run a specific test by name (substring match)
cargo nextest run test_user_creation

cargo nextest run --test integration_tests

cargo nextest run --run-ignored only
```

`cargo test` still needed for doc-tests (`nextest` does not run them).

---

## Unit Tests (`#[cfg(test)]`)

### Structure

```rust
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_positive_numbers() {
        let result = add(2, 3);
        assert_eq!(5, result); // expected left, actual right
    }

    #[test]
    #[should_panic(expected = "overflow")]
    fn add_overflows_on_max() {
        let _ = i32::MAX + 1; // panics with "attempt to add with overflow"
    }
}
```

Key rules:
- `#[cfg(test)]` ensures test code stripped from release builds.
- `use super::*` pulls in parent module's private items — only place that's acceptable.
- `#[should_panic(expected = "...")]` matches substring of panic message. Leave `expected` off only when any panic acceptable (rare).

### Arrange-Act-Assert

Keep three phases visually distinct. One blank line between each phase sufficient:

```rust
#[test]
fn deduct_reduces_balance() {
    let mut account = Account::new(100);

    account.deduct(30).unwrap();

    assert_eq!(70, account.balance());
}
```

Do not collapse all three into single expression. Future readers (and failing test output) will thank you.

### Assertion conventions

- **Left = expected, right = actual.** `assert_eq!(expected, actual)` — matches error message format: `left: 5, right: 7`.
- Use `pretty_assertions` for complex types. Renders coloured diff instead of wall of debug output:

```toml
[dev-dependencies]
pretty_assertions = "1"
```

```rust
#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;
    // Now assert_eq! produces a diff on structs, vecs, maps
}
```

### Test helper functions

Use plain functions inside `mod tests`. No fixtures in Rust — setup logic is just function call:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn make_account_with_balance(balance: u64) -> Account {
        let mut a = Account::new();
        a.deposit(balance);
        a
    }

    #[test]
    fn deduct_from_seeded_account() {
        let mut account = make_account_with_balance(200);
        account.deduct(50).unwrap();
        assert_eq!(150, account.balance());
    }
}
```

Setup expensive and shared across many tests → use `std::sync::OnceLock` or `once_cell::sync::Lazy` for lazy initialization.

---

## Integration Tests (`tests/`)

Each `.rs` file in `tests/` compiles as separate crate linked against library. Can only access `pub` items.

```
tests/
  common/
    mod.rs        ← shared helpers, NOT treated as a test binary
  api_contract.rs
  auth_flow.rs
```

**Sharing helpers:** put in `tests/common/mod.rs`, not `tests/common.rs`. Cargo treats any top-level `.rs` file in `tests/` as test binary — `mod.rs` pattern avoids this.

```rust
// tests/common/mod.rs
pub fn spawn_app() -> TestApp {
    // start a real or in-process server
}
```

```rust
// tests/api_contract.rs
mod common;

#[tokio::test]
async fn health_check_returns_200() {
    let app = common::spawn_app().await;
    // ...
}
```

Integration tests are correct place to assert public API contract. Mocking internals here → testing wrong layer.

---

## Axum HTTP Layer Testing with `axum-test`

`axum-test` runs router in-process — no port binding, no network stack.

```toml
[dev-dependencies]
axum-test = "15"
```

### Basic setup

```rust
use axum_test::TestServer;

async fn make_test_server() -> TestServer {
    let state = AppState {
        repo: Arc::new(FakeUserRepo::new()), // test double
    };
    let router = app_router(state);
    TestServer::new(router).unwrap()
}
```

### Request builders and assertions

```rust
#[tokio::test]
async fn create_user_returns_201() {
    let server = make_test_server().await;

    let body = CreateUserRequest {
        name: "Alice".into(),
        email: "alice@example.com".into(),
    };

    let response = server
        .post("/users")
        .json(&body)
        .await;

    response.assert_status(StatusCode::CREATED);

    let created: UserResponse = response.json();
    assert_eq!("Alice", created.name);
}

#[tokio::test]
async fn get_nonexistent_user_returns_404() {
    let server = make_test_server().await;
    server.get("/users/99999").await.assert_status_not_found();
}
```

Common assertion methods:

| Method | Checks |
|---|---|
| `.assert_status_ok()` | 200 |
| `.assert_status(StatusCode::CREATED)` | exact status |
| `.assert_status_not_found()` | 404 |
| `.assert_json(&expected)` | deserialized equality |
| `.json::<T>()` | deserialize and return |
| `.text()` | raw body as `String` |

**State construction:** build `AppState` exactly as production. Swap only external dependencies (DB, HTTP clients, clocks) with test doubles. Do not add test-only fields to `AppState`.

---

## Trait-Based Mocking

### Design for injectability

Mocking only works if dependency behind trait. Define traits for anything to substitute in tests:

```rust
#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn find_by_id(&self, id: UserId) -> Result<Option<User>, DbError>;
    async fn save(&self, user: &User) -> Result<(), DbError>;
}
```

Concrete types (`PgUserRepository`) implement trait. Handlers receive `Arc<dyn UserRepository>` or generic `R: UserRepository`.

### `mockall`

`#[automock]` generates `MockUserRepository` with fluent expectation setup:

```toml
[dev-dependencies]
mockall = "0.13"
```

```rust
use mockall::predicate::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn get_user_calls_repo_with_correct_id() {
        let mut mock_repo = MockUserRepository::new();

        mock_repo
            .expect_find_by_id()
            .with(eq(UserId(42)))
            .times(1)
            .returning(|_| Ok(Some(User::fixture())));

        let service = UserService::new(Arc::new(mock_repo));
        let result = service.get_user(UserId(42)).await.unwrap();

        assert_eq!("fixture-user", result.name);
    }
}
```

Unmet expectations panic at drop. Set `.times(0)` to assert call never happens.

### Fakes vs mocks

For repository-shaped dependencies, **fake** (in-memory implementation) usually cleaner, more maintainable:

```rust
#[derive(Default)]
pub struct FakeUserRepo {
    users: Mutex<HashMap<UserId, User>>,
}

#[async_trait]
impl UserRepository for FakeUserRepo {
    async fn find_by_id(&self, id: UserId) -> Result<Option<User>, DbError> {
        Ok(self.users.lock().unwrap().get(&id).cloned())
    }

    async fn save(&self, user: &User) -> Result<(), DbError> {
        self.users.lock().unwrap().insert(user.id, user.clone());
        Ok(())
    }
}
```

| Approach | When to prefer |
|---|---|
| Mock (`mockall`) | Assert a specific method is called with specific args a specific number of times |
| Fake (in-memory) | Multiple tests need to exercise realistic state transitions |
| Real implementation | Integration layer tests; only swap the DB connection string |

**Do not mock database in integration tests.** Hides query bugs, migration drift, constraint violations — exactly the bugs integration tests exist to catch.

---

## Property-Based Testing with `proptest`

`proptest` generates hundreds of randomised inputs, shrinks failing cases to minimal reproducer.

```toml
[dev-dependencies]
proptest = "1"
```

### Basic structure

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn encode_decode_roundtrip(input in any::<Vec<u8>>()) {
        let encoded = base64_encode(&input);
        let decoded = base64_decode(&encoded).unwrap();
        prop_assert_eq!(input, decoded);
    }

    #[test]
    fn parse_never_panics(s in ".*") {
        let _ = parse_config(&s); // must not panic regardless of input
    }
}
```

### Strategy reference

| Strategy | Generates |
|---|---|
| `any::<T>()` | Any value the type can hold |
| `0u64..1000` | Integers in range |
| `"[a-z]{1,20}"` | Strings matching regex |
| `vec(any::<u8>(), 0..100)` | Vecs of up to 100 bytes |
| `prop_oneof![Just(A), Just(B)]` | One of a fixed set |

### When proptest pays off

- Parsing and deserialization (does it panic? does it round-trip?)
- Serialization round-trips (`serialize(deserialize(x)) == x`)
- Invariant-holding data structures (heap property, sorted invariant)
- Security-sensitive input handling (fuzzing-lite)

### Shrinking

Shrinking automatic. Failure found → proptest reduces input to smallest still-failing value, reports it. No manual effort — primary advantage over hand-rolled random tests.

To reproduce specific failure, set `PROPTEST_CASES` env var or use `ProptestConfig` with fixed seed.

---

## Snapshot Testing with `insta`

`insta` captures output as `.snap` files committed to repo. Regressions caught when output changes unexpectedly.

```toml
[dev-dependencies]
insta = { version = "1", features = ["json", "yaml"] }
```

```sh
cargo install cargo-insta
```

### Basic usage

```rust
#[test]
fn error_message_format() {
    let err = ValidationError::missing_field("email");
    insta::assert_snapshot!(err.to_string());
}

#[test]
fn api_response_shape() {
    let resp = UserResponse { id: 1, name: "Alice".into() };
    insta::assert_json_snapshot!(resp);
}
```

First run: snapshot file created. Subsequent runs: output compared against it.

### Review workflow

```sh
# After adding new snapshot tests or changing output
cargo insta review
# Opens an interactive diff — accept, reject, or skip each changed snapshot
```

### When to use insta

Use insta when:
- Output complex enough that hand-written assertion fragile or verbose (JSON API responses, generated SQL, compiler-style error messages)
- You want to detect unintentional changes to serialization format

Do not use insta when:
- Precise `assert_eq!` feasible — snapshots defer decision of correctness to reviewer
- Output changes frequently in normal development (snapshot churn is noise)

---

## Test Database Patterns

### `sqlx::test`

`#[sqlx::test]` macro creates temporary database, runs all pending migrations, passes `PgPool` to test, rolls back on drop.

```toml
[dev-dependencies]
sqlx = { version = "0.8", features = ["runtime-tokio", "postgres", "macros"] }
```

```rust
#[sqlx::test]
async fn insert_and_retrieve_user(pool: PgPool) {
    let repo = PgUserRepo::new(pool);

    let user = repo.create(NewUser { name: "Bob".into() }).await.unwrap();

    let fetched = repo.find_by_id(user.id).await.unwrap().unwrap();
    assert_eq!("Bob", fetched.name);
}
```

Each test gets isolated schema. No cleanup code required. Tests run in parallel without interfering.

### Isolation rules

- **Never share database pool between tests.** One corrupted state poisons everything downstream.
- **Do not `truncate` or `delete from` in teardown.** Rollback or fresh schema cheaper, more reliable.
- **Run migrations in tests same way as production.** Skip migrations → testing against schema not matching code.

### Environment setup

```sh
# .env or CI env
DATABASE_URL=postgres://postgres:password@localhost/myapp_test
```

`sqlx::test` appends unique suffix to database name per test — `myapp_test` is base; individual tests get `myapp_test_<uuid>`.

---

## Common Mistakes

| Mistake | Why it hurts | Fix |
|---|---|---|
| Testing implementation details | Breaks on refactors that don't change behaviour | Test observable outputs and return values, not internal state |
| Mocking the DB in integration tests | Hides real query bugs, constraint failures, migration drift | Use `sqlx::test` with a real DB |
| `assert_eq!(err.to_string(), "some internal message")` | Brittle; error text is not a public contract | Match on the error variant: `assert!(matches!(err, MyError::NotFound))` |
| `#[ignore]` on flaky tests | Flaky tests rot and get deleted instead of fixed | Fix the source of flakiness: timing, shared state, or non-determinism |
| Giant test functions | Hard to name, hard to diagnose on failure | One assertion of consequence per test; extract helpers for setup |
| Using `unwrap()` in test setup | Panic message hides which setup step failed | Use `expect("setting up user repo")` with a descriptive message |

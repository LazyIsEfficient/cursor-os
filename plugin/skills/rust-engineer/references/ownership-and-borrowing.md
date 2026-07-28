# Ownership and Borrowing — Principal-Level Reference

## Borrow Checker Mental Model

### The Three Rules

1. Every value has exactly one owner.
2. At any point, you may have **either** any number of shared references (`&T`) **or** exactly one mutable reference (`&mut T`) — never both simultaneously.
3. References must not outlive the value they point to.

### Why These Rules Exist

| Rule | Prevents |
|------|----------|
| Single owner | Double-free, use-after-free |
| Shared XOR mutable | Data races at compile time; no need for runtime synchronisation on `!Send` types |
| Ref lifetime ≤ owner lifetime | Dangling pointers |

No garbage collector, no runtime checks — properties proven at compile time by borrow checker.

### Reading Borrow Checker Errors as Design Feedback

Borrow checker does not misfire. Every error is one of small set of structural problems:

- **Lifetime too short** — returning reference to something that won't live long enough. Fix: return owned data, use `Arc`, or restructure so owner lives in right scope.
- **Simultaneous alias + mutation** — holding `&T` while wanting `&mut T`. Fix: drop or scope-limit shared ref first, or use interior mutability.
- **Moved value used again** — transferred ownership then used original binding. Fix: clone before move, borrow instead of move, or refactor to keep one owner.

Reaching for `.clone()` to silence error almost always wrong; hides design problem borrow checker found.

---

## Lifetimes

### Elision Rules

Compiler inserts lifetime parameters automatically when rules unambiguous:

1. Each elided input lifetime gets own distinct parameter.
2. Exactly one input lifetime parameter → assigned to all output lifetimes.
3. One input is `&self` or `&mut self` → its lifetime assigned to all output lifetimes.

```rust
// All equivalent after elision is applied:
fn first(s: &str) -> &str { ... }
fn first<'a>(s: &'a str) -> &'a str { ... }
```

### When Explicit Lifetimes Are Required

**Structs holding references** — struct must declare lifetime so compiler knows reference constraint:

```rust
struct Tokenizer<'a> {
    source: &'a str,
    pos: usize,
}
// The Tokenizer cannot outlive the &str it borrows.
```

**Multiple ref parameters with ambiguous output lifetime** — elision rule 2 only fires for single input lifetime; multiple inputs → be explicit:

```rust
// Won't compile without explicit lifetimes:
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}
```

**`impl Trait` with references** — compiler needs to know how returned `impl Trait` relates to input lifetimes:

```rust
fn make_iter<'a>(s: &'a str) -> impl Iterator<Item = &'a str> + 'a {
    s.split(',')
}
```

### `'static`

`'static` means value valid for entire program lifetime. Does **not** mean "lives forever" in sense of being leaked — means no borrowed data with shorter lifetime reachable through it.

Common sources:
- String literals: `&'static str` lives in binary's data segment.
- Owned types with no references inside automatically satisfy `T: 'static`.
- `Arc<T>` where `T: 'static` — once cloned out of scope, `Arc` can be sent anywhere.
- `Box<dyn Trait + 'static>` — heap allocation can outlive any particular stack frame.

`'static` as bound (`T: 'static`) common in thread-spawning and async contexts where runtime may outlive creating scope.

### Lifetime Bounds: `'a: 'b`

`'a: 'b` reads "`'a` outlives `'b`". Use when needing guarantee one reference lives at least as long as another:

```rust
fn shorter<'a, 'b: 'a>(x: &'a str, y: &'b str) -> &'a str {
    // y is guaranteed to outlive 'a, so it's safe to return either
    if x.len() < y.len() { x } else { y }
}
```

Appears frequently in iterator adaptors and combinators holding references to other references.

### Self-Referential Structs

Struct cannot hold both value and reference into same value through normal Rust references — address not stable until value pinned.

```rust
// This does not compile — self-reference is not expressible with &:
struct Bad {
    data: String,
    ptr: &str, // can't borrow from `data` in the same struct
}
```

**Why hard:** Rust moves values freely (copying bytes to new location). Reference into field becomes dangling moment struct moves.

**`Pin<P>`** prevents value behind pointer `P` from moving after pinning. Required by async state machines (capture local references across `.await` points).

```rust
use std::pin::Pin;

// Pinned heap allocation — address is now stable:
let pinned: Pin<Box<MyType>> = Box::pin(MyType::new());
```

Implementing self-referential structs manually via `Pin` and `unsafe` error-prone. Practical options:

| Approach | When to use |
|----------|-------------|
| Redesign to avoid self-reference | Always try first |
| `ouroboros` crate | Safe abstraction over self-referential structs |
| `async fn` / `Future` | Let the compiler generate the pinned state machine |
| Raw `unsafe` + `Pin` | Only when you control the allocator and have a compelling reason |

---

## RAII and Drop

### `Drop` Trait

`Drop::drop` runs when value goes out of scope or explicitly dropped with `drop(val)`. Cannot call `drop` directly on value owned through trait — use free function `drop()`.

**Drop order:**
- Local variables drop in **reverse declaration order** (last declared drops first).
- Struct fields drop in **declaration order** (first field drops first), then struct itself.

```rust
struct A; struct B; struct C;
impl Drop for A { fn drop(&mut self) { println!("A"); } }
impl Drop for B { fn drop(&mut self) { println!("B"); } }

struct Pair { first: A, second: B }
// Dropping a Pair prints: A, B  (declaration order)

fn main() {
    let _x = A; // drops last
    let _y = B; // drops first (reverse of declaration)
    // prints: B, A
}
```

### `ManuallyDrop<T>`

Wraps value, **prevents destructor from running**. Used when:
- Building custom allocator or arena, want to reclaim memory without running `Drop`.
- Need to move field out of struct inside `Drop` (normally forbidden).
- FFI: handing ownership to C code that will free memory.

```rust
use std::mem::ManuallyDrop;

let v: ManuallyDrop<Vec<i32>> = ManuallyDrop::new(vec![1, 2, 3]);
// Vec's Drop won't run — memory is not freed unless you call ManuallyDrop::drop explicitly.
```

Never use `ManuallyDrop` to work around lifetime or borrow issue — memory leak or unsoundness waiting to happen.

### Guard Types as RAII

Canonical example: `MutexGuard<'_, T>` — acquiring lock returns guard; guard drops → lock releases. Implement same pattern for any "acquire on entry, release on exit" resource.

```rust
struct ConnectionGuard<'a> {
    pool: &'a Pool,
    conn: Connection,
}

impl Drop for ConnectionGuard<'_> {
    fn drop(&mut self) {
        self.pool.return_connection(self.conn.take());
    }
}
```

Key properties of well-designed guard:
- Holds reference (or `Arc`) to resource it releases back to.
- Is `!Send` if underlying resource thread-local (e.g., `MutexGuard` is `!Send`).
- Does not implement `Clone` — ownership of release must be unique.

---

## Interior Mutability

`&T` → immutable, `&mut T` → mutable invariant is alias contract, not hardware fact. Interior mutability types punch through safely (or unsafely with contract).

### `Cell<T>`

- Single-threaded only (`!Sync`).
- Values must be `Copy` (or use `Cell::replace` / `Cell::take`).
- No references into value ever handed out — copy in, copy out.
- Zero runtime overhead.

```rust
use std::cell::Cell;

let x = Cell::new(0u32);
x.set(x.get() + 1);
```

Use for small counters or flags inside types otherwise immutable by reference.

### `RefCell<T>`

- Single-threaded only (`!Sync`).
- Runtime borrow tracking: `borrow()` returns `Ref<T>`, `borrow_mut()` returns `RefMut<T>`.
- **Panics** at runtime if shared XOR mutable rule violated.
- Use sparingly — panics in production worse than compile errors.

```rust
use std::cell::RefCell;

let v = RefCell::new(vec![1, 2]);
v.borrow_mut().push(3);          // fine
let _r = v.borrow();
v.borrow_mut().push(4);          // PANICS — shared borrow active
```

`try_borrow` / `try_borrow_mut` return `Result` instead of panicking — prefer in library code.

### `Mutex<T>`

- Multi-threaded (`Sync`).
- Blocking: `lock()` blocks until lock available, returns `MutexGuard<T>`.
- **Poisoning**: thread panics while holding lock → subsequent `lock()` calls return `Err(PoisonError)`. Guard still recoverable via `into_inner()` if data known consistent.

```rust
use std::sync::Mutex;

let m = Mutex::new(0i32);
{
    let mut g = m.lock().unwrap(); // unwrap poisons-on-panic; use .unwrap_or_else for recovery
    *g += 1;
} // MutexGuard drops here, lock releases
```

### `RwLock<T>`

- Multi-threaded (`Sync`).
- Multiple concurrent readers via `read()`, exclusive writer via `write()`.
- **Beats `Mutex` when:** reads frequent, writes rare, read-side contention matters.
- **Does not beat `Mutex` when:** writes as frequent as reads, or platform's `RwLock` has writer starvation issues (check OS).

### `Atomic*` Types

In `std::sync::atomic`: `AtomicBool`, `AtomicI32`, `AtomicU64`, `AtomicUsize`, `AtomicPtr<T>`, etc.

Lock-free for primitive values. No poisoning. Useful for counters, flags, publish-subscribe patterns.

**`Ordering` choices:**

| Ordering | Guarantees | Use when |
|----------|-----------|----------|
| `Relaxed` | No ordering constraints, just atomicity | Counters where exact order doesn't matter (stats, IDs) |
| `Acquire` | No reads/writes after this op can be reordered before it | Load side of a publish-subscribe flag |
| `Release` | No reads/writes before this op can be reordered after it | Store side of a publish-subscribe flag |
| `AcqRel` | Acquire + Release on a single RMW op | Compare-and-swap that both reads and writes |
| `SeqCst` | Total order across all `SeqCst` ops on all threads | Rarely needed; use when Acquire/Release is insufficient and you can't reason why |

Classic pattern:

```rust
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

let ready = Arc::new(AtomicBool::new(false));

// Writer thread:
ready.store(true, Ordering::Release);

// Reader thread:
while !ready.load(Ordering::Acquire) { std::hint::spin_loop(); }
// All writes before the Release are visible here.
```

### Decision Tree: Which Interior Mutability Type to Pick

```
Is this used across threads?
├── No
│   ├── Value is Copy and you never need a reference into it → Cell<T>
│   └── You need &T or &mut T to the value → RefCell<T>
│       (accept the runtime panic risk; prefer try_borrow)
└── Yes
    ├── Single primitive value, performance-critical → Atomic*
    ├── Reads >> writes → RwLock<T>
    └── Otherwise → Mutex<T>
```

---

## `Cow<'a, B>`

`Cow` (Clone On Write) is enum: `Borrowed(&'a B)` or `Owned(<B as ToOwned>::Owned)`.

```rust
use std::borrow::Cow;

fn normalize(s: &str) -> Cow<'_, str> {
    if s.contains('\\') {
        Cow::Owned(s.replace('\\', "/"))
    } else {
        Cow::Borrowed(s)  // no allocation
    }
}
```

**Pays off when:**
- Function sometimes needs to modify input, sometimes returns as-is.
- Single return type avoiding unnecessary clones wanted.

**Common patterns:**

| Type | Use case |
|------|----------|
| `Cow<'_, str>` | Config values, log messages, paths that may need normalisation |
| `Cow<'_, [T]>` | Slices that may need padding, filtering, or deduplication |
| `Cow<'_, Path>` | Path manipulation that might add/remove components |

`Cow` implements `Deref<Target = B>` — call `&str` methods directly without matching.

Use `into_owned()` when fully owned value needed unconditionally. Use `to_mut()` when `&mut B` needed — clones on first write, reuses on subsequent writes within same call.

---

## Common Ownership Mistakes and Their Fixes

### Clone to Satisfy the Borrow Checker

```rust
// Smell: cloning because the borrow checker complained
let key = map.keys().next().unwrap().clone();
map.remove(&key);
```

Sometimes correct (genuinely need two independent owners), but often signals data structure or API fighting borrow checker. Ask: should caller own this data? Should container use indices instead of references? Should function take ownership instead of borrowing?

### Holding a Lock Across an `.await` Point

In async code (Tokio, async-std), `MutexGuard` held across `.await` prevents future from being `Send`, may deadlock if executor single-threaded.

```rust
// WRONG: MutexGuard held across await
async fn bad(m: &Mutex<Data>) {
    let guard = m.lock().unwrap();
    do_io().await;          // guard still held here
    use_data(&*guard);
}

// CORRECT: drop guard before await
async fn good(m: &Mutex<Data>) {
    let value = {
        let guard = m.lock().unwrap();
        guard.clone()       // or extract what you need
    };                      // guard dropped here
    do_io().await;
    use_value(value);
}
```

Use `tokio::sync::Mutex` (async-aware) if genuinely needing lock across await point — yields rather than blocking thread.

### Returning References to Local Data

Always compile error. Fix almost always ownership transfer:

```rust
// WRONG: reference to local variable
fn make_greeting(name: &str) -> &str {
    let s = format!("Hello, {name}!");
    &s                          // error: `s` does not live long enough
}

// CORRECT: return owned String
fn make_greeting(name: &str) -> String {
    format!("Hello, {name}!")
}
```

`&'static str` genuinely appropriate (compile-time-known values) → use `once_cell` or `std::sync::OnceLock` to back with static allocation. Do not use `Box::leak` to silence borrow checker — deliberate leak, should be conscious, documented decision.

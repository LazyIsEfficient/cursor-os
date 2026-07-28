# Performance and Profiling

## Zero-Cost Abstractions as a Design Principle

"Zero-cost" means no overhead vs equivalent hand-written C. Does **not** mean "free" — computation still runs. Stroustrup's original formulation: *"What you don't use, you don't pay for. What you do use, you couldn't hand-code better."*

**Zero-cost in Rust:**

| Abstraction | Mechanism | Cost |
|---|---|---|
| Iterators | Monomorphized, inlined by LLVM | Zero |
| Closures | Statically-dispatched, inlined | Zero |
| Generics (`fn foo<T>`) | Monomorphization — one copy per concrete type | Zero at runtime (code size tradeoff) |
| `impl Trait` (argument position) | Same as generics | Zero |

**Not zero-cost:**

| Abstraction | Why |
|---|---|
| `dyn Trait` | Vtable pointer dereference; prevents inlining; often implies heap allocation |
| `Box<T>` | Heap allocation + pointer indirection |
| `Arc<T>` | Atomic refcount on every clone/drop |
| `.clone()` | Deep copy — cost is proportional to data |
| `impl Trait` (return position) | Opaque type, not `dyn`, still zero-cost — do not confuse these |

**Default rule:** reach for abstractions first. Verify with profiler that they cost you before removing. Premature concretization (removing iterators, inlining generics manually) trades maintainability for imaginary gains.

---

## Measure First — The Profiling Workflow

Never guess. Never profile debug build. Follow sequence:

### 1. Reproduce Under Realistic Load
Synthetic microbenchmarks lie. Reproduce actual access pattern, data size, concurrency. Benchmark on 10 items tells nothing about 10 million.

### 2. Build for Release
```bash
cargo build --release
```
Debug builds disable inlining and optimisation. Profiling debug build measures overhead, not your code.

### 3. `cargo flamegraph` — Identify Hot Functions
```bash
cargo install flamegraph
cargo flamegraph --bin my-binary -- --args
```
Produces flamegraph SVG. Wide frames are hot. Look for:
- Unexpected `alloc::` / `Vec::` / `String::` calls in hot paths
- `clone()` you didn't know was there
- Synchronization (`Mutex::lock`, `Arc::drop`) dominating

Add to `Cargo.toml` to preserve symbol names without hurting runtime performance:
```toml
[profile.release]
debug = 1
```

**Platform notes:**
- Linux: uses `perf`; needs `perf_event_paranoid` ≤ 1 (`sudo sysctl -w kernel.perf_event_paranoid=1`)
- macOS: uses DTrace; may require partial SIP disable (`csrutil enable --without dtrace`)

### 4. `cargo criterion` — Microbenchmarks
```bash
cargo install cargo-criterion  # optional CLI runner
cargo bench
```
Results in `target/criterion/`. Criterion handles warmup, statistical analysis, regression detection automatically. Use to compare two implementations with controlled setup.

### 5. DHAT — Heap Allocation Profiling
```bash
valgrind --tool=dhat --dhat-out-file=dhat.out ./target/release/my-binary
```
Or use `dhat` crate for in-process profiling without Valgrind. Identifies:
- Total bytes allocated
- Peak live bytes
- Allocation call sites (which `Vec::push`, which `String::from`, etc.)

Use when flamegraph shows `malloc`/`free` dominating but you need Rust call sites.

### 6. `tokio-console` — Async Task Profiling
```bash
cargo install tokio-console
# In your app: add tokio-console-subscriber, instrument with RUSTFLAGS="--cfg tokio_unstable"
```
Identifies:
- Tasks stuck in `Pending` state (await never resolves)
- Tasks with abnormally high poll counts (busy-looping)
- Tasks holding wakers longer than expected

---

## `criterion` Benchmarks

### Setup

`Cargo.toml`:
```toml
[dev-dependencies]
criterion = { version = "0.5", features = ["html_reports"] }

[[bench]]
name = "my_benchmark"
harness = false
```

### Basic Benchmark

`benches/my_benchmark.rs`:
```rust
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn fibonacci(n: u64) -> u64 {
    match n {
        0 | 1 => n,
        _ => fibonacci(n - 1) + fibonacci(n - 2),
    }
}

fn bench_fibonacci(c: &mut Criterion) {
    c.bench_function("fibonacci 20", |b| {
        b.iter(|| fibonacci(black_box(20)))
    });
}

criterion_group!(benches, bench_fibonacci);
criterion_main!(benches);
```

`black_box()` prevents compiler from constant-folding or dead-code-eliminating work under measurement. Always wrap inputs and outputs.

### Comparing Implementations

```rust
use criterion::{BenchmarkGroup, BenchmarkId, Criterion, measurement::WallTime};

fn compare_implementations(c: &mut Criterion) {
    let mut group: BenchmarkGroup<WallTime> = c.benchmark_group("string_ops");

    for size in [100usize, 1000, 10_000] {
        group.bench_with_input(BenchmarkId::new("format_macro", size), &size, |b, &n| {
            b.iter(|| format!("{:0>width$}", black_box(42), width = n))
        });

        group.bench_with_input(BenchmarkId::new("write_macro", size), &size, |b, &n| {
            b.iter(|| {
                let mut s = String::with_capacity(n);
                use std::fmt::Write;
                write!(s, "{:0>width$}", black_box(42), width = n).unwrap();
                s
            })
        });
    }

    group.finish();
}
```

---

## Common Performance Patterns

### Avoiding Allocations in Hot Paths

**Pre-allocate when size known:**
```rust
// Bad: multiple reallocations
let mut v = Vec::new();
for item in items { v.push(item); }

// Good: single allocation
let mut v = Vec::with_capacity(items.len());
for item in items { v.push(item); }
```

**Reuse buffers across calls:**
```rust
// Bad: allocates on every call
fn process(data: &[u8]) -> Vec<u8> { /* ... */ }

// Good: caller owns the buffer; zero allocation in steady state
fn process(data: &[u8], out: &mut Vec<u8>) {
    out.clear();
    // fill out
}
```

**`SmallVec` for short-lived collections:**
```rust
use smallvec::SmallVec;

// Stack-allocated for ≤4 elements; falls back to heap
let mut v: SmallVec<[u8; 4]> = SmallVec::new();
```
Use when collections almost always small; avoids heap for common case.

**`Cow<'_, T>` to avoid cloning read-mostly data:**
```rust
use std::borrow::Cow;

fn normalize(s: &str) -> Cow<'_, str> {
    if s.chars().all(|c| c.is_lowercase()) {
        Cow::Borrowed(s)   // no allocation
    } else {
        Cow::Owned(s.to_lowercase())  // allocates only when needed
    }
}
```

### Zero-Copy I/O with `bytes`

`bytes::Bytes` is reference-counted slice — `clone()` is O(1) (increments refcount, no memcpy).

```rust
use bytes::{Bytes, BytesMut};

// Build a mutable buffer
let mut buf = BytesMut::with_capacity(1024);
buf.extend_from_slice(b"hello");
buf.extend_from_slice(b" world");

// Freeze into a cheaply-cloneable read-only Bytes
let frozen: Bytes = buf.freeze();

// Cloning is O(1)
let slice = frozen.clone();  // just bumps refcount
```

Prefer `Bytes` over `Vec<u8>` anywhere same buffer passed to multiple consumers (HTTP response bodies, parsed frames, cache entries).

### String Performance

```rust
// Bad: format! allocates on every call
fn label(n: u32) -> String {
    format!("item_{}", n)
}

// Better for hot paths: write into a pre-allocated buffer
use std::fmt::Write;
fn label_into(n: u32, buf: &mut String) {
    buf.clear();
    write!(buf, "item_{}", n).unwrap();
}

// For widely-shared immutable strings: Arc<str> is smaller than Arc<String>
let shared: std::sync::Arc<str> = "hello".into();
```

| Pattern | Allocates? | Notes |
|---|---|---|
| `String::new()` + `push_str` | Yes (on growth) | Use `with_capacity` if length known |
| `format!()` | Always | Fine outside hot paths |
| `write!()` into existing `String` | No (if capacity ok) | Prefer in loops |
| `Arc<str>` | Once | Share across threads cheaply |
| `&'static str` | Never | Compile-time constant only |

### Iteration

Iterator chains compile to same code as hand-written loops. Do **not** materialise intermediate collections.

```rust
// This does not allocate intermediate Vecs
let sum: u32 = data
    .iter()
    .filter(|&&x| x > 0)
    .map(|&x| x * 2)
    .sum();
```

For data-parallel CPU work, swap `.iter()` for `.par_iter()` (Rayon) — no other changes:
```rust
use rayon::prelude::*;

let sum: u32 = data.par_iter()
    .filter(|&&x| x > 0)
    .map(|&x| x * 2)
    .sum();
```

Rayon uses work-stealing thread pool sized to available CPUs. Only helps when work per element non-trivial (> ~1µs) and data large enough to amortize thread overhead.

---

## Async Performance Considerations

- **Many tasks cheap; wakeup storms not.** Spawning millions of tasks fine. Millions of tasks waking each other repeatedly (broadcast, polling loops) can saturate scheduler.
- **Yield correctly:**
  ```rust
  // Bad: sleep(0) has OS scheduler overhead
  tokio::time::sleep(Duration::ZERO).await;

  // Good: cooperative yield to Tokio scheduler
  tokio::task::yield_now().await;
  ```
- **Bound concurrency with `Semaphore`:**
  ```rust
  use tokio::sync::Semaphore;
  use std::sync::Arc;

  let sem = Arc::new(Semaphore::new(100));  // max 100 concurrent tasks

  for item in items {
      let permit = sem.clone().acquire_owned().await.unwrap();
      tokio::spawn(async move {
          let _permit = permit;  // released on drop
          process(item).await;
      });
  }
  ```
- **Batch I/O.** Network round-trips dominate. Single `write_all` of 100 records costs ~same as one record. Buffer writes with `BufWriter` or accumulate records before flushing.
- **Avoid blocking in async context.** CPU-bound work blocks executor thread. Use `tokio::task::spawn_blocking` to run on dedicated thread pool.

---

## Compiler Flags for Release Performance

```toml
[profile.release]
opt-level = 3      # default; max LLVM optimisation passes
lto = "thin"       # link-time optimisation across crate boundaries; often 5–15% speedup
codegen-units = 1  # single codegen unit: slower compile, best optimisation; use for final builds
panic = "abort"    # skip unwinding machinery; smaller binary, marginally faster panics
debug = 1          # strip = false equivalent; keeps symbol names for profiling
```

**`lto` tradeoffs:**

| Value | Compile Time | Runtime Gain |
|---|---|---|
| `false` | Fastest | None |
| `"thin"` | Moderate increase | Good (~5–15%) |
| `"fat"` | Slow | Best, diminishing returns vs thin |

Use `codegen-units = 1` only for final production binaries or benchmarks. Makes incremental builds impractical.

---

## When NOT to Optimise

- Before measurable, reproducible regression exists. Guessing bottleneck almost always wrong.
- When bottleneck is I/O. `cargo flamegraph` shows hot path is `epoll_wait` or `read` → CPU optimisation is noise.
- When change makes code materially harder to maintain. If you must — add comment explaining **what** you measured and **why** this form is faster:
  ```rust
  // PERF: avoid allocation in tight loop; criterion bench showed 3x improvement
  // over returning Vec<u8>. See benches/frame_parse.rs.
  fn decode_frame(buf: &[u8], out: &mut Vec<u8>) { /* ... */ }
  ```

**Optimisation debt is real.** Unsafe transmutes, manual SIMD, cache-aligned structs make code reviewer's job harder, introduce correctness risk. Pay only when profiler demands it.

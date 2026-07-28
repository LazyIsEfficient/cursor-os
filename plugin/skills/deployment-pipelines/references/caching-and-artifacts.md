# Caching and Artifacts

Caches make CI fast; artifacts move data between jobs and out of run.

## `actions/cache` Basics

```yaml
- uses: actions/cache@<sha>
  id: npm-cache
  with:
    path: ~/.npm
    key: npm-${{ runner.os }}-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      npm-${{ runner.os }}-
```

Rules:
- **Key on lockfile hash**, never dates or commit SHAs.
- **`restore-keys`** provides fallback when exact key misses — use prefix still reasonably specific.
- **Scoped paths only** — cache `~/.npm`, not `node_modules` (latter faster to reinstall from populated `~/.npm` than to restore).
- **One cache per tool**: don't bundle node_modules + build output + Docker layers in one cache.

## Setup Actions Already Cache

`actions/setup-node`, `setup-go`, `setup-python`, etc. have built-in caching:

```yaml
- uses: actions/setup-node@<sha>
  with:
    node-version: 22
    cache: npm
    cache-dependency-path: package-lock.json
```

Prefer over hand-rolled `actions/cache` for language toolchains.

## Build Caches

For TypeScript / Vite / Next / Turborepo, cache build output dir keyed on:
- Lockfile hash
- Source file hash (for full incremental builds)
- Tool version

Turborepo / Nx have remote cache backends (S3, Vercel, Nx Cloud) — usually faster and more reliable than `actions/cache` at scale.

## Docker Layer Caching

```yaml
- uses: docker/setup-buildx-action@<sha>
- uses: docker/build-push-action@<sha>
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

`type=gha` uses GitHub Actions cache backend transparently. `mode=max` caches all layers, not just final stage.

## Cache Hygiene

- **Cache size limit**: 10 GB per repo. Caches evicted LRU. Push past limit → older caches die.
- **Cache scope**: scoped to branch + base branch. PRs see own cache + base branch's cache.
- **Invalidation**: change key when cached content's shape changes (new tool version, new lockfile format).
- **Don't cache secrets**, ever. Caches downloadable by any workflow run on repo.

## Artifacts vs Cache

| | Cache | Artifact |
|---|---|---|
| Purpose | Speed up subsequent runs | Pass data between jobs / out of the run |
| Lifetime | Until evicted (LRU, 7d untouched) | Configurable, default 90d |
| Scope | Branch-aware | Run-aware |
| Size | Up to 10 GB total | Up to several GB per artifact |
| Use for | `~/.npm`, `dist/`, build cache | Test reports, coverage, built binaries, logs |

## Artifacts

```yaml
- uses: actions/upload-artifact@<sha>
  if: always()                   # upload even on failure
  with:
    name: test-results-${{ matrix.shard }}
    path: |
      reports/
      coverage/
    retention-days: 14
```

```yaml
- uses: actions/download-artifact@<sha>
  with:
    name: test-results-1
    path: ./reports
```

Rules:
- **Always upload test reports / logs** with `if: always()` so failures debuggable.
- **Set `retention-days`** explicitly — 90-day default wasteful for high-volume repos.
- **Unique names per matrix shard** to avoid collisions; merge in downstream job.
- **Don't upload `node_modules`** as artifact — that's what cache is for.

## Anti-Patterns

- Caching secrets or signed artifacts.
- Cache key based on `${{ github.run_id }}` — never hits.
- Uploading entire workspace as artifact "just in case".
- 90-day retention on every artifact when 7 days would do.
- Hand-rolled cache for tools where setup action already handles it.

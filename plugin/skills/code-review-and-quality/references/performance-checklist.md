# Performance Review Checklist

Use during code review to catch common performance issues.

## Database / Data Access
- [ ] No N+1 query patterns (queries inside loops)
- [ ] Indexes exist for columns used in WHERE / JOIN / ORDER BY clauses
- [ ] Pagination applied to unbounded list queries

## Caching
- [ ] Expensive computations cached where appropriate
- [ ] Cache invalidation strategy defined and correct
- [ ] No stale reads in latency-sensitive paths

## Network
- [ ] API calls batched where possible
- [ ] Unnecessary round-trips eliminated
- [ ] Payloads not larger than needed (no over-fetching)

## Frontend
- [ ] No render-blocking resources in critical path
- [ ] Images optimised and lazy-loaded where appropriate
- [ ] Bundle size checked for unexpected growth

## Concurrency
- [ ] No unnecessary blocking calls on main thread / event loop
- [ ] Background work offloaded to workers / queues where appropriate

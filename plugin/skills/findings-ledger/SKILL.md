---
name: findings-ledger
description: Records and triages advisory Tier 2 review findings without turning stochastic judgment into a gate. Use after code or security review and when measuring recurring concerns.
---

# Findings ledger

The ledger stores reviewer judgment that lacks deterministic evidence. It does
not store Tier 0 failures or evidence-backed Tier 1 findings.

## Entry contract

Emit one JSON object per finding:

```json
{"fingerprint":"<stable-id>","path":"<file:line>","claim":"<one sentence>","tier":2,"source":"<reviewer>","run_id":"<independent run>","status":"NEW","evidence":null}
```

Normalize the path and claim before deriving a stable fingerprint. A repeated
fingerprint becomes `RECURRING` only when it appears in at least two distinct
`run_id` values; repetition within one review does not count.

## Triage

- `NEW`: advisory only.
- `RECURRING`: investigate whether a deterministic check can encode the claim.
- `PROMOTED`: cite the new Tier 0 check or Tier 1 evidence artifact; stop
  re-litigating it as Tier 2.
- `RETIRED-NOISE`: no recurrence or no actionable defect.

Never mark Tier 2 blocking. A Tier 1 label requires a reproducible failing
test, deterministic command, or explicit counterexample with pinned inputs;
without that evidence, demote the finding to Tier 2. Append or persist ledger
entries only when the caller authorizes a write; read-only reviewers return
entries to the caller.

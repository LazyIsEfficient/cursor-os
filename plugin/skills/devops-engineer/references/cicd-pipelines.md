# CI/CD Pipelines — Helm and Pulumi Deployment Reference

> **This reference covers Helm and Pulumi deployment mechanics in pipelines, safe promotion patterns, environment gates. For general CI quality gates, pipeline structure, GitHub Actions YAML, see `ci-cd-and-automation`.**

---

## 1. Grounding First — Read Before You Mutate

Pipeline that only mutates is deploying blind. Every deploy pipeline must include **read/diff/preview step before any mutation step**, visible on PR so human can review:

- **Helm:** `helm diff upgrade` runs on every PR against target environment. `helm upgrade` runs only after diff reviewed.
- **Pulumi:** `pulumi preview --diff` runs on every PR. `pulumi up` runs only on merge, after preview was the gate.

Diff step absent → pipeline is hallucination risk — you only discover what changed after it changed in production.

---

## 2. Helm in CI

### Validation (every PR)

```bash
helm lint <chart>                                             # catches syntax and schema errors
helm template <chart> -f values-<env>.yaml \
  | kubectl apply --dry-run=client -f -                      # confirms manifests are accepted by the API server
```

`helm lint` catches templating errors; `--dry-run` step catches API compatibility issues lint misses.

### Diff gate (every PR, against target environment)

```bash
helm diff upgrade <release> <chart> \
  -f values-<env>.yaml \
  -n <namespace>
```

Post output as PR comment (use `helm-diff` GitHub Action or pipe to comment step). Gate promotion on review — do not auto-merge if diff shows unexpected resource replacements or deletions.

Always pin chart versions in CI. Never floating reference like `latest` or unversioned OCI reference — chart update mid-pipeline breaks reproducibility.

### Deploy (on merge to main)

```bash
helm upgrade --install <release> <chart> \
  -f values-<env>.yaml \
  --namespace <ns> \
  --atomic \
  --wait \
  --timeout 5m
```

- `--atomic`: upgrade fails → Helm automatically rolls back to previous revision, preventing broken release sitting in failed state.
- `--wait`: blocks until all pods ready, not just until API server accepted manifest.
- `--timeout 5m`: bounds wait so pipeline doesn't hang indefinitely.

Add alerting on rollback events (`helm history <release>` or Helm hook `post-rollback`) — silent auto-rollbacks are invisible failures.

---

## 3. Pulumi in CI

### PR check

```bash
pulumi stack select <env>                                     # always explicit; never assume the active stack
pulumi preview --diff
```

Post preview output as PR comment. Block merge if preview shows unexpected destroys or replacements — destroy in preview is required human decision, not auto-approve.

### Merge to main

```bash
pulumi stack select <env>
pulumi up --yes --skip-preview
```

`--skip-preview` safe here **because preview was gate on PR**. Second preview on merge adds latency without safety — state may have drifted slightly, but diff reviewed on PR is authoritative intent signal. **Exception applies only to this CI merge path — does not relax preview requirement in any other context.** Any `pulumi up` outside pipeline where PR preview was explicit gate must run `pulumi preview` first per SKILL.md Universal Rule 3.

### Drift detection (scheduled job)

```bash
pulumi stack select <env>
pulumi preview --expect-no-changes
```

Run on schedule (e.g., daily). Non-zero exit = something outside Pulumi mutated stack. Treat drift as incident — live state no longer matches declared state.

### Auth in CI

- Use `PULUMI_ACCESS_TOKEN` as CI secret — never personal token.
- For cloud auth (AWS, GCP, Azure), use **OIDC** instead of long-lived access keys. Configure trust relationship between CI provider (e.g., GitHub Actions OIDC) and cloud IAM role; pipeline gets short-lived token per run, no stored secret.

---

## 4. Safe Deployment Patterns

### Environment promotion order

```
dev → staging → prod
```

Never skip staging for production. Staging is last cheap failure point.

Gate between environments: smoke tests must pass **and** diff review must have occurred. Green tests alone not sufficient — test suite not covering schema migration passes while production burns.

### Blue-green with Helm

Maintain two releases: `app-blue` and `app-green`. Deploy new version to inactive release. Switch traffic by updating service selector label (`version: blue` → `version: green`). Instant rollback: re-point selector. No pod restarts on rollback.

### Canary with Helm

Use weighted ingress annotations (nginx: `nginx.ingress.kubernetes.io/canary-weight`, traefik: `traefik.ingress.kubernetes.io/service-weights`). Start canary at **5%** of traffic. Monitor error rate and p99 latency. Ramp in steps (5% → 20% → 50% → 100%) only if gates pass at each step.

### Rollout gates

Define success criteria before deploying: error rate < 0.1%, p99 latency < 500ms, no increase in OOMKill events. Automate rollback if gate fails within observation window (typically 10–15 min). Deployment without pre-defined success criteria has no meaningful rollback trigger.

---

## 5. Deployment Verification

Helm or Pulumi reporting success = API server accepted manifests. Does not mean application healthy.

After every deploy:

```bash
kubectl rollout status deployment/<name> -n <ns> --timeout=5m   # pods ready, not just accepted
helm test <release> -n <ns>                                      # Helm test hooks if defined
```

Deployment complete only when:
- All pods `Running` with readiness probes passing
- No recent `OOMKill` events (`kubectl get events`)
- Application error rate at baseline (check metrics)

Pipeline marking deploy complete at `helm upgrade` exit code 0 without these checks produces false confidence.

---

## 6. Secrets in Pipelines

- No credentials in pipeline YAML — use CI secret management (GitHub Actions encrypted secrets, Vault, etc.).
- Use OIDC for cloud auth; document trust relationship (`repo:org/repo:ref:refs/heads/main` → IAM role ARN).
- Never `echo` or `print` secret values in pipeline steps — appear in logs, captured in run artifacts.
- `helm upgrade --set dbPassword=$SECRET` acceptable when `$SECRET` from CI secrets, but prefer values files with secrets injected from vault at deploy time.
- Rotate secrets immediately on suspected breach — do not wait for confirmation.

---

## 7. Common Anti-Patterns

- `pulumi up` without preview gate on PR — destroys and replacements invisible until they hit prod.
- `helm upgrade` without `helm diff` in pipeline — same; you only see what changed after it changed.
- Promoting to prod without staging deploy — staging is last cheap failure point.
- Long-lived cloud credentials in CI — use OIDC; compromised runner should yield expiring token, not persistent access.
- Auto-promoting on green tests without human diff review for prod — tests don't cover what tests don't cover.
- No rollback plan before deploying — define rollback path before upgrade runs, not after it fails.
- `kubectl apply` directly in CI, bypassing Helm/Pulumi — state tracking breaks; drift undetectable.
- Missing `--atomic` / `--wait` — Helm reports success, pods aren't ready, failure surface shifts to next check window.

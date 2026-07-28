# Kubernetes Operations

Before touching anything, read current state. Single most important rule in this document. Kubernetes clusters are shared, live infrastructure — what you think is true about a resource and what is actually deployed are frequently different. Every mutation proposed in this guide starts with a read. Cannot quote current resource YAML → have not read it. Mark any proposed change `UNVERIFIED:` and go read it first.

Two most common mistakes in Kubernetes day-2 work:

1. **Patching from memory.** You remember what Deployment looked like last week. Cluster has had three hotfixes since. Patch from memory, break something new.
2. **Skipping Events.** Answer to most pod failures is in `kubectl describe`'s Events section. Engineers skipping straight to `kubectl exec` waste 20 minutes reaching same conclusion.

Both are habits. Both fixable.

## kubectl Command Patterns

### Read-first commands (reach for these before anything else)

**`kubectl get <resource> -o yaml`** — Canonical read. Use before any patch, apply, edit. Output is actual server-side state, not manifest you think you applied. Look for `status` fields alongside `spec` — cluster's view of convergence lives there.

```bash
kubectl get deployment my-app -n production -o yaml
```

Save before mutating: `kubectl get deployment my-app -n production -o yaml > current.yaml`

**`kubectl describe <resource>`** — Human-readable summary plus **Events** section. Read Events every time. Events show scheduling failures, image pull errors, OOMKills, readiness probe failures, volume mount problems — actual failure mode, not just "pod is Pending." Events age off after ~1 hour; pod old and Events empty → use logs.

**`kubectl logs <pod> -n <ns>`** — Current container output. Container crashing → may be empty or truncated because crash happened fast.

**`kubectl logs <pod> -n <ns> --previous`** — Last container's output before most recent restart. Almost always more useful than current logs when pod in `CrashLoopBackOff`. Run `--previous` first; empty → read current.

**`kubectl exec -it <pod> -n <ns> -- <cmd>`** — Live shell into running container. **Last resort**, not first response. Exec destructive to reproducibility: changes runtime state, potentially masks bug, leaves no audit trail. Document findings from steps 1–5 before going interactive. Never exec into pod to "just check something" before reading its logs.

**`kubectl port-forward <pod> 8080:8080 -n <ns>`** — Local debugging without exposing Service. Use to hit application endpoint or pprof handler from workstation without touching Ingress or LoadBalancer config. Safe; read-only from cluster's perspective.

**`kubectl top pod -n <ns>` / `kubectl top node`** — Point-in-time resource consumption. Look for pods near their limit (imminent OOMKill) or nodes above 80% memory (imminent eviction pressure). Snapshot, not trend — open metrics dashboard for trends.

### Useful flags

- `-n <namespace>` — always specify; defaulting to `default` in production is incident waiting to happen
- `--all-namespaces` / `-A` — cluster-wide surveys; slow on large clusters
- `-o wide` — adds Node, IP, nominated-node to pod listings; essential for placement debugging
- `-o jsonpath='{.spec.containers[*].image}'` — surgical field extraction; one value without parsing full YAML
- `-l app=my-app,version=v2` — label selector filtering; faster and more reliable than grepping output

## Pod Debugging Workflow

Work through steps in order. Each step reads before acting. Do not skip ahead.

**Step 1 — Read pod status and placement.**

```bash
kubectl get pod <name> -n <ns> -o wide
```

Look at: STATUS, RESTARTS, NODE, AGE. `CrashLoopBackOff` = crashed and Kubernetes throttling restarts. `Pending` = hasn't scheduled — problem above container level (resources, taints, node affinity). RESTARTS > 0 → `--previous` logs essential.

**Step 2 — Read Events. Where most failures are diagnosed.**

```bash
kubectl describe pod <name> -n <ns>
```

Scroll to Events. Common failures found here and nowhere else: `FailedScheduling` (no nodes match), `ImagePullBackOff` (wrong image tag or missing pull secret), `Readiness probe failed` (app started but not healthy), `OOMKilled` (memory limit too low). Events clean and pod still broken → failure inside container — proceed to logs.

**Step 3 — Read current container logs.**

```bash
kubectl logs <name> -n <ns>
```

Look for stack traces, panics, config errors, "address already in use." Container crashed before writing logs → output sparse.

**Step 4 — Read last container's logs if pod restarted.**

```bash
kubectl logs <name> -n <ns> --previous
```

This is container that crashed. Exit reason usually at end of output. Always run if RESTARTS > 0.

**Step 5 — Read resource limits.**

```bash
kubectl get pod <name> -n <ns> -o yaml | grep -A8 resources
```

Confirm `requests` and `limits` both set. Pod with no `requests` gets lowest scheduling priority, can be evicted under pressure. Pod with no `limits` competes unrestricted for node memory. OOMKill is most common silent failure mode; pod restarting without clear log output → this is why.

**Step 6 — Exec only if steps 1–5 inconclusive.**

Document what you found (or didn't) in steps 1–5 before opening shell. Creates record, forces confirming no other path. Use minimal command — `ls`, `curl localhost:8080/health`, `env` — not open-ended shell session.

## Rollout Management

**Before rolling back, read history.**

```bash
kubectl rollout history deployment/<name> -n <ns>
```

Shows revision numbers and change causes (if `--record` used or annotations set). Know which revision you're rolling back to before issuing command. `kubectl rollout undo` without `--to-revision` goes to previous revision — may not be last known-good.

**Watch rollout status.**

```bash
kubectl rollout status deployment/<name> -n <ns>
```

`"successfully rolled out"` = new pods started and passed readiness probes. Does NOT mean application healthy — pod can pass shallow HTTP probe and still serve errors. After rollout, check actual error rate metrics. Don't declare success from rollout status alone.

**Detect stalled rollout.** Slow rollout and stalled one look identical for first few minutes. Read conditions:

```bash
kubectl get deployment <name> -n <ns> -o yaml | grep -A12 conditions
```

`Progressing` condition with reason `ReplicaSetUpdated` = moving. `Progressing` with reason `ProgressDeadlineExceeded` = stalled — rollout hasn't progressed in configured `progressDeadlineSeconds`. Then read new pods' Events (`kubectl describe pod`) to find blocker.

**Rolling back.**

```bash
kubectl rollout undo deployment/<name> -n <ns>                  # to previous revision
kubectl rollout undo deployment/<name> -n <ns> --to-revision=4  # to specific revision
```

Rollback is mitigation. Broken code still in repo. After rollback, create ticket — do not just redeploy same image.

## Resource Inspection Before Mutation

Read-before-write discipline made concrete.

**`kubectl diff` required before every apply.**

```bash
kubectl diff -f my-manifest.yaml
```

Read diff carefully. Additions `+`; removals `-`. Pay attention to: image tags changing, replica counts, resource limits, environment variables, volume mounts. Diff shows nothing you intended → stop — stale manifest or wrong namespace.

**Dry run for manifest validation.**

```bash
kubectl apply --dry-run=server -f my-manifest.yaml
```

Prefer `--dry-run=server` over `--dry-run=client`. Server-side dry run runs admission webhooks (OPA, Kyverno, pod security admission), catches more error classes. Client-side validates schema only.

**Save state before patching.**

```bash
kubectl get deployment <name> -n <ns> -o yaml > current-$(date +%Y%m%d-%H%M%S).yaml
```

Keep file until change confirmed working. Rollback target if `kubectl rollout undo` insufficient.

**`kubectl patch` vs `kubectl apply`.**

`kubectl apply` is declarative: reconciles full resource spec from manifest, including removing fields you omit. Use for normal GitOps-style delivery. `kubectl patch` is surgical: modifies one or few fields without touching rest. Use patch for emergency changes when full manifest apply cycle can't wait — but write change back to source manifest before shift ends, or cluster drifts from repo. Never use `kubectl edit` in production without saving current resource first — `kubectl edit` opens live YAML in editor, applies on save; editor exits unexpectedly → state unclear.

## RBAC Patterns

**Default to namespace scope.** `Role` + `RoleBinding` scopes permissions to one namespace. `ClusterRole` + `ClusterRoleBinding` grants cluster-wide. Almost never a reason application service account needs cluster-wide access. Start narrow; expand only when specific cross-namespace need proven.

**Common role templates.** Read-only (audit, dashboards): `verbs: ["get", "list", "watch"]` on pods/deployments/services/configmaps. Deployer (CD pipeline): `verbs: ["get", "list", "patch", "update"]` on deployments only, plus read-only on pods. Namespace-admin: all verbs on all resources in one namespace — no cluster-scoped resources.

**Audit permissions before assuming them.**

```bash
kubectl auth can-i --list -n production
```

Shows everything current identity can do in namespace. Run before assuming you have (or don't have) access — and before creating new roles, confirm capability doesn't already exist.

**Test service account permissions by impersonating.**

```bash
kubectl auth can-i create deployments \
  --as=system:serviceaccount:production:my-app-sa \
  -n production
```

Verify service account has exactly permissions needed, no more. Run both allow cases (should return `yes`) and deny cases (should return `no`).

**Never bind `cluster-admin` to application service accounts.** `cluster-admin` grants full cluster control including reading secrets, deleting namespaces, modifying RBAC. Application service account with `cluster-admin` = full cluster compromise if application exploited. Someone asks for `cluster-admin` for app → ask is wrong — find specific verb/resource actually needed.

## Namespace and Resource Management

**One namespace per trust boundary.** Team A's workloads and Team B's workloads don't belong in same namespace unless same RBAC, quota, network trust level. Sharing namespaces to "keep things simple" means any escalation in one team's service affects other.

**`ResourceQuota` prevents blast radius.** Apply quota to every production namespace. Without it, runaway deployment consumes all cluster CPU and memory, evicting unrelated workloads. Minimum: set `requests.cpu`, `requests.memory`, `limits.cpu`, `limits.memory`, `count/pods`. Exact values depend on cluster size — point is to have ceiling, not pick right number.

**`LimitRange` forces resource hygiene.** Without LimitRange, pods with no resource spec run successfully. With one, pods missing requests/limits get defaults — or are rejected. Prefer rejection model in production: pod without resource spec is pod you cannot reason about for capacity or eviction.

**Label discipline.** Consistent labels across all resources make selectors, dashboards, alert routing work. Minimum set: `app`, `version`, `environment`. Selectors on Services and NetworkPolicies immutable after creation — get right first time.

## Network Policies

**Start with default-deny.** Unconfigured namespace allows all pod-to-pod traffic. Apply deny-all baseline (`podSelector: {}`, `policyTypes: [Ingress, Egress]`) to every namespace on creation, then add explicit allow policies. Forces every communication path to be intentional and documented.

**DNS egress must be explicitly allowed.** Deny-all Egress blocks DNS (UDP/TCP 53). Add DNS egress allow rule to every namespace with deny-all — otherwise all hostname resolution breaks silently.

**Verify both sides after applying.** NetworkPolicy allowing traffic from pod A to pod B does not automatically allow response. Test deny cases:

```bash
kubectl exec <source-pod> -n <ns> -- curl --connect-timeout 3 <target-ip>:8080
```

Expect success for intended paths, timeout for blocked. Timeout taking 30 seconds → NetworkPolicy working but TCP backpressure slow — correct behavior, not hung test.

**Don't rely on namespace isolation alone.** Without NetworkPolicies, pod in namespace A reaches any pod in namespace B by IP. Namespace isolation is RBAC and management boundary, not network boundary. NetworkPolicies are network boundary.

## Common Anti-Patterns

- **No resource requests or limits.** Pods run unguarded, get evicted under node pressure, often taking down unrelated workloads alongside.
- **`latest` image tags.** No reproducibility, no rollback, no auditability. Every deploy may pull different image. Pin to SHA or immutable tags.
- **`cluster-admin` for app service accounts.** One compromised pod = full cluster compromise.
- **`kubectl apply` without `kubectl diff` first.** Deploying manifest you haven't confirmed matches intent.
- **`kubectl edit` without saving current state.** Edit goes wrong → no clean rollback target.
- **Debugging by `kubectl exec` before reading logs and Events.** Skipping two steps that solve 90% of pod failures. Exec creates runtime state changes obscuring original failure mode.
- **Ignoring Events section in `kubectl describe`.** Answer usually there. Read every time.
- **Declaring rollout successful from `kubectl rollout status` alone.** Pass readiness probe, still serving errors — status is deployment signal, not application health signal.
- **Shared namespaces across teams.** One team's runaway quota or permissive RBAC becomes everyone's problem.

# Helm Charts

Helm templates Kubernetes manifests, tracks release state, gives upgrade/rollback primitive Kubernetes itself doesn't provide. Helm's power comes with trap: chart source and deployed release can silently diverge. Someone ran `--set` at command line, didn't commit it. Previous upgrade failed mid-way, left cluster in partial state. CRD manually patched. **The chart is not the truth — the release is the truth.**

## Grounding First

Before touching anything, read deployed state. Not chart files. The release.

```
helm status <release> -n <namespace>       # deployed / failed / pending-upgrade?
helm history <release> -n <namespace>      # every revision; know your rollback target
helm get values <release> -n <namespace>   # values ACTUALLY running, including --set flags
helm get manifest <release> -n <namespace> # rendered YAML currently in the cluster
```

Can't read release state — cluster access unavailable, release doesn't exist yet → prefix analysis with `UNVERIFIED:`, state assumptions explicitly. Assumptions made without grounding are most expensive kind.

## Chart Structure

```
mychart/
  Chart.yaml        # chart metadata
  values.yaml       # default values — base only, no env-specific, no secrets
  templates/
    _helpers.tpl    # named template definitions (prefix _ prevents rendering)
    deployment.yaml
    service.yaml
    ingress.yaml
    NOTES.txt       # post-install stdout message
  charts/           # vendored subchart dependencies
```

**Chart.yaml required fields:**

```yaml
apiVersion: v2
name: myapp
version: 1.4.2       # chart version — bump on ANY chart change
appVersion: "3.7.1"  # application version being packaged — bump when app changes
```

`version` and `appVersion` independent. `version` advances for template fixes, new values, dependency updates. `appVersion` advances only when application image changes. Never skip bumping `version` — makes `helm history` unreadable, breaks traceability.

## Templating Best Practices

**Quote string values that could be numeric.** `{{ .Values.port | quote }}` prevents YAML coercing `"8080"` to integer. Coercion silent, causes confusing downstream errors.

**Default optional values.** `{{ .Values.foo | default "bar" }}` prevents empty strings in rendered manifests. Field required with no sane default → use `required "foo is required"` — fails loudly at render time, not silently at apply time.

**Use `include` over `template` for named templates.** `template` outputs directly to manifest stream, can't be piped. `include` returns string you can pipe through `trim`, `nindent`, `quote`.

**Use `toYaml` + `nindent` for value blocks.** Resources, tolerations, env vars, affinity rules should inject as value blocks:

```yaml
resources:
  {{- toYaml .Values.resources | nindent 10 }}
```

Works cleanly even when `.Values.resources` empty — `toYaml` of nil map produces `{}\n`.

**Keep template logic shallow.** `if/else` chain deeper than three levels belongs in `_helpers.tpl` or values structure itself. Complex template logic invisible to `helm diff` reviewers, untestable.

**Never put secrets in templates or values files.** Helm stores release state — including values — in Kubernetes Secrets, base64-encoded, not encrypted. Anyone with `kubectl get secret` in namespace can decode. Use `secretKeyRef` to reference pre-existing Secrets, or External Secrets Operator / Sealed Secrets for lifecycle management outside Helm.

## Values Hierarchy and Override Patterns

Helm merges values in defined order; later values win:

1. `values.yaml` — base defaults, committed with chart
2. `-f values-staging.yaml` / `-f values-prod.yaml` — environment overlays, passed at deploy time
3. `--set key=value` — one-off overrides at CLI

**Environment overlays belong outside chart repo.** Keep in GitOps repo or CI config. Committing environment overlays into chart creates tight coupling: production config changes require chart releases.

**`--set` is not configuration management.** Debugging escape hatch. Values passed with `--set` not tracked in files, not reviewable as diffs, easily forgotten. Next upgrade without that flag silently reverts value. Commit permanent config to appropriate overlay file.

## Read Release State Before Upgrading

Step most commonly skipped under time pressure — skipping causes most botched upgrades.

```bash
helm history <release> -n <ns>                             # know your rollback target first
helm get values <release> -n <ns>                          # what's actually deployed
helm diff upgrade <release> <chart> -f values.yaml -n <ns> # requires helm-diff plugin
```

`helm-diff` not optional: `helm plugin install https://github.com/databus23/helm-diff`. Read diff carefully — pay particular attention to **deletions**. Helm removes resources disappearing from chart, including PVCs if you restructure storage values carelessly.

`helm-diff` unavailable → use `helm upgrade --dry-run --debug`, compare against `helm get manifest`. More work, same information.

## Release Lifecycle

**Install:**
```bash
helm install <release> <chart> -f values.yaml --namespace <ns> --create-namespace
```

**Upgrade (idempotent — use in CI):**
```bash
helm upgrade --install <release> <chart> -f values.yaml \
  --namespace <ns> --atomic --wait --timeout 10m --cleanup-on-fail
```

`--atomic` rolls back automatically on failure — difference between release left in `pending-upgrade` (unrecoverable without manual intervention) and clean rollback to last good revision. Use in CI unconditionally.

`--wait` blocks until pods, PVCs, services ready. Required whenever downstream CI steps depend on release being healthy. Without it, CI reports success while pods still starting.

`--timeout` defaults to 5 minutes — too short for slow image pulls or large clusters. Set explicitly; `10m` safer default.

**Rollback:**
```bash
helm history <release> -n <ns>          # read first; know the target revision
helm rollback <release> <revision> -n <ns>
helm status <release> -n <ns>           # confirm deployed
kubectl rollout status deploy/<name> -n <ns>
```

**Uninstall:**
```bash
helm uninstall <release> -n <ns>
```

`helm uninstall` does NOT delete PersistentVolumeClaims — Helm protects data by default. Delete PVCs manually after confirming backup or genuinely unneeded.

## Upgrade and Rollback Hygiene

**CRDs not upgraded by `helm upgrade`.** Helm installs CRDs on first install, deliberately skips on upgrade to avoid destroying existing custom resources. New chart version changes CRD schemas → apply CRD manually: `kubectl apply -f crds/`. Forgetting causes silent incompatibility between chart version and running CRDs.

**Rollback does not re-run hooks by default.** Chart has pre/post hooks (migrations, config bootstraps) → rollback skips them. Add `--force` if hook re-execution required — but understand what hooks do first. Migration hook run against already-migrated schema may corrupt data.

**`--cleanup-on-fail` prevents resource leak.** Without it, resources created during failed upgrade — new ConfigMaps, Secrets, CRDs — remain, can block future upgrades.

## Helm Test Patterns

```bash
helm test <release> -n <ns>
```

Test pods carry annotation `helm.sh/hook: test`, run to completion. Helm reports pass/fail on exit code. Use for cluster-local smoke tests: can app reach database? Does healthcheck return 200? Is expected config key present? Do not use Helm tests for load tests or full integration suites — promotion gates, not test suites.

## Common Anti-Patterns

- **Hardcoded image tags in templates** — defeats values overrides; every update requires chart change.
- **Secrets in values files** — base64 is not encryption; use `secretKeyRef` or external secrets operator.
- **No resource limits** — one misbehaving pod can starve all neighbors on node.
- **`helm upgrade` without `helm diff` or `--dry-run`** — cannot know what will change without seeing it first.
- **Missing `--wait` when downstream depends on release** — produces flaky failures looking like application bugs.
- **`--set` for permanent config** — not tracked, not reviewable, silently reverted on next upgrade.
- **Not bumping `version` on chart changes** — `helm history` useless; multiple states share one version number.

## Related

- [kubernetes-operations.md](kubernetes-operations.md) — k8s resources Helm renders into; use this reference to understand what Helm release actually creates in cluster
- [cicd-pipelines.md](cicd-pipelines.md) — Helm in CI/CD pipelines: lint/diff gates on PRs, `helm upgrade --install --atomic` on merge, environment promotion patterns
- `security-and-hardening` — External Secrets Operator, Sealed Secrets, supply-chain security for Helm charts and container images

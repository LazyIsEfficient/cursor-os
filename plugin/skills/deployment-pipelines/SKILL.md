---
name: deployment-pipelines
description: Authoring or reviewing CI/CD pipelines — GitHub Actions workflows, reusable workflows, composite actions, OIDC federation to AWS/GCP, caching, artifacts, pipeline security hardening. Use when touching pipeline definitions. Triggers on edits to .github/workflows/**, action.yml, composite action definitions, and mentions of "CI", "CD", "pipeline", "GitHub Actions", "workflow", "OIDC", "runner", "deploy script", "build pipeline". Not when "release" means coordinating the release itself (CHANGELOG, version tag, comms) vs pipeline YAML — use release-manager.
---

# Deployment Pipelines

You are operating as infrastructure engineer with CI/CD lens. Pipelines are production code: untrusted inputs (PRs, third-party actions, package registries) flow through privileged contexts. Default to least privilege, pinned versions, fast-fail behavior over convenience.

Currently implemented on **GitHub Actions** with OIDC federation to AWS and GCP — no long-lived credentials. Workflows live in `.github/workflows/`. Reusable workflows and composite actions versioned alongside repos that consume them.

## Universal Rules

### Security
1. **No long-lived secrets** — use OIDC to assume cloud roles. AWS access keys in repo secrets are a bug.
2. **Pin third-party actions to full commit SHA**, not tag. Tags mutable; SHAs not. `actions/*` from GitHub itself may use `@vN`.
3. **Default `permissions: {}`** at workflow level, then grant minimum each job needs (`contents: read`, `id-token: write`, etc.). Never rely on org default.
4. **Never `pull_request_target` with checkout of PR code** unless you fully understand privilege escalation. Default to `pull_request`.
5. **Mask and never echo secrets.** No `env:` dumps in debug steps.
6. **Restrict who can approve deploys** via environment protection rules, not branch rules alone.
7. **No inline scripts interpolating untrusted input** (`${{ github.event.issue.title }}` in `run:`) — write value to env var first.

### Reliability
1. **Pin runner OS** (`ubuntu-24.04`, not `ubuntu-latest`) for any pipeline whose stability matters.
2. **Set `timeout-minutes`** on every job. Default `360` is hung-runner trap.
3. **Use `concurrency` groups** to cancel superseded runs on same ref.
4. **Fail fast on lint/type errors** before expensive tests.
5. **Cache deterministically** — lockfile-derived keys, never date-based.
6. **Idempotent deploys** — re-running same workflow on same SHA must be safe.

### Maintainability
1. **One responsibility per workflow file** — `ci.yml`, `deploy-staging.yml`, `release.yml`. Not one mega-workflow with conditionals.
2. **Reusable workflows** (`workflow_call`) for shared logic across repos. Composite actions for shared steps within repo.
3. **No copy-pasted YAML across jobs** — extract to composite action or matrix.
4. **Pin action versions in one place** when possible (e.g., `versions.env` file or Dependabot grouping).
5. **Treat workflows like code**: reviewed, tested (act / branch deploys), refactored.

### Cost
1. **Path filters** (`paths:` / `paths-ignore:`) so doc-only changes don't trigger full CI.
2. **Cancel-in-progress** for pull request runs.
3. **Right-size runners** — no 1-minute lint job on 16-core runner.
4. **Cache aggressively** but invalidate on lockfile changes.

## Tier discipline

Pipeline diff reviewed under `evidence-review-tiers` rule. Red workflow run is Tier 0. Permissions or unpinned-SHA finding is Tier 1 only when you point at exact line and escalation path it enables; bare "this looks risky" is Tier 2 and belongs in [findings-ledger](../findings-ledger/SKILL.md). Pipeline diffs touching OIDC, secrets, or `pull_request_target` always warrant parallel readonly [security-reviewer](../../agents/security-reviewer.md) Task.

## References

- [references/workflow-structure.md](references/workflow-structure.md) — file layout, triggers, jobs, matrices, reusable workflows, composite actions, when to split workflows
- [references/oidc-and-secrets.md](references/oidc-and-secrets.md) — OIDC federation to AWS and GCP, trust policies, secret scoping, environment protection
- [references/security-hardening.md](references/security-hardening.md) — pinned SHAs, permissions defaults, untrusted input handling, `pull_request_target` pitfalls, supply-chain review
- [references/caching-and-artifacts.md](references/caching-and-artifacts.md) — `actions/cache` keys, restore-keys, artifact retention, build cache strategies
- [references/performance-and-cost.md](references/performance-and-cost.md) — concurrency groups, path filters, runner sizing, parallelization, fail-fast
- [references/debugging.md](references/debugging.md) — tmate, debug logging, `act` for local runs, common failure modes, re-run from failed step
- [references/deploy-patterns.md](references/deploy-patterns.md) — preview vs deploy, environment promotion, rollback strategy, deploy gates, OIDC role assumption examples

## Related skills

- [security-engineering](../security-engineering/SKILL.md) — pipeline security review, supply-chain hardening, secret-handling rules
- [release-manager](../release-manager/SKILL.md) — coordinates release itself (CHANGELOG, version tag, stakeholder comms) once pipeline authored

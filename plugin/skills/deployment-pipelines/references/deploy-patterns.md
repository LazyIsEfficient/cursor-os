# Deploy Patterns

How code goes from merged PR to running in production.

## Environment Promotion

```
PR merged → staging (auto) → production (manual approval / tag)
```

Each environment is GitHub **Environment** with:
- Required reviewers (for prod)
- Wait timer (for prod, optional cool-off)
- Branch / tag restrictions
- Environment-scoped secrets and OIDC roles

```yaml
jobs:
  deploy-staging:
    if: github.ref == 'refs/heads/main'
    environment: staging
    ...

  deploy-production:
    needs: deploy-staging
    environment: production    # gated by reviewers
    ...
```

## Preview vs Apply (IaC pattern)

For Pulumi / Terraform:

```yaml
preview:
  if: github.event_name == 'pull_request'
  steps:
    - uses: pulumi/actions@<sha>
      with:
        command: preview
        stack-name: org/staging
        comment-on-pr: true        # diff posted as PR comment

deploy:
  if: github.ref == 'refs/heads/main'
  environment: staging
  steps:
    - uses: pulumi/actions@<sha>
      with:
        command: up
        stack-name: org/staging
```

PR sees diff before merging. Deploy on main applies it. **Never `up` without a `preview` somewhere upstream.**

## Deploy Gates

Things that should block deploy:
- All required checks green
- Required reviewers approved
- Linked tickets in right state (optional, via custom check)
- Recent incident on target environment (optional, via status page check)
- Off-hours window for high-risk deploys (optional, via wait timer)

## Rollback Strategy

Pick **one** rollback story per system, document it:

| Strategy | When |
|---|---|
| **Re-deploy previous tag** | Stateless services. Fast, clear. |
| **Forward fix only** | Database migrations, schema changes. Roll forward to a hotfix. |
| **Blue/green swap** | Zero-downtime infra. Most expensive operationally. |
| **Feature flag off** | When the change is gated. Fastest rollback. |

Workflow that deploys must also support rollback. Deploy you can't undo is a bug.

## OIDC Role Per Environment

```yaml
deploy:
  environment: production
  permissions:
    id-token: write
    contents: read
  steps:
    - uses: aws-actions/configure-aws-credentials@<sha>
      with:
        role-to-assume: arn:aws:iam::ACCOUNT:role/gh-deploy-prod
        role-session-name: gh-${{ github.run_id }}
        aws-region: us-east-1
```

Each environment uses separate IAM role with separate trust policies. Bug in staging workflow cannot deploy to production.

## Idempotency

Re-running same deploy on same SHA must be safe:
- IaC tools (Pulumi/Terraform) idempotent by design.
- Container deploys: tag images by commit SHA, not `latest`. Re-deploying = re-applying same task definition.
- Migrations: always forward, idempotent (`CREATE IF NOT EXISTS`, transactional, versioned).

## Anti-Patterns

- **Auto-deploy to production on merge to main.** No protection rules, no human gate. One merged bad PR = one outage.
- **Deploy step that builds the artifact.** Build once in CI, deploy same artifact to staging and prod. Building per-environment introduces drift.
- **Manual deploy steps in runbook.** Scriptable → script it. Runbooks for incidents, not normal deploys.
- **No rollback path.** "We'll figure it out if it breaks" is how 2-hour outages become 8-hour outages.
- **Same role for all environments.** Staging compromise must not pivot to prod.
- **Tag-mutable image references** (`myapp:latest`). Pin to immutable digests or commit SHAs.

## Health Checks Post-Deploy

Every deploy workflow should:
1. Apply change
2. Wait for new version to come up (rolling, blue/green, etc.)
3. Hit health endpoint or run smoke test
4. Roll back automatically on failure (or alert deployer)
5. Post status to team channel

Deploy that "succeeded" but left service unhealthy is worse than deploy that failed loudly.

# OIDC and Secrets

Long-lived cloud credentials in CI are a liability. OIDC federation lets workflow assume cloud role for duration of single run, with claims about repo, branch, environment baked into trust policy.

## OIDC to AWS

### Trust Policy (provisioned via infrastructure-as-code, out of scope for this skill)

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::ACCOUNT:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:org/repo:environment:production"
      }
    }
  }]
}
```

Critical: scope `sub` as **narrowly as possible**:
- `repo:org/repo:ref:refs/heads/main` — only main branch
- `repo:org/repo:environment:production` — only when prod environment in use
- `repo:org/repo:pull_request` — for PR validation
- **Avoid** `repo:org/repo:*` — grants any branch / PR / tag.

### Workflow Side

```yaml
permissions:
  id-token: write       # required to mint the OIDC token
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-24.04
    environment: production    # gates the run AND binds OIDC sub
    steps:
      - uses: actions/checkout@<sha>
      - uses: aws-actions/configure-aws-credentials@<sha>
        with:
          role-to-assume: arn:aws:iam::ACCOUNT:role/gh-deploy-prod
          aws-region: us-east-1
      - run: aws sts get-caller-identity
```

## OIDC to GCP (Workload Identity Federation)

```yaml
- uses: google-github-actions/auth@<sha>
  with:
    workload_identity_provider: projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL/providers/PROVIDER
    service_account: deploy@PROJECT.iam.gserviceaccount.com
```

Same rules: scope provider's attribute condition to specific repos / branches / environments.

## Repository / Environment Secrets

When genuinely needing a secret (third-party API key, signing key):

- **Environment secrets** > repo secrets > org secrets. Smaller scope = smaller blast radius.
- **Environment protection rules**: required reviewers, wait timers, branch restrictions.
- **Never read secrets in `pull_request` workflows from forks** — GitHub correctly withholds them; ensure workflow doesn't `pull_request_target` around it.
- **Rotate on schedule** and on every contributor offboarding.

## Anti-Patterns

- **AWS access keys in repo secrets** for any account touching production.
- **`AWS_*` env vars set at workflow level** — leak into every step, including ones running untrusted code.
- **Re-using one IAM role for all environments** — bug in dev must not touch prod.
- **`if: github.actor == 'someone'`** as authz check — actor spoofable in some contexts; use environment protection rules.
- **Echoing OIDC token** for "debugging". It's a credential.
- **Wide `sub` claims** like `repo:org/repo:*` — defeats point of OIDC.

## Verification Checklist

Before merging workflow touching cloud:
- [ ] Uses OIDC, not access keys
- [ ] `sub` claim scoped to exact ref / environment
- [ ] `id-token: write` granted at job level, not workflow level
- [ ] `environment:` set on deploy jobs with protection rules
- [ ] Role grants least-privilege IAM (not `*`)
- [ ] No secrets logged or echoed

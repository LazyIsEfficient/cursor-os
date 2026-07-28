# Pulumi IaC Reference

> **Grounding rule (read first):** Before every `pulumi up`, run `pulumi preview`, read output in full. Before touching existing stack, run `pulumi stack output` and `pulumi state export` to understand what is deployed. Mark any stack state not personally read as `UNVERIFIED:`. Not optional hygiene — only way to know what you are about to change.

For resource-specific patterns (VPC, RDS, ECS, secrets, IAM, Cloudflare) see `cloud-infrastructure`. This reference covers Pulumi workflow, state, TypeScript mechanics.

---

## 1. Project Structure [Assumed: TypeScript — say if wrong]

```
my-stack/
├── Pulumi.yaml            # project name, runtime: nodejs, description
├── Pulumi.dev.yaml        # stack-specific config for dev (non-secret values)
├── Pulumi.prod.yaml       # stack-specific config for prod
├── index.ts               # entry point — keep thin; delegate to modules/
├── package.json           # pin @pulumi/pulumi and every provider version explicitly
└── tsconfig.json          # strict: true recommended; moduleResolution: node
```

`pulumi new typescript` for bare scaffold; `pulumi new aws-typescript` for AWS-wired scaffold. Pin provider versions — `"@pulumi/aws": "*"` silently breaks on next major provider release. `index.ts` should read config and export outputs only; resource logic belongs in `./modules/`.

---

## 2. Stack Management

```bash
pulumi stack init dev          # create a stack; one per environment
pulumi stack select prod       # switch stacks — verify the asterisk before preview/up
pulumi stack ls                # list stacks; confirm active stack
pulumi stack output            # read exported outputs from current stack
pulumi config get <key>        # read a config value for the active stack
pulumi config set <key> <val>  # write into Pulumi.<stack>.yaml
```

**One stack = one environment.** Sharing stack between dev and prod collapses isolation boundary. Misconfigured `stack select` then only thing standing between dev change and production — not a guard, a trap.

---

## 3. Preview Discipline

**`pulumi preview` required before every `pulumi up` — no exceptions.**

```bash
pulumi preview                       # always
pulumi preview --diff                # property-level diff when output is ambiguous
pulumi preview --expect-no-changes   # assert no drift in CI
```

| Symbol | Meaning | Risk |
|--------|---------|------|
| `+`    | Create  | Low |
| `~`    | Update  | Medium — verify the property changing |
| `+-`   | Replace | **High — destroyed and recreated** |
| `-`    | Destroy | **High — deleted** |

Pulumi replaces resource when immutable property changes — RDS `identifier`, ECS task `family`, Cloudflare `zone_id`. Seeing `+-` → use `pulumi preview --diff` to find offending property, confirm recreation intentional. Replacements of stateful resources cause downtime.

**Never skip preview because "it's a small change."** One-line rename of RDS instance triggers replace destroying database. Blast radius of unexpected replacement does not scale with diff size.

For existing stacks, read current state before writing new resources:
```bash
pulumi stack output && pulumi state export > state.json
```
Cannot read stack state → mark every assumption `UNVERIFIED:`.

---

## 4. State Hygiene

Pulumi state is authoritative record of what program believes is deployed. Treat as sacred.

```bash
pulumi refresh                          # sync state with actual cloud reality
pulumi state export > state.json        # backup before any risky operation
pulumi import <type> <name> <cloud-id>  # adopt existing resources into state
pulumi state move <urn> <dest-stack>    # move resource between stacks (advanced)
pulumi state delete <urn>               # remove from state only; does not destroy in cloud
```

Run `pulumi refresh` before risky operations — out-of-band changes (console, CLI, another tool) leave state stale, produce phantom diffs. `pulumi state delete` is last resort for resources already gone from cloud; using on live resource orphans it permanently. Never recreate existing database to bring under Pulumi — use `pulumi import`. Never manually edit state JSON; format has internal consistency requirements manual edits silently violate.

---

## 5. Resource Protection

```typescript
const db = new aws.rds.Instance("prod-db", { ... }, {
  protect: true,        // pulumi up errors on any attempted destroy
  retainOnDelete: true, // removed from state but not deleted in cloud
});

const svc = new aws.ecs.Service("api", { ... }, {
  ignoreChanges: ["desiredCount"], // autoscaler manages this field externally
});
```

Always comment why protection flag set. `protect: true` without context reads as mistake, will be removed. Write: `// protect: true — prod RDS; accidental replace = data loss + downtime`.

---

## 6. Secret Management

```bash
pulumi config set --secret DB_PASSWORD <value>  # encrypted in Pulumi.<stack>.yaml
```

```typescript
const config = new pulumi.Config();
const pwd = config.requireSecret("DB_PASSWORD"); // Output<string>, redacted in logs
const marked = pulumi.secret(computedValue);     // mark any Output as secret
```

Never hardcode secrets in `index.ts` or committed config files. Never `console.log` secret Output — appears verbatim in CI logs. Use `.requireSecret()`, not `.require()` — former returns redacted `Output<string>`; latter leaks value as plain string.

---

## 7. TypeScript Patterns [Assumed: TypeScript]

`pulumi.Output<T>` resolves at deployment time, not program evaluation time. Treating as plain value is most common Pulumi TypeScript mistake.

```typescript
// WRONG — produces "[Output<string>]"
const url = `https://${bucket.bucketName}/path`;

// RIGHT
const url = pulumi.interpolate`https://${bucket.bucketName}/path`;
const upper = bucket.bucketName.apply(n => n.toUpperCase());
const combined = pulumi.all([a.id, b.arn]).apply(([id, arn]) => `${id}:${arn}`);
```

Never call `.toString()` on Output — TypeScript permits but result always object's internal string, never cloud value.

`ComponentResource` is abstraction for reusable modules. Child resources declared with `{ parent: this }` appear nested in `pulumi preview`, inherit `protect: true` from parent — use for logical groupings like "ECS service plus task definition plus IAM role."

---

## 8. Anti-Patterns

| Anti-pattern | Failure mode |
|---|---|
| `pulumi up` without preview | Blind replacements and destroys |
| Hardcoded secrets in code | Credentials in git history forever |
| Shared stack across environments | Wrong-env deploy on `stack select` mistake |
| Unpinned provider versions | Silent breaking changes on `npm install` |
| Manual state JSON edits | Corrupted state, phantom resources |
| Ignoring `+-` replacements | Unplanned downtime for stateful resources |
| `.toString()` on Output | Silently wrong config passed to resources |
| No `protect: true` on databases | A single typo deletes production data |
| Skipping `pulumi refresh` | Phantom diffs from out-of-band changes |

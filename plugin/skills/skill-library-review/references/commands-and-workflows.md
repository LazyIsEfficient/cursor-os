# Commands and Workflows

Two artifact types beyond skills + agents. Both have frontmatter loader
keys off, but bodies *executable* — command body is prompt harness runs,
workflow body is JS program. Review for what they actually do, not just
how described.

## Slash commands (`.claude/commands/*.md`)

Command = markdown file: YAML frontmatter, then prompt body harness
runs when user types `/<name>`. Filename = command name.

### `description` — required

- One line, shown in `/help`. Same third-person, WHAT+WHEN posture as skill
  description, but shorter — menu entry, not routing surface.
- Missing or empty → **blocking** (command invisible in `/help`).

### `argument-hint` — required when body consumes args

- Body addresses arguments as `$ARGUMENTS` (all of them) or `$1`, `$2`
  (positional). Body uses any of these → `argument-hint` must be present
  so `/help` shows user what to pass — e.g. `argument-hint: <skill-name>`.
- Body uses `$1`/`$ARGUMENTS` but no `argument-hint` → **should-fix**.
- `argument-hint` present but body never references argument →
  **should-fix** (hint promises input command ignores).
- Hint should name what body actually reads. Hint of `<skill-name>`
  while body validates `$1` as kebab-case = coherent; hint naming
  different shape than body parses = finding.

### `allowed-tools` — minimal and sufficient

- Lists tools command body permitted to invoke. Must cover what
  body actually does, nothing more.
- **CRITICAL — dispatch tool name is platform-specific.** This repo's `.claude/commands/` run on **Claude Code** only (not shipped on Cursor). There subagent-spawn tool is **`Agent`** (see agent `tools:` fields + [tool-allowlists.md](tool-allowlists.md)). `allowed-tools` listing `Task` instead of `Agent` = **blocking** finding for Claude Code command — body's "dispatch via Agent" step silently fails. On **Cursor**, consumer orchestration uses **`Task`** tool instead; do not flag `Task` in Cursor-only docs as defect.
- Body dispatches subagent on Claude Code but `allowed-tools` omits `Agent` → **blocking**
  (dispatch can't run).
- Body writes file but `allowed-tools` omits `Write`/`Edit` → **blocking**.
- `allowed-tools` lists tool body never uses → **should-fix** (over-broad
  grant; trim to what body invokes).
- Command whose body says "run the workflow via the `Workflow` tool" must list
  `Workflow`; one that greps for collisions must list `Glob`/`Grep`.

### Body coherence

- Every `$1`/`$ARGUMENTS` hint promises must be used; every tool body
  invokes must be in `allowed-tools`. Body = source of truth — review
  frontmatter *against* it, not in isolation.

## Workflows (`.claude/workflows/*.js`)

Workflow = JS program `Workflow` tool runs. Declares `meta`
object, calls harness hooks: `phase()`, `agent()`, `pipeline()`,
`parallel()`, `log()`.

### `export const meta` — pure literal

- `meta` MUST be plain object literal — `name`, `description`, `phases` set to
  literal strings/arrays. No variables, function calls, template interpolation,
  computed keys. Harness reads `meta` *statically* to register
  workflow; non-literal value (`name: SOME_CONST`, `phases: buildPhases()`)
  can't be read before execution → **blocking**.
- `meta.name` must match how workflow invoked (command running it
  passes `name: "<this>"` to `Workflow` tool, filename matches).
  Mismatch = silent misroute — **blocking**.
- `meta.phases[].title` should line up with phases body actually runs.
  Phase counts as *entered* if body reaches it **either** via top-level
  `phase("X")` marker **or** via `{ phase: "X" }` option on `agent()` /
  `pipeline()` / `parallel()` stage call (per-stage phase assignment =
  deliberate pattern — stage agent bounds own phase, so no top-level
  `phase()` call exists for it). Phase declared in `meta` but entered by
  *neither* mechanism (or phase entered in body but absent from `meta`) =
  **should-fix** — declared shape lies about run. Grep body for
  both `phase("X")` + `phase: "X"` before flagging.

### `node --check` must pass

- File must parse: `node --check .claude/workflows/<name>.js`. Syntax
  error → **blocking** (workflow won't load). Run it; don't eyeball.

### Schema-validated `agent()` outputs

- `agent(prompt, { schema })` validates agent's JSON output against
  `schema`. Downstream code may then read **only** fields schema
  guarantees (`required` + declared `properties`). Reading field schema
  doesn't declare (`result.foo` where `foo` not in `properties`) =
  **should-fix** — `undefined` at runtime, schema won't catch it.
- `required` field always present; optional one may be absent — guard
  before deref. Dereferencing non-required field without guard → **should-fix**.

### Determinism

- Labels passed to `agent()` should be unique, derived from stable inputs
  (index, skill slug), not `Date.now()`/`Math.random()` — nondeterministic
  labels make runs hard to compare. Random/time-based labels → **nit**.

## What is NOT a finding

- Command with no `argument-hint` whose body genuinely takes no arguments —
  correct, not incomplete.
- Workflow `phase()` whose title paraphrases (not exact-matches) `meta`
  title, as long as sequence corresponds. Demand correspondence, not
  string equality.
- `meta` phase with no top-level `phase("X")` call but IS entered via
  `{ phase: "X" }` option on stage `agent()`/`pipeline()`/`parallel()` call —
  correct (per-stage phase assignment), not missing phase.
- `allowed-tools` looking broad but every listed tool actually invoked
  somewhere in body. Verify against body before flagging over-grant.

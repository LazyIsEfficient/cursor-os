# Plugin loading verification (operator-run)

Two of this repository's unverified claims — manual Editor installation and
component loading, and live plugin loading through the installed CLI — cannot be
settled by any automated check that runs in CI. Both require an operator with a
real Cursor installation and, for the CLI, real credentials.

**These scripts do not verify either claim on their own.** They are the tooling
an operator runs to capture evidence. Until an operator runs them and a
maintainer reviews the resulting artifacts, both claims stay in the unverified
list in `README.md` and unverified in
[the capability matrix](cursor-capability-matrix.md).

## 0. Collisions with an existing `~/.cursor`

Most install friction appears only when the operator already has global
agents, rules, and hooks — the common case for an experienced Cursor user. The
documented `plugins/local` symlink and Marketplace install both **add** plugin
surfaces; neither rewrites the operator's existing global tree.

### Agent and rule name collisions — precedence UNVERIFIED

Seventeen plugin agents total; **all except `capability-probe`** may collide with
names under a user's global `~/.cursor/agents/`. Among rules,
`factual-correctness.mdc`, `communication.mdc`, `grounding.mdc`, and
`memory-discipline.mdc` collide with common global doctrine filenames; plugin
Pattern 3 rules use different names (`orchestrator-first`,
`evidence-review-tiers`, `actual-diff-verification`).

**This repository does not claim a Cursor precedence rule** (plugin shadows
global, global shadows plugin, or both appear). A repo-wide search finds no
proven merge semantics, and inventing one would be worse than saying so.
**UNVERIFIED — operator must confirm** which definition runs when names
collide. Practical check: invoke `capability-probe` and expect exactly
`cursor-harness-agent-discovered`. Prefer that over assuming a colliding name
such as `engineer` or `security-reviewer` resolved to the plugin copy.

### Retiring stale `~/.cursor/agents` and `~/.cursor/rules`

The plugin symlink (`~/.cursor/plugins/local/cursor-harness` → this repo's
`plugin/`) already exposes current agents, skills, and rules on disk. A
reinstall is not required after pulling `main`.

To retire older global copies (once the plugin has full domain parity):

1. Confirm the symlink points at this checkout's `plugin/`.
2. Restart Cursor so Task rediscovers plugin agents.
3. Probe: dispatch `capability-probe` and confirm `cursor-harness-agent-discovered`.
4. Spot-check a formerly global-only agent (e.g. `devops-engineer` or
   `marketer`) via `Task` with that `subagent_type`.
5. Archive then remove `~/.cursor/agents` and `~/.cursor/rules` only after those
   checks pass. Precedence remains UNVERIFIED — do not delete before probing.
6. Avoid re-running agentic-os `install-cursor.sh` afterward, or it will
   recreate `~/.cursor/agents` and reintroduce collisions.

Agent renames are deliberately out of scope for documentation-only fixes: the
blast radius across dispatch, inventory, tests, and operator muscle memory is
high until a Tier 0 validator or product requirement forces them.

### Hooks stack (they do not replace yours)

`plugin/hooks/hooks.json` registers hooks under events an experienced user
often already uses. Cursor hook configuration is an array of definitions per
event; plugin hooks **add alongside** existing user hooks rather than
replacing them. Operator reproduction on a pre-existing `~/.cursor` observed
additive stacking (an additional `beforeShellExecution` entry and a duplicate
`sessionStart` injector). Exact editor merge priority beyond "additive arrays"
remains editor-only / not proven by this repository's automated checks — see
[the capability matrix](cursor-capability-matrix.md).

Concrete plugin consequences:

- **`beforeShellExecution`** — one command hook,
  `node "${CURSOR_PLUGIN_ROOT}/scripts/before-shell-execution.mjs"`, with
  `timeout: 5` and `failClosed: true`. If that hook errors, times out, or
  returns invalid output, Cursor is configured to **deny** the shell command.
  Stacked on top of any user `beforeShellExecution` hooks, it therefore gates
  every shell command after install when it fails closed.
- **`sessionStart`** — two injectors (session-state and memory-index). If the
  user already injects session state at `sessionStart`, context can be injected
  twice.
- **`preCompact` / `stop`** — advisory and fail-open; still additive.

This document does not redesign the guard or make hooks opt-in. It warns so
operators can predict the post-install shell and session behavior.

### Local symlink discovery is on-disk only until attested

The README's `~/.cursor/plugins/local/cursor-harness` symlink:

- does **not** write `~/.cursor/plugins.json`;
- is visible to `npm run plugin:editor:verify` as
  `installation.source: "local-symlink"` with
  `registeredInPluginsJson: false` when no registry entry exists;
- establishes `componentsInstalledOnDisk` only when every loadable inventory
  component matches by SHA-256;
- leaves `editorComponentLoading` as `not-proven` (script exit `3`) until an
  operator supplies a transcript containing the `capability-probe` sentinel.

Whether Cursor discovers local plugins by directory scan, by `plugins.json`,
or by both is **not proven** in this repository. Do not treat a successful
symlink `ls` — or even a matching on-disk inventory — as evidence the Editor
loaded the plugin. Put the transcript / `capability-probe` step in the install
flow (see both README Installation sections), then re-run with `--transcript`.

The temporary lifecycle adapter (`scripts/lib/local-install-adapter.mjs`) is a
different path: it mutates an **explicit non-user** Cursor root and does write
`plugins.json`. It refuses the real `~/.cursor`. Do not confuse lifecycle
evidence with Editor symlink install.

## 1. Editor component loading

```sh
npm run plugin:editor:verify -- --evidence /absolute/path/to/editor-evidence.json
```

Options:

| Option | Meaning |
| --- | --- |
| `--cursor-home <absolute path>` | Cursor home to read. Defaults to `~/.cursor`. |
| `--transcript <absolute path>` | A saved Editor transcript to scan for the `capability-probe` sentinel. |
| `--evidence <absolute path>` | Where to write the JSON artifact. Must be outside the Cursor home. |

### This script is strictly read-only

It only reads paths under the Cursor home. It never creates, writes, or removes
anything there, and it will **not** create the local-development symlink
described in `README.md`. If the plugin is not installed, it fails and tells you
what to do; creating the install is your decision to make by hand, per the
repository's standing design property that it never writes `~/.cursor`.

The check `a successful run leaves the Cursor home byte-for-byte unchanged` in
`tests/plugin-loading/editor-loading.test.mjs` enforces this.

### What it can and cannot show

It reads the installed component tree and compares every agent, command, rule,
and skill against `plugin/.cursor-plugin/inventory.json` by SHA-256. That
establishes `componentsInstalledOnDisk`.

On-disk presence is **not** loading. No file the script can read proves the
Editor parsed, listed, or invoked anything. So `editorComponentLoading` reports
`not-proven` unless you supply a transcript, and the script exits `3` rather
than `0` so that the exit status says the same thing the artifact does.

To go further (this confirmation belongs in the install flow, not only here):

1. Install the plugin in Cursor (Settings → Customize → Plugins), or create the
   local-development symlink yourself.
2. Invoke the `capability-probe` agent in the Editor. It is defined to respond
   with exactly `cursor-harness-agent-discovered`. Prefer this over a colliding
   global agent name when confirming load.
3. Save that transcript and re-run with `--transcript`.

Without that transcript, a matching symlink install still exits `3` with
`registeredInPluginsJson: false` and `editorComponentLoading: not-proven`. The
claim then reports `operator-attested` only after the transcript digest is
recorded. That is an operator attestation — a human vouching for a capture —
not an automated observation, and the artifact says so.

### Exit codes

The artifact has always been honest about what was proven, but exit status is
what a CI job or a reviewer skimming a run actually reads. A run that exits 0
while its own artifact reports `not-proven` reads as "verified" when nothing
was verified, so the two signals are kept in step:

| Exit | Meaning | `editorComponentLoading.status` |
| --- | --- | --- |
| `0` | Install matches the inventory **and** the loading claim is satisfied. | `operator-attested` (or a future genuinely observed state) |
| `1` | Hard failure. No Cursor home, plugin not installed, a component does not match the inventory, a bad argument, or an `--evidence` path that resolves inside the Cursor home. Nothing was established. | artifact not produced |
| `3` | Install matches the inventory, but the loading claim is unproven. Re-run with `--transcript` to settle it. | `not-proven` |

`1` and `3` are deliberately distinct: "your install is broken" and "your
install is fine but loading is unproven" are different operator situations and
must not collapse into one signal. On `3` the artifact is still written and
still printed — the `componentsInstalledOnDisk` observation in it is real.

An unrecognised status is treated as unproven rather than as a pass, so a
future claim state cannot exit 0 by accident.

Exit code `2` is unused here; `scripts/local-install.mjs` already uses it for a
usage error and overloading the number across the repository would be worse
than skipping it.

## 2. Live CLI plugin loading

```sh
npm run plugin:cli:verify -- \
  --cursor-config-template /absolute/path/to/protected/template \
  --evidence /absolute/path/to/cli-evidence.json
```

Options:

| Option | Meaning |
| --- | --- |
| `--cursor-config-template <absolute path>` | Required. Protected, pre-authenticated Cursor config template. |
| `--agent-bin <name\|path>` | Cursor CLI binary. Defaults to `agent`. |
| `--plugin-dir <absolute path>` | Plugin directory to load. Defaults to `<repo>/plugin`. |
| `--evidence <absolute path>` | Where to write the JSON artifact. |
| `--timeout-ms <integer>` | Per-invocation timeout. Defaults to `180000`. |

### Authentication

This follows the repository's existing authenticated-run contract. API keys are
never accepted through environment variables or arguments; credential-shaped
options such as `--api-key` are refused outright. You supply an absolute path to
a protected, pre-authenticated config-template directory that lives outside
every workspace and outside this repository.

Before the probe invocation, the script calls `runCursorAuthenticationPreflight`
from `benchmark/lib/auth-preflight.mjs` — the same helper `benchmark/run.mjs`
uses. An expired or malformed template therefore fails with that diagnosis
rather than as an opaque `exited 1` from the main invocation.

The script then copies the template into a fresh temporary config home created
with mode `0700`, isolates `HOME`, `XDG_CONFIG_HOME`, and `CURSOR_CONFIG_DIR`,
and runs the CLI under `--sandbox enabled`.

That temporary home holds a copy of your credentials, so it is removed both in a
`finally` block and from `SIGINT`/`SIGTERM`/`SIGHUP` handlers. A `finally` block
alone does not unwind when the process dies from a default-disposition signal,
and Ctrl-C on a long-running interactive run is routine. The handlers remove the
directory synchronously, then re-raise the signal so the exit status still
reflects it.

### What counts as evidence

Component names are matched **only against `assistant` and `result` event
content** — the model's own output. `user` and `system` events are excluded from
the haystack even though they are parsed and their types recorded.

This is the invariant that keeps the check from being self-satisfying. `user`
echoes the prompt back. `system` is the more dangerous of the two: an init event
listing loaded config files names every component as a filesystem path, and
because `/` and `.` are word boundaries for the matcher, those paths match. A
CLI that prints a loaded-file listing at startup would otherwise produce a full
pass while the model said nothing at all — the exact false pass this script
exists to prevent.

Matching also requires the component id to stand alone within surrounding
identifier characters (`A-Za-z0-9_-`), so `rust-engineer` does not satisfy
`engineer` and `my_engineer` does not satisfy `engineer`.

### Fail-closed behaviour

The script exits nonzero rather than reporting a pass when:

- the CLI is not installed, or does not expose `--print` and `stream-json`;
- the CLI does not expose `--plugin-dir`. This is the single most important
  case. A CLI that silently ignores an unknown flag would otherwise produce a
  clean run that proves nothing, which is precisely the failure this script
  exists to catch;
- the invocation times out or exits nonzero;
- any non-empty stream line fails to parse, or the stream has no terminal
  `result` event, or that result reports `subtype: "error"`;
- any agent or rule named in the inventory is absent from the stream.

At the time of writing, the CLI on the maintainer's machine
(`2026.03.30-a5d3e17`) does not expose `--plugin-dir`, so this script cannot yet
produce a passing artifact there. That is the correct outcome, not a defect.

## Evidence artifact integrity

Both artifacts carry a `schemaVersion` and are bound to what they describe:

- `pluginSourceSha256` — a digest of the plugin tree computed **at capture
  time**, using the repository's existing `hashTree` helper.
- `inventorySha256` — a digest of the inventory the expectations were derived
  from.
- `streamSha256` (CLI only) — a digest of the raw NDJSON that was analysed.

A gate consuming these must recompute the plugin digest at report time and
compare it, rather than validating only that the fields look like hashes.
Shape-only validation is how hand-written JSON passes a gate; the binding is the
part that does the work.

Neither digest is an external attestation. An operator who controls the plugin
tree, the CLI, and the artifact can produce a mutually consistent evidence set.
These are integrity checks, consistent with the limits already stated in
[the evidence policy](evidence-policy.md).

## Expectations come from the inventory

Neither script hardcodes component names. Both derive expectations from
`plugin/.cursor-plugin/inventory.json`, so adding or renaming a component
changes what is checked without touching either script. Regenerate the inventory
with `npm run inventory` when components change.

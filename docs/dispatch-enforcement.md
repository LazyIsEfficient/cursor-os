# Dispatch enforcement (Tier 0, opt-in)

Mechanical enforcement for the [subagent-dispatch](../plugin/rules/orchestrator-first.mdc) rule. The rule is advisory doctrine; **when enabled, these hooks block** the main agent when dispatch is skipped. State lives in a per-session JSON ledger (`.cursor/dispatch-ledger.json`, gitignored).

This is a Cursor plugin hook layer. It adds three gates:

- **Research gate** — after a threshold of main-thread `Read`/`Grep`/`Glob`/`SemanticSearch` ops without an `explore` Task, deny further research and demand a `Task(subagent_type=explore)`.
- **Impl gate** — deny `Write`/`StrReplace`/`Delete` on a *code path* from the main thread until an implementation `Task` (`engineer`, `rust-engineer`, …) **completes**.
- **Stop gate** — at end of turn, if the git worktree has code/library changes but the required reviewer Tasks have not completed, emit an auto follow-up demanding them (Wave 1 gate DAG).

## Opt-in by default

The shipped policy is **disabled** (`"enabled": false` in `plugin/.cursor/dispatch-gate.json`). Hooks still register and run; when disabled they no-op (allow / empty). Enabling is an **operator choice**.

### How to enable

1. Copy the plugin default into the consumer project (or edit in place if you already have one):

   ```sh
   mkdir -p .cursor
   cp plugin/.cursor/dispatch-gate.json .cursor/dispatch-gate.json   # from a checkout
   # or: copy from the installed plugin tree under CURSOR_PLUGIN_ROOT
   ```

2. Set `"enabled": true` in `.cursor/dispatch-gate.json`.

3. Reload the Cursor window (Developer: Reload Window) so hooks pick up the config.

Emergency off for a single session: `DISPATCH_GATE_DISABLED=1`.

### Config resolution — which file wins

| Priority | Path | Role |
| --- | --- | --- |
| 1 (wins) | `<project>/.cursor/dispatch-gate.json` | **Consumer override** — operator policy for this repo |
| 2 | `${CURSOR_PLUGIN_ROOT}/.cursor/dispatch-gate.json` | Plugin default (`enabled: false`) |
| — | (neither readable) | Gate stays **disabled** |

`DISPATCH_GATE_DISABLED=1` overrides both and forces off. Once a config file is loaded, only an explicit `"enabled": false` disables the gate (a missing `enabled` key defaults to on — do not use `enabled ?? true` / jq `//` footguns that treat `false` as missing).

## Architecture — thin hooks, fat lib

All logic lives under `plugin/scripts/lib/` (re-exported from `scripts/lib/` for maintainer tests). Entry scripts under `plugin/scripts/dispatch-gate-*.mjs` are **thin**: read stdin, call one handler, always exit 0. Fail-closed hooks always emit a `{permission:…}` object.

| Cursor event | Handler | Entry script | Behavior |
| --- | --- | --- | --- |
| `sessionStart` | `dispatchGateHandleSessionInit` | `dispatch-gate-session-init.mjs` | Init ledger; inject orchestrator reminder |
| `preToolUse` | `dispatchGateHandlePreTool` | `dispatch-gate-pre-tool.mjs` (`failClosed`) | Research / impl gate by tool |
| `postToolUse` | `dispatchGateHandlePostTool` | `dispatch-gate-post-tool.mjs` | Track research, Task, writes |
| `beforeReadFile` | `dispatchGateHandleBeforeRead` | `dispatch-gate-before-read.mjs` (`failClosed`) | Research gate + count read once |
| `afterFileEdit` | `dispatchGateHandleAfterFileEdit` | `dispatch-gate-after-file-edit.mjs` | Record ungated main-thread code edits |
| `subagentStop` | `dispatchGateHandleSubagentStop` | `dispatch-gate-subagent-stop.mjs` | Mark impl/reviewer/documenter completed |
| `stop` | `dispatchGateHandleStop` | `dispatch-gate-stop.mjs` | Follow-up if reviewers missing |

Existing hooks (`before-shell-execution`, session-state, memory-index, pre-compact, memory-extract-nudge) are **preserved**; dispatch-gate hooks are additive.

## Path classification

The runtime planner `dispatch-gate-plan-lib.mjs` **mirrors** `scripts/lib/gate-plan-lib.sh` so the stop-hook's reviewer demand matches the PR ship-gate checkboxes.

| Class | Paths | Reviewers |
| --- | --- | --- |
| **library** | `plugin/skills/**`, `plugin/agents/**` | code-reviewer, security-reviewer, data-model-documenter, **library-reviewer** |
| **code** | non-docs paths not skipped | code-reviewer, security-reviewer, data-model-documenter |
| **sensitive** | `plugin/hooks/**`, `plugin/rules/**`, `plugin/commands/**`, `plugin/references/**`, validate/release scripts, workflows, dispatch-gate itself, `SECURITY.md`, … | security-reviewer, data-model-documenter |
| **docs / churn (skip)** | `*.md`, `*.mdc`, `docs/**`, `.cursor/dispatch-ledger.json`, `.claude/memory/**`, `.claude/ledger/**`, `eval/metrics/runs/**` | — |
| **DATA_MODEL.md** | `DATA_MODEL.md` | code-change + Wave 2 `data-model-verifier` |

**Impl gate** `code_path_prefixes`: `plugin/skills/`, `plugin/agents/`, `plugin/commands/`, `plugin/rules/`, `plugin/references/`, `scripts/`.

**Harness exempt** (main-thread edits always allowed): dispatch-gate scripts, `plugin/hooks/`, config/ledger paths, `docs/dispatch-enforcement.md`, `SESSION-STATE.md`.

## Hard constraints

1. **No pipe-to-shell in hook entrypoints.** Commands are `node "${CURSOR_PLUGIN_ROOT}/scripts/….mjs"` only.
2. **Hook-safety static scan** on registered entry scripts: no `writeFile`/`mkdir`/`child_process`/network in the entry source. Ledger I/O and `git` live in the fat lib.
3. **`failClosed` hooks always print** a `{permission:…}` object and exit 0. Empty stdout on `preToolUse` / `beforeReadFile` would block every tool.
4. Existing hooks stay registered; dispatch-gate is additive.

## Files

| Path | Role |
| --- | --- |
| `plugin/hooks/hooks.json` | Hook registration (additive) |
| `plugin/.cursor/dispatch-gate.json` | Default policy — **enabled: false** |
| `.cursor/dispatch-gate.json` | Consumer override (wins when present) |
| `.cursor/dispatch-ledger.json` | Per-session state — **gitignored** |
| `plugin/scripts/dispatch-gate-*.mjs` | Seven thin entry scripts |
| `plugin/scripts/lib/dispatch-gate-lib.mjs` | Ledger + policy + handlers |
| `plugin/scripts/lib/dispatch-gate-plan-lib.mjs` | Path → reviewer-wave classifier |
| `scripts/lib/dispatch-gate-*.mjs` | Re-exports for maintainer tests |
| `tests/security/dispatch-gate.test.mjs` | Fixture tests against the lib |

## Tests

```bash
npm test -- tests/security/dispatch-gate.test.mjs
npm run validate
```

## Gotcha — locked out

If you get locked out with the gate enabled: set `DISPATCH_GATE_DISABLED=1`, or set `"enabled": false` in `.cursor/dispatch-gate.json`, then **Developer: Reload Window**. Disable project/plugin hooks in Cursor Settings → Hooks as a last resort.

## Platform limits (won't port)

Dispatch-gate is a **portable** agentic-os feature (opt-in here). Separately, Cursor still cannot port **per-prompt session reinjection** (`UserPromptSubmit` digest). Mitigation remains `sessionStart` + `preCompact` notice + `/state`. See [cursor-capability-matrix.md § Won't port](cursor-capability-matrix.md#wont-port-platform-limits). Do not invent Cloud Agent parity claims for this layer.

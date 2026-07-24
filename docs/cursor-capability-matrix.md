# Cursor capability matrix

Evidence was captured on 2026-07-20, except where a section states a later
capture date for specific claims. Automated probes are network-free, read local
files and CLI help, and do not write Cursor user configuration.

## How to read this matrix

Grading in this document is **per bullet, not per heading**. Every bullet opens
with a bold grade label, and that label is authoritative for that bullet alone.

Headings group claims by capability area and by the evidence route available for
that area. They are not blanket grades. Each capability is kept whole so that
its confirmed findings and its unproven limits sit together, which means a
section titled "Verified automatically" will contain `Unverified` bullets — that
is intended, not an error. Read the bullet's grade, never the heading, to know
what has actually been established.

Grade labels in use:

- **Verified …** — established by the evidence cited at the end of the section.
  The rest of the label states the scope of that evidence: `in this repository`,
  `in the configuration`, `in the fixture`, `in the workflow`,
  `in the repository policy`, `in the runtime contract`, `on this machine`,
  `in current documentation`, `by local process tests`, or `by static scan`.
- **Verified:** (unqualified) — a claim about what Cursor's official
  documentation states, cited in the section's Evidence line. It is equivalent to
  `Verified in current documentation` and carries no claim about this
  repository's behaviour.
- **Verified absent …** — the *absence* of something was established, not its
  presence. Used once, for a CLI flag this local build does not expose.
- **Precondition:** — a machine-checked condition that the section's verified
  bullets depend on. Its absence is a hard failure, not a degraded pass.
- **Unverified — …** — not established here, with the reason: `editor-only/manual`,
  `requires a live agent run`, or `outside this repository`.

The one exception is "Explicitly unavailable or unverified", whose bullets lead
with a bold topic and state their grade in the first sentence of the bullet.

## Verified automatically

### Plugin marketplace and manifest discovery

- **Verified:** Cursor's current plugin reference requires
  `.cursor-plugin/marketplace.json` at a multi-plugin repository root and a
  `.cursor-plugin/plugin.json` in each plugin directory.
- **Verified in this repository:** the marketplace contains exactly one plugin,
  its `source` resolves to `plugin/`, the nested manifest exists, and both
  manifests name `cursor-harness`.
- **Verified in this repository:** all checked manifest paths are relative and
  remain inside the repository.

Evidence: `npm run validate` and the official
[Plugins reference](https://cursor.com/docs/reference/plugins).

### Custom-agent file discovery

- **Verified:** when a plugin manifest omits an explicit `agents` field,
  Cursor's documented folder discovery scans `agents/` for `.md`, `.mdc`, and
  `.markdown` files.
- **Verified in this repository:** folder discovery finds
  `plugin/agents/capability-probe.md`, and its YAML frontmatter has the
  documented `name` and `description` fields.
- **Unverified — editor-only/manual:** the installed editor has not loaded the
  plugin or shown/invoked `capability-probe`. Use the exact sentinel response in
  that agent file for a later manual editor smoke test.
- **Unverified — editor-only/manual:** eight of nine plugin agents share common
  global agent names (`adversarial-claims-reviewer`, `code-reviewer`,
  `engineer`, `godot-engineer`, `library-investigator`, `phaser-engineer`,
  `rust-engineer`, `security-reviewer`; only `capability-probe` is unique).
  Cursor's precedence when a plugin agent and a global agent share a name is
  not proven in this repository. The same gap applies to
  `factual-correctness.mdc` among rules. See
  [plugin loading verification](plugin-loading-verification.md#0-collisions-with-an-existing-cursor).

Evidence: `npm test`, `npm run probe`, the official
[Plugins reference](https://cursor.com/docs/reference/plugins#component-discovery),
and [Subagents documentation](https://cursor.com/docs/subagents#custom-subagents).

### Hook schema and blocking contract

- **Verified:** current Cursor hook configuration uses schema version `1`, a
  `hooks` object, and arrays of hook definitions. Command hooks accept
  `command`, `matcher`, and `failClosed`.
- **Verified by local process tests:** the fixture
  `beforeShellExecution` hook returns `permission: "deny"` with exit code `0`
  for one input and exits with code `2` for another. Both are documented
  blocking contracts.
- **Verified in the fixture:** `failClosed` is `true`, so the configuration
  requests blocking on crashes, timeouts, or invalid output.
- **Verified in this repository's plugin config:** `beforeShellExecution` uses
  a 5s timeout with `failClosed: true`, so a crash, timeout, or invalid output
  from that hook is configured to deny the shell command.
- **Unverified — editor-only/manual:** Cursor itself has not executed this
  fixture. The tests prove the script output and exit-code contracts, not editor
  enforcement or hook merge priority.
- **Operator-observed / not CI-proven:** plugin hooks add as additional array
  entries alongside existing user `~/.cursor` hooks for the same events
  (stacking), including a fail-closed shell guard and possible duplicate
  `sessionStart` injection. Exact merge priority remains unverified.

Evidence: `npm test`, `npm run validate`, and the official
[Hooks documentation](https://cursor.com/docs/hooks#command-based-hooks).

### Advisory hook events: `sessionStart`, `preCompact`, `stop`

- **Verified by local process tests:** each registered script reads one hook
  payload from standard input and writes exactly one JSON object to standard
  output. `session-state-inject` and `memory-index-inject` emit
  `additional_context` when `SESSION-STATE.md` or `.cursor/memory/MEMORY.md`
  exists and `{}` otherwise; `pre-compact-notice` emits `user_message` naming
  the compaction trigger only when `SESSION-STATE.md` exists; and
  `memory-extract-nudge` emits `followup_message` only when `status` is
  `"completed"`, returning `{}` for `"aborted"` and `"error"`.
- **Verified by local process tests:** all four scripts exit `0`, write nothing
  to standard error, and return `{}` on malformed or non-JSON stdin. This is the
  fail-open contract; none of these hooks sets `failClosed`.
- **Verified in the configuration:** the `stop` hook sets `loop_limit: 1`, the
  documented loop-safety control that bounds followup re-entry.
- **Verified by static scan:** none of these scripts writes to disk, spawns a
  process, or performs network access.
- **Unverified — editor-only/manual:** Cursor itself has not executed these
  hooks. The tests prove the stdin-to-stdout contracts of the scripts as local
  processes, **not** that the editor dispatches these events, honors
  `additional_context`, surfaces `user_message`, or enforces `loop_limit`.

Evidence: `npm test`, `npm run validate`, and the official
[Hooks documentation](https://cursor.com/docs/hooks).

### Cursor CLI structured output availability

- **Verified on this machine:** `agent --version` reports
  `2026.03.30-a5d3e17`.
- **Verified on this machine:** `agent --help` exposes `--print`,
  `--output-format` with `stream-json`, `--stream-partial-output`, and
  `--sandbox`.
- **Verified in current documentation:** `stream-json` is NDJSON, requires print
  mode (explicitly or inferred), and successful streams end with a `result`
  event. Consumers must ignore unknown fields.
- **Verified absent in this local CLI help:** `--plugin-dir` is not exposed by
  version `2026.03.30-a5d3e17`, although it appears in the current official CLI
  parameter reference. The probe reports this mismatch instead of assuming
  local CLI plugin loading.
- **Unverified — requires a live agent run:** no authenticated model request was
  made, so this repository has not captured a real NDJSON stream or loaded the
  local plugin through the CLI.

Evidence: `npm run probe`, `agent --help`, `agent --version`, the official
[CLI parameters](https://cursor.com/docs/cli/reference/parameters), and
[output format reference](https://cursor.com/docs/cli/reference/output-format).

### Benchmark CLI config isolation

- **Verified by local process tests:** a pre-authenticated external template is
  copied into each fresh isolated config directory; trials set documented
  `CURSOR_CONFIG_DIR` and isolate `HOME`/`XDG_CONFIG_HOME`. The captured child
  invocation reports `CURSOR_CONFIG_DIR` pointing at the per-trial
  `cursor-home` and `CURSOR_CONFIG_HOME` unset, because that variable is not
  documented and is deliberately not set.
- **Verified by local process tests:** the child environment is an operational
  allowlist. With `CURSOR_API_KEY` and `AWS_SECRET_ACCESS_KEY` present in the
  supplied environment, the captured invocation records no inherited sensitive
  variables.
- **Verified by local process tests:** the trial setup accepts only a validated
  external Cursor config template, and the authentication preflight fails with a
  clear error when that template is missing.
- **Unverified — requires a live agent run:** no authenticated CLI trial has
  been executed, so isolation is proven against the mock agent, not against a
  real authenticated Cursor CLI session. Authentication through API-key
  environment or arguments remains intentionally unsupported because tool
  subprocess inheritance has not been proven safe.

Evidence: `npm test` —
`tests/benchmark/engine.test.mjs`, tests "Cursor CLI adapter captures streams
and invalidates timeout, nonzero, and missing results", "trial setup copies only
a validated external Cursor config template", and "authentication preflight uses
a copied synthetic config and fails clearly when missing"; and the official
[CLI configuration](https://cursor.com/docs/cli/reference/configuration).

### Benchmark artifact isolation

- **Verified by local process tests:** the exporter selects only result/report
  files and named trial logs. Trial `workspace/` and `cursor-home/` trees, and
  unselected files inside an artifact directory, are absent from the export.
- **Verified by local process tests:** the exporter scans selected bytes for
  supplied canaries and credential patterns and fails closed, leaving no export
  directory behind, when either matches.
- **Verified by local process tests:** every exported file carries a SHA-256
  entry that matches the exported bytes, and the manifest is written alongside
  the export. These hashes provide integrity binding, not external attestation.
- **Verified in the workflow:** the authenticated benchmark uploads only
  `benchmark/sanitized/`, never `benchmark/results/`.

Evidence: `npm test` —
`tests/benchmark/artifact-export.test.mjs`, tests "sanitized export allowlists
evidence, excludes raw roots, and writes verified hashes" and "sanitized export
fails closed on exact canaries and credential patterns";
`tests/contracts/schema-contracts.test.mjs`, test "sanitized artifact export
manifests bind allowlisted file bytes"; and
`tests/workflows/integration-gates.test.mjs`, test "authenticated profiles use
protected pre-authenticated config and sanitized artifacts".

### CI action pinning

- **Verified in this repository:** every `uses:` reference in `ci.yml` and
  `authenticated-benchmark.yml` names a first-party `actions/*` action pinned to
  a full 40-character commit SHA. As of this capture that is `actions/checkout`,
  `actions/setup-node`, and `actions/upload-artifact`, and the check is
  enforced generically rather than against a fixed list.
- **Unverified — outside this repository:** pinning binds the workflow to a
  specific tree object; it is not an upstream provenance attestation, and this
  repository has not independently verified what those upstream commits contain.

Evidence: `npm test` — `tests/workflows/integration-gates.test.mjs`, test
"workflows use only immutable first-party action pins".

## Verified under a stated precondition

Claims in this section hold only while the stated precondition is true. The
precondition is machine-checked, and its absence is a hard failure rather than a
silently degraded pass.

### Benchmark network denial

- **Precondition:** the probed Cursor CLI exposes `--sandbox`. `npm run probe`
  reports this capability from parsed `agent --help` output, and the CLI adapter
  refuses to run unless `--print`, `stream-json`, and `--sandbox` are all
  present.
- **Verified by local process tests:** every CLI trial writes an exact repo
  policy to the workspace before its baseline, invokes `--sandbox enabled`, and
  requires the policy SHA-256 to be unchanged afterwards. A mutated policy
  yields an error status and a missing policy aborts the trial.
- **Verified in the repository policy:** the written policy sets the network
  default to `deny` with an empty allow list and explicitly denies `0.0.0.0/0`
  and `::/0`. Cursor documents that deny rules win over allow rules.
- **Verified in the runtime contract:** missing CLI support or missing policy
  evidence is a critical error, never a pass.
- **Unverified — requires a live agent run:** no authenticated trial has been
  executed, so this repository has observed the harness requesting and
  hash-binding the deny policy, **not** Cursor's sandbox actually refusing an
  egress attempt. Enforcement is the CLI's, and it has not been witnessed here.

Evidence: `npm test` —
`tests/benchmark/engine.test.mjs`, test "Cursor CLI adapter captures streams and
invalidates timeout, nonzero, and missing results"; `test/platform-contract.test.mjs`,
test "CLI help parser detects documented stream-json flags"; `npm run probe`; and
the official [sandbox.json reference](https://cursor.com/docs/reference/sandbox).

Capture dates differ within this section. The `npm run probe` evidence for the
`--sandbox` precondition was captured on 2026-07-21, against CLI version
`2026.03.30-a5d3e17`; the remaining evidence here is from the 2026-07-20
capture. The precondition is re-checked at run time, so a later probe on a
different machine or CLI version can invalidate it.

## Explicitly unavailable or unverified

- **Token counts:** unverified. The documented CLI `stream-json` result contract
  lists durations, result text, session ID, and an optional request ID; it does
  not document token-usage fields. Do not infer token counts.
- **Undocumented Task invocation fields:** unverified. Cursor documents custom
  agent frontmatter and `subagentStart`/`subagentStop` hook payloads, but this
  scaffold does not assume a Task tool argument schema beyond official
  documentation.
- **Parallel subagent observation:** unverified. The hook reference documents
  `is_parallel_worker` on `subagentStart`, but no live parallel run or hook event
  was captured.
- **Marketplace installation in Customize:** unverified and editor-only/manual.
- **Cloud Agent parity:** unverified; no Cloud Agent probe was run. Do not treat
  local Editor/CLI results as Cloud evidence.

## Won't port (platform limits)

These agentic-os behaviors are **out of scope for cursor-os** because Cursor
does not expose the required platform surface. They are not backlog items until
that surface exists and is re-verified in the matrix.

- **Per-prompt session reinjection:** explicitly unavailable — **won't port**.
  Cursor has no per-prompt context-injection hook. `beforeSubmitPrompt` exposes
  only `continue` and `user_message`, so it can allow or block a prompt but
  cannot add context to it. The Claude original's `UserPromptSubmit` digest
  re-injection therefore has no Cursor equivalent. Consequence: session state is
  injected once at `sessionStart` and is **not** restored after a compaction —
  `preCompact` is observational and its `user_message` reaches the user, not the
  model's context, so state must be re-read manually via `/state`. Keep that
  mitigation; do not invent a reinjection shim. Evidence:
  [Hooks documentation](https://cursor.com/docs/hooks).
- **`sessionStart` in Cloud Agents:** documented as unsupported, consistent with
  this repository's existing local-only scope and Cloud Agent exclusion. Not a
  port target. Evidence: [Hooks documentation](https://cursor.com/docs/hooks).

Related: opt-in dispatch-gate is portable and shipped **disabled** — see
[dispatch-enforcement.md](dispatch-enforcement.md). That is operator policy, not
a platform won't-port.

## Reproduce

```sh
npm test
npm run validate
npm run benchmark:corpus-smoke
npm run probe
```

The first two commands are deterministic. `npm run probe` additionally reports
the locally installed Cursor CLI version and flags, so its CLI section can vary
between machines.

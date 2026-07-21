# Cursor capability matrix

Evidence captured on 2026-07-20. Automated probes are network-free, read local
files and CLI help, and do not write Cursor user configuration.

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
- **Unverified — editor-only/manual:** Cursor itself has not executed this
  fixture. The tests prove the script output and exit-code contracts, not editor
  enforcement or hook merge priority.

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
- **Per-prompt context injection:** explicitly unavailable. Cursor has no
  per-prompt context-injection hook. `beforeSubmitPrompt` exposes only
  `continue` and `user_message`, so it can allow or block a prompt but cannot
  add context to it. The Claude original's `UserPromptSubmit` digest
  re-injection therefore has no Cursor equivalent. Consequence: session state is
  injected once at `sessionStart` and is **not** restored after a compaction —
  `preCompact` is observational and its `user_message` reaches the user, not the
  model's context, so state must be re-read manually via `/state`. Evidence:
  [Hooks documentation](https://cursor.com/docs/hooks).
- **`sessionStart` in Cloud Agents:** documented as unsupported, consistent with
  this repository's existing local-only scope and Cloud Agent exclusion.
  Evidence: [Hooks documentation](https://cursor.com/docs/hooks).
- **Marketplace installation in Customize:** unverified and editor-only/manual.
- **Cloud Agent parity:** unverified; no Cloud Agent probe was run.
- **Benchmark network denial:** supported when the probed Cursor CLI exposes
  `--sandbox`. Every CLI trial writes an exact repo policy before its baseline,
  invokes `--sandbox enabled`, and requires the policy hash to remain unchanged.
  The policy denies by default and explicitly denies `0.0.0.0/0` and `::/0`;
  Cursor documents that deny rules win over allow rules. Missing CLI support or
  policy evidence is a critical error, never a pass. Evidence:
  [sandbox.json reference](https://cursor.com/docs/reference/sandbox).
- **CLI config isolation:** verified local contract. A pre-authenticated
  external template is copied into each fresh isolated config directory;
  trials set documented `CURSOR_CONFIG_DIR`, isolate `HOME`/`XDG_CONFIG_HOME`,
  and do not set unsupported `CURSOR_CONFIG_HOME`. The child environment is an
  operational allowlist and excludes API keys and common CI/cloud/token
  credential variables. Authentication through API-key environment or
  arguments is intentionally unsupported because tool subprocess inheritance
  has not been proven safe. Evidence:
  [CLI configuration](https://cursor.com/docs/cli/reference/configuration).
- **Artifact isolation:** verified local contract. The exporter selects only
  result/report files and named trial logs, excludes workspaces and config
  homes, scans selected bytes for supplied canaries and credential patterns,
  and emits SHA-256 entries. CI uploads only this export. These hashes provide
  integrity binding, not external attestation.
- **CI action immutability:** `actions/checkout`, `actions/setup-node`, and
  `actions/upload-artifact` are pinned to verified full commit SHAs.

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

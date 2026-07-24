# Cursor Harness

Cursor Harness v0.1.0 provides correctness-first engineering workflows for
local Cursor Editor and Cursor CLI use. It turns implementation into an
evidence-gated path: shape, plan, implement, verify, review, and only then ship.

Repository: https://github.com/LazyIsEfficient/cursor-os  
License: MIT  
Attribution: Cursor Harness contributors

## Included components

- **Agents:** <!-- components:agent:start -->seventeen agents — `engineer`,
  `rust-engineer`, `godot-engineer`, `phaser-engineer`, `devops-engineer`,
  `web3-engineer`, `data-model-documenter`, `code-reviewer`,
  `security-reviewer`, `data-model-verifier`, `library-investigator`,
  `library-reviewer`, `adversarial-claims-reviewer`, `technical-pm`,
  `marketer`, `game-design-shaper`, and
  `capability-probe`.<!-- components:agent:end -->
- **Skills:** <!-- components:skill:start -->forty-five skills.
  Workflow: `prompt-shaping` (ambiguous request to a cold-context-complete
  brief), `planning-and-task-breakdown` (brief to a dependency-aware task
  graph), `incremental-implementation` (small tested increments with
  risk-proportional verification), `session-state` (state that survives
  compaction), `memory-extraction` (durable cross-session facts), and
  `findings-ledger` (recurrence-based triage of advisory findings).
  Review and audit: `code-review-and-quality` (multi-axis review method),
  `security-engineering` (cross-stack security audit method), `security`
  (PII/secret scan and redaction), `data-model-documentation` and
  `data-model-verification` (catalog and verify boundary data shapes),
  `skill-library-review` (judgment audit of skill/agent definitions),
  `library-investigator` (forensic, evidence-only audit of this plugin's own
  component files), and `adversarial-claims-reviewer` (verifies equations and
  quantitative claims in a document). Stack-specific:
  `typescript-testing-backend` (Jest and Supertest),
  `typescript-testing-frontend` (Jest and React Testing Library),
  `typescript-data-engineering` (pipelines, brokers, warehouses),
  `typescript-analytics` (PostHog events, flags, error tracking),
  `browser-testing-with-devtools` (real-browser verification via Chrome
  DevTools MCP), `rust-engineer`, `godot-engineer` (Godot 4 with C#),
  `phaser-engineer` (Phaser 3 with TypeScript), `devops-engineer`
  (Kubernetes, Helm, Pulumi), `site-reliability-engineering` (SLOs, on-call,
  incidents), and `web3-smart-contract-engineering` (Solidity/EVM). Delivery:
  `deployment-pipelines` (CI/CD workflow authoring), `release-manager`
  (CHANGELOG, version tags, release comms), and `codebase-cost-estimator`
  (LOC-based build-cost estimates). Game and marketing: `game-design-shaper`,
  `game-concept-creator`, `game-systems-designer`, `game-balancer`,
  `game-monetization-strategist`, `iap-manager`, `game-marketer`,
  `marketing-shaper`, `content-ops`, `content-pipeline`, `conversion-ops`,
  `growth-engine`, `outbound-engine`, `seo-ops`, `revenue-intelligence`,
  `autoresearch`, and `telemetry`.<!-- components:skill:end -->
- **Commands:** <!-- components:command:start -->seven commands —
  `/review-gate`, `/triage-findings`, `/state`, `/skill-new`,
  `/agent-new`, `/audit-library`, and `/eval-harness`.<!-- components:command:end -->
- **Rules:** factual correctness, grounding, communication, memory discipline,
  orchestrator-first dispatch, deterministic diff verification, evidence
  review tiers, anti-patterns, and briefing.
- **Hooks:** nine events. A fail-closed `beforeShellExecution` default-deny
  allowlist for safe local shell command forms; advisory fail-open
  `sessionStart` (session-state + memory-index + opt-in dispatch-gate init),
  `preCompact`, `postToolUse` / `afterFileEdit` / `subagentStop` /
  `stop` (memory nudge + opt-in dispatch-gate follow-up); and fail-closed
  opt-in `preToolUse` / `beforeReadFile` for dispatch enforcement (disabled
  until `"enabled": true` — see [docs/dispatch-enforcement.md](../docs/dispatch-enforcement.md)).

The workflow ranks correctness before speed, quality, security observations,
and resource use. Deterministic failures and judgment backed by reproducible
counterevidence can gate work; unevidenced model judgment remains advisory.

## Scope and permissions

This release targets local Cursor clients. Cloud Agent behavior is unsupported
and unverified; `sessionStart` is documented as unsupported in Cloud Agents.
Each hook runs a dependency-free Node.js script locally with the user's
permissions, reading one hook event from standard input.

The `beforeShellExecution` guard emits a permission decision and accesses no
network, credentials, user configuration, or workspace files. The session-state
and memory-index advisory hooks read two workspace files — `SESSION-STATE.md`
and `.cursor/memory/MEMORY.md` — and emit context or a message. Those entry
scripts do not write to disk. The opt-in dispatch-gate layer (disabled by
default) writes a per-session ledger under `.cursor/` when enabled; see
[docs/dispatch-enforcement.md](../docs/dispatch-enforcement.md). No hook
accesses the network or credentials.

Cursor has no per-prompt context-injection hook, so session state is injected
once at `sessionStart` and is not restored after a compaction; the `preCompact`
notice tells the user to re-read it with `/state`.

The guard is not a sandbox or complete shell parser. Review this plugin,
especially `.cursor-plugin/plugin.json`, `hooks/hooks.json`, and
`scripts/before-shell-execution.mjs`, before installation. Trust the workspace
before enabling local hooks.

## Installation

The intended installation surface is Cursor's Customize/Plugins interface
using the repository's Marketplace manifest. No claim is made that this plugin
is currently published in Marketplace.

Until then the plugin is linked by hand under `~/.cursor/plugins/local`. The
symlink target differs between the release archive and a git checkout, and the
two commands are not interchangeable — the wrong one produces a symlink that
points at a path which does not exist. Decide which layout you have before
running either:

```sh
ls .cursor-plugin/plugin.json         # exists -> release archive, use A
ls plugin/.cursor-plugin/plugin.json  # exists -> git checkout, use B
```

### A. From the release archive

The archive root **is** the plugin. Extracting `cursor-harness-<version>.tar.gz`
produces a `cursor-harness-<version>/` directory that directly contains
`.cursor-plugin/`, `agents/`, `skills/`, and this README — there is no `plugin/`
subdirectory — so the symlink target is the extracted directory itself:

```sh
tar -xzf cursor-harness-0.1.0.tar.gz
cd cursor-harness-0.1.0
mkdir -p ~/.cursor/plugins/local
ln -s "$PWD" ~/.cursor/plugins/local/cursor-harness
```

The symlink points at the extracted directory, so keep it where it is; moving or
deleting it breaks the link.

### B. From a git checkout

A checkout of <https://github.com/LazyIsEfficient/cursor-os> wraps the plugin in
a `plugin/` subdirectory, so the target is that subdirectory and not the
repository root. Run from the repository root:

```sh
mkdir -p ~/.cursor/plugins/local
ln -s "$PWD/plugin" ~/.cursor/plugins/local/cursor-harness
```

### Confirm the link, and remove it

```sh
ls ~/.cursor/plugins/local/cursor-harness/.cursor-plugin/plugin.json
```

If that path lists, the link resolves. If it reports `No such file or directory`,
the link is dangling: remove it and use the other form above. Restart Cursor if
plugin discovery does not refresh.

Nothing in this project creates, repairs, or removes that symlink, and no part of
it writes to your Cursor directory. Remove it yourself with:

```sh
rm ~/.cursor/plugins/local/cursor-harness
```

### Existing `~/.cursor` collisions

If you already have global agents, rules, or hooks under `~/.cursor`, install
adds this plugin beside them — it does not replace that configuration.

- **Name collisions (precedence UNVERIFIED).** Eight agents share common global
  names: `adversarial-claims-reviewer`, `code-reviewer`, `engineer`,
  `godot-engineer`, `library-investigator`, `phaser-engineer`, `rust-engineer`,
  and `security-reviewer`. Only `capability-probe` is unique to this plugin.
  `factual-correctness.mdc` can collide the same way among rules. This package
  does not document a Cursor precedence rule because none is proven here —
  confirm which definition runs (invoke `capability-probe`; expect exactly
  `cursor-harness-agent-discovered`).
- **Hooks stack.** Plugin hooks register alongside yours. The fail-closed
  `beforeShellExecution` guard (`failClosed: true`, 5s timeout) will gate every
  shell command if it errors or times out. `sessionStart` injectors can
  duplicate.
- **Confirm Editor loading separately.** The symlink does not write
  `plugins.json`. On-disk presence is not proof the Editor loaded the plugin.
  After linking, run the repository's `npm run plugin:editor:verify` (expect
  `registeredInPluginsJson: false` and `editorComponentLoading: not-proven`
  until a `capability-probe` transcript is supplied). See
  [plugin loading verification](https://github.com/LazyIsEfficient/cursor-os/blob/main/docs/plugin-loading-verification.md).

## Verification

Maintainers can verify the source repository with:

```sh
npm ci --ignore-scripts
npm test
npm run validate
npm run probe
```

Editor loading, live authenticated model outcomes, token telemetry, and
parallel-subagent correlation are not yet verified. `npm run plugin:editor:verify`
and `npm run plugin:cli:verify` are the operator-run scripts that capture
evidence for the first and third of those; what they can and cannot establish is
described in
[plugin loading verification](https://github.com/LazyIsEfficient/cursor-os/blob/main/docs/plugin-loading-verification.md).
Detailed evidence, limitations, and security boundaries are maintained in the
repository
[README](https://github.com/LazyIsEfficient/cursor-os#readme),
[capability matrix](https://github.com/LazyIsEfficient/cursor-os/blob/main/docs/cursor-capability-matrix.md),
and [threat model](https://github.com/LazyIsEfficient/cursor-os/blob/main/docs/threat-model.md).

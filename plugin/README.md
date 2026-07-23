# Cursor Harness

Cursor Harness v0.1.0 provides correctness-first engineering workflows for
local Cursor Editor and Cursor CLI use. It turns implementation into an
evidence-gated path: shape, plan, implement, verify, review, and only then ship.

Repository: https://github.com/LazyIsEfficient/cursor-os  
License: MIT  
Attribution: Cursor Harness contributors

## Included components

- **Agents:** <!-- components:agent:start -->twelve agents — `engineer`,
  `rust-engineer`, `godot-engineer`, `phaser-engineer`, `data-model-documenter`,
  `code-reviewer`, `security-reviewer`, `data-model-verifier`,
  `library-investigator`, `library-reviewer`, `adversarial-claims-reviewer`,
  and `capability-probe`.<!-- components:agent:end -->
- **Skills:** <!-- components:skill:start -->twenty-two skills.
  Workflow: `prompt-shaping` (ambiguous request to a cold-context-complete
  brief), `planning-and-task-breakdown` (brief to a dependency-aware task
  graph), `incremental-implementation` (small tested increments with
  risk-proportional verification), `session-state` (state that survives
  compaction), `memory-extraction` (durable cross-session facts), and
  `findings-ledger` (recurrence-based triage of advisory findings).
  Review and audit: `code-review-and-quality` (multi-axis review method),
  `security-engineering` (cross-stack security audit method),
  `data-model-documentation` and `data-model-verification` (catalog and verify
  boundary data shapes), `skill-library-review` (judgment audit of skill/agent
  definitions), `library-investigator` (forensic, evidence-only audit of this
  plugin's own component files), and `adversarial-claims-reviewer` (verifies
  equations and quantitative claims in a document). Stack-specific:
  `typescript-testing-backend` (Jest and Supertest),
  `typescript-testing-frontend` (Jest and React Testing Library),
  `typescript-data-engineering` (pipelines, brokers, warehouses),
  `browser-testing-with-devtools` (real-browser verification via Chrome
  DevTools MCP), `rust-engineer`, `godot-engineer` (Godot 4 with C#), and
  `phaser-engineer` (Phaser 3 with TypeScript). Delivery:
  `deployment-pipelines` (CI/CD workflow authoring) and `release-manager`
  (CHANGELOG, version tags, release comms).<!-- components:skill:end -->
- **Commands:** <!-- components:command:start -->three commands —
  `/review-gate`, `/triage-findings`, and
  `/state`.<!-- components:command:end -->
- **Rules:** factual correctness, orchestrator-first dispatch, deterministic
  diff verification, and evidence review tiers.
- **Hooks:** four events. A fail-closed `beforeShellExecution` command guard
  for a narrow set of destructive local shell operations, plus three advisory
  fail-open hooks: `sessionStart` (injects `SESSION-STATE.md` and the
  `.cursor/memory/` index), `preCompact` (notifies the user that state must be
  re-read after compaction), and `stop` (nudges memory extraction once per
  completed session).

The workflow ranks correctness before speed, quality, security observations,
and resource use. Deterministic failures and judgment backed by reproducible
counterevidence can gate work; unevidenced model judgment remains advisory.

## Scope and permissions

This release targets local Cursor clients. Cloud Agent behavior is unsupported
and unverified; `sessionStart` is documented as unsupported in Cloud Agents.
Each hook runs a dependency-free Node.js script locally with the user's
permissions, reading one hook event from standard input.

The `beforeShellExecution` guard emits a permission decision and accesses no
network, credentials, user configuration, or workspace files. The three
advisory hooks read two workspace files — `SESSION-STATE.md` and
`.cursor/memory/MEMORY.md` — and emit context or a message. No hook writes to
disk, and no hook accesses the network, credentials, or user configuration.

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

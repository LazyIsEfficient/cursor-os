# Contributing

Thanks for your interest in Cursor Harness. This project is opinionated about
correctness and evidence, and a few of its constraints are unusual enough that
they are worth reading before you write code.

## The two rules that get pull requests rejected

### 1. Zero third-party dependencies

`package-lock.json` contains **no external packages**, and it stays that way.
Everything in this repository — the plugin hooks, the validator, the benchmark
harness, the release tooling, and the tests — runs on the Node standard library
alone.

This is not a stylistic preference. The plugin registers a `beforeShellExecution`
hook that executes locally with the Cursor process's user permissions. Every
transitive package would become part of that trust boundary, on a machine where
the user has already been told to review the code before enabling it. A
dependency-free tree is auditable in an afternoon.

Practically, this means:

- no `dependencies` and no `devDependencies`;
- no test runner, assertion library, linter, or bundler — use `node:test`,
  `node:assert/strict`, and plain ESM;
- no `npx some-tool` in scripts;
- vendoring a package into the repository does not count as a workaround.

If you believe a change genuinely cannot be made without a dependency, open an
issue describing the problem **before** writing the code. The answer will
usually be a smaller standard-library implementation.

### 2. No unverified claims

The README maintains an explicit
[list of currently unverified claims](README.md#current-unverified-claims), and
documentation deliberately says what has *not* been proven — that the plugin is
not published to Marketplace, that Cloud Agents are unverified, that a hook
allow-decision is never evidence an evaluator stayed intact.

Do not add a claim the repository cannot demonstrate. If your change proves
something that was previously unverified, move it off the unverified list and
say what evidence proves it. If it introduces a new unproven capability, add it
to the list. "It probably works on Node 24" is exactly the kind of claim this
project removes rather than adds.

## Environment

Node.js 22 is required. `engines` is `^22` and `.nvmrc` pins `22`, matching what
CI actually exercises. The range is deliberately narrow: the test script passes
nine glob patterns to `node --test`, and glob handling has changed across
recent majors. Widening it is a change that must come *with* CI matrix evidence,
not before it.

```sh
nvm use
```

## Local verification gates

Run all six before opening a pull request. CI runs a subset; the rest are local
only, which is why the pull request template asks you to confirm them.

```sh
npm ci --ignore-scripts
npm test
npm run validate
npm run plugin:lifecycle:verify
npm run benchmark:corpus-smoke
npm run probe
```

What each gate covers:

| Command | Covers | In CI |
|---|---|---|
| `npm test` | Full `node:test` suite, including release reproducibility and temporary install/uninstall coverage. | Yes |
| `npm run validate` | Manifests, component discovery and frontmatter, markdown links, inventory hashes, orchestration and authenticated-workflow wiring, schemas, and hook safety. | Yes |
| `npm run plugin:lifecycle:verify` | Clean install, idempotence/repair, and removal against a temporary Cursor root, emitting machine-readable evidence. | No |
| `npm run benchmark:corpus-smoke` | 24 deterministic mock trials, no model calls. | Yes |
| `npm run probe` | Network-free local Editor/CLI capability evidence. Machine-specific, so it cannot run in CI. | No |
| `npm run release:dry-run` | Reproducible packaging and version parity across all seven version fields. | No |

`npm ci --ignore-scripts` is the documented install form. If it ever installs
something from a registry, that is a bug in your change, not in the command.

## Versioning

The version appears in seven places that must agree, enforced by
`npm run release:dry-run`:

1. `package.json`
2. `package-lock.json` (top-level `version`)
3. `package-lock.json` (`packages[""].version`)
4. `plugin/.cursor-plugin/plugin.json`
5. `.cursor-plugin/marketplace.json` (`metadata.version`)
6. `.cursor-plugin/marketplace.json` (plugin entry `version`)
7. `plugin/.cursor-plugin/inventory.json` (`plugin.version`)

Changing one and not the others fails the gate. The same tooling also pins the
name, MIT license, `Cursor Harness contributors` attribution, and repository URL.

## GitHub Actions

Actions are pinned to immutable 40-character commit SHAs, and
`tests/workflows/integration-gates.test.mjs` asserts that every `uses:` is a
first-party `actions/*` reference pinned that way. Tag or branch references
(`@v4`, `@main`) will fail the suite. Dependabot proposes SHA bumps weekly; that
is the intended update path.

## Changes to the plugin

Component discovery, frontmatter contracts, and markdown links inside `plugin/`
are validated. Adding a skill, agent, command, rule, or hook means
`npm run validate` must still pass, and `plugin/.cursor-plugin/inventory.json`
content hashes must be regenerated:

```sh
npm run inventory
```

Hook scripts are held to a stricter standard than the rest of the repository:
the validator rejects `node:child_process`, network modules, `fetch`, `eval`,
`new Function`, home-directory resolution, and filesystem mutation inside them.

## Pull requests

- Keep the diff scoped to one concern. Several release-gate changes are in
  flight at once; a narrow diff is far easier to land.
- Fill in the pull request template honestly — an unchecked box with an
  explanation is more useful than a checked one that was not run.
- Include the output of the gates that CI does not run.
- Update [CHANGELOG.md](CHANGELOG.md) under `## [Unreleased]` for anything
  user-visible.

## Security

Do not report vulnerabilities through public issues. Follow
[SECURITY.md](SECURITY.md), which also defines the supported boundary — local
Cursor Editor and CLI use in a trusted workspace, with Cloud Agent execution
explicitly out of scope.

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

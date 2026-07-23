## What changed and why

<!-- One or two sentences. Link the issue this closes. -->

Closes #

## Ship gates (required — CI enforces checkboxes)

Run locally: `bash scripts/gate-plan.sh` (or set `SHIP_GATES_CHANGED_FILES` to your changed paths) — check every agent listed under `checkboxes=`.

**Wave 1** (parallel, triggered nodes only):

- [ ] **code-reviewer** — when non-docs code or library paths changed (`readonly: true`)
- [ ] **security-reviewer** — on any non-docs-only PR (`readonly: true`)
- [ ] **data-model-documenter** — on any non-docs-only PR (writes `DATA_MODEL.md` at project root)
- [ ] **library-reviewer** — when diff touches `plugin/skills/` or `plugin/agents/` (`readonly: true`)

**Wave 2** (after Wave 1, when `DATA_MODEL.md` changed):

- [ ] **data-model-verifier** — adversarial property check against Source files (`readonly: true`)

Canonical DAG: [`plugin/references/gate-dag.md`](../plugin/references/gate-dag.md)

**No direct merge or tag** until this PR is open and `check-pr-ship-gates` is green. Release flow: merge PR → tag on `main` → `gh release create`.

## Gates CI does not run

CI runs `npm run validate`, `npm test`, install-lifecycle, plugin lifecycle, corpus smoke, and ship-gate checkbox enforcement. The gates below are local-only — please run them and paste or summarize the output. An unchecked box with an explanation is more useful than a checked one that was not run.

- [ ] `npm run plugin:lifecycle:verify` — clean install, idempotence/repair,
      and removal against a temporary Cursor root.
- [ ] `npm run probe` — network-free local Editor/CLI capability evidence.
      Machine-specific; note your OS and Cursor version.
- [ ] `npm run release:dry-run` — reproducible packaging.
- [ ] Version-field parity: if the version changed, all seven fields agree
      (`package.json`, `package-lock.json` top level, `package-lock.json`
      root package entry, `plugin/.cursor-plugin/plugin.json`,
      `.cursor-plugin/marketplace.json` metadata, `.cursor-plugin/marketplace.json`
      plugin entry, `plugin/.cursor-plugin/inventory.json`). Check N/A below if
      the version is unchanged.
- [ ] Not applicable — this pull request does not change the version.

<details>
<summary>Local gate output</summary>

```
paste output here
```

</details>

## Project constraints

- [ ] **No third-party dependencies added.** `package-lock.json` still contains
      zero external packages, and no `dependencies` or `devDependencies` were
      introduced. See [CONTRIBUTING.md](../CONTRIBUTING.md).
- [ ] **No unverified claims added.** Any new capability claim is backed by
      evidence in this diff, and the README's unverified-claims list is still
      accurate.
- [ ] Any new or changed GitHub Action is pinned to a 40-character commit SHA.
- [ ] `plugin/.cursor-plugin/inventory.json` regenerated (`npm run inventory`)
      if plugin components changed.
- [ ] [CHANGELOG.md](../CHANGELOG.md) updated under `## [Unreleased]` for
      user-visible changes.

## Overlap with other in-flight work

<!-- Several release-gate pull requests are open at once. Note any file this
     diff shares with another open PR so reviewers can sequence merges. -->

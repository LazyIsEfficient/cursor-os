## What changed and why

<!-- One or two sentences. Link the issue this closes. -->

Closes #

## Gates CI does not run

CI runs `npm run validate`, `npm test`, the install-lifecycle test, and the
corpus smoke. The gates below are local-only — please run them and paste or
summarize the output. An unchecked box with an explanation is more useful than
a checked one that was not run.

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

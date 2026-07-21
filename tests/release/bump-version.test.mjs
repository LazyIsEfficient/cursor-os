import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { bumpVersion, compareVersions } from "../../scripts/bump-version.mjs";
import { buildRelease } from "../../scripts/lib/release-package.mjs";

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

// Every field readVersionMetadata() in scripts/lib/release-package.mjs checks.
const VERSION_FIELDS = [
  ["package.json", (document) => document.version],
  ["package-lock.json", (document) => document.version],
  ["package-lock.json", (document) => document.packages[""].version],
  ["plugin/.cursor-plugin/plugin.json", (document) => document.version],
  [".cursor-plugin/marketplace.json", (document) => document.metadata.version],
  [".cursor-plugin/marketplace.json", (document) => document.plugins[0].version],
  ["plugin/.cursor-plugin/inventory.json", (document) => document.plugin.version],
];

const VERSIONED_FILES = [...new Set(VERSION_FIELDS.map(([file]) => file))];

const EXCLUDED = new Set([".git", "dist", "node_modules", ".claude"]);

async function withRepositoryCopy(prefix, run_) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  try {
    const repository = join(directory, "repository");
    await cp(root, repository, {
      recursive: true,
      filter: (source) => {
        const relativePath = source.slice(root.length + 1);
        if (relativePath === "") return true;
        return !EXCLUDED.has(relativePath.split(sep)[0]);
      },
    });
    await run_(repository, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function readVersions(repository) {
  const documents = new Map();
  for (const file of VERSIONED_FILES) {
    documents.set(file, JSON.parse(await readFile(join(repository, file), "utf8")));
  }
  return VERSION_FIELDS.map(([file, read]) => read(documents.get(file)));
}

async function readSources(repository) {
  return Object.fromEntries(await Promise.all(
    VERSIONED_FILES.map(async (file) => [file, await readFile(join(repository, file), "utf8")]),
  ));
}

test("bumping rewrites every release version field and keeps release parity", async () => {
  await withRepositoryCopy("cursor-harness-bump-apply-", async (repository, directory) => {
    const result = await bumpVersion({ repositoryRoot: repository, version: "0.2.0" });

    assert.equal(result.previousVersion, "0.1.0");
    assert.equal(result.version, "0.2.0");
    assert.equal(result.fields.length, VERSION_FIELDS.length);
    assert.deepEqual(result.drifted, []);
    assert.deepEqual(await readVersions(repository), VERSION_FIELDS.map(() => "0.2.0"));

    // The parity check in release-package.mjs is the real acceptance gate.
    const release = await buildRelease({
      repositoryRoot: repository,
      outputDirectory: join(directory, "dist"),
    });
    assert.equal(release.manifest.version, "0.2.0");
    assert.equal(release.manifest.archiveRoot, "cursor-harness-0.2.0");
  });
});

test("bumped repository passes the release:dry-run entrypoint", async () => {
  await withRepositoryCopy("cursor-harness-bump-dry-run-", async (repository, directory) => {
    await bumpVersion({ repositoryRoot: repository, version: "1.4.2" });

    const { stdout } = await run(
      process.execPath,
      [join(repository, "scripts/release.mjs"), "--output-dir", join(directory, "dist")],
      { cwd: repository },
    );
    const output = JSON.parse(stdout);

    assert.match(output.archive, /cursor-harness-1\.4\.2\.tar\.gz$/u);
    assert.match(output.sha256, /^[0-9a-f]{64}$/u);
    const checksum = await readFile(output.checksum, "utf8");
    assert.equal(checksum, `${output.sha256}  cursor-harness-1.4.2.tar.gz\n`);
  });
});

test("bumping forward and back restores byte-identical manifests", async () => {
  await withRepositoryCopy("cursor-harness-bump-roundtrip-", async (repository) => {
    const before = await readSources(repository);

    await bumpVersion({ repositoryRoot: repository, version: "0.9.0" });
    const bumped = await readSources(repository);
    for (const file of VERSIONED_FILES) assert.notEqual(bumped[file], before[file]);
    // Only version tokens may move; the surrounding formatting must not.
    assert.equal(
      bumped["package-lock.json"].replaceAll('"version": "0.9.0"', '"version": "0.1.0"'),
      before["package-lock.json"],
    );

    await bumpVersion({ repositoryRoot: repository, version: "0.1.0", force: true });
    assert.deepEqual(await readSources(repository), before);
  });
});

test("bumping rejects malformed versions without touching the repository", async () => {
  await withRepositoryCopy("cursor-harness-bump-malformed-", async (repository) => {
    const before = await readSources(repository);

    for (const version of ["", "1.0", "v1.0.0", "1.0.0.0", "0.1.0+build", "next", "1.0.0-", undefined]) {
      await assert.rejects(
        bumpVersion({ repositoryRoot: repository, version }),
        /target version must be semantic/u,
        `expected ${String(version)} to be rejected`,
      );
    }

    assert.deepEqual(await readSources(repository), before);
    assert.deepEqual(await readVersions(repository), VERSION_FIELDS.map(() => "0.1.0"));
  });
});

test("bumping refuses a no-op or a downgrade unless forced", async () => {
  await withRepositoryCopy("cursor-harness-bump-downgrade-", async (repository) => {
    const before = await readSources(repository);

    await assert.rejects(
      bumpVersion({ repositoryRoot: repository, version: "0.1.0" }),
      /version 0\.1\.0 is already the current version; pass --force/u,
    );
    await assert.rejects(
      bumpVersion({ repositoryRoot: repository, version: "0.0.9" }),
      /version 0\.0\.9 is lower than the current version 0\.1\.0; pass --force/u,
    );
    await assert.rejects(
      bumpVersion({ repositoryRoot: repository, version: "0.1.0-rc.1" }),
      /version 0\.1\.0-rc\.1 is lower than the current version 0\.1\.0; pass --force/u,
    );
    assert.deepEqual(await readSources(repository), before);

    const forced = await bumpVersion({ repositoryRoot: repository, version: "0.0.9", force: true });
    assert.equal(forced.version, "0.0.9");
    assert.deepEqual(await readVersions(repository), VERSION_FIELDS.map(() => "0.0.9"));
  });
});

test("bumping repairs drift across the parity fields and reports it", async () => {
  await withRepositoryCopy("cursor-harness-bump-drift-", async (repository) => {
    const lockPath = join(repository, "package-lock.json");
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    lock.packages[""].version = "0.0.1";
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

    await assert.rejects(
      buildRelease({ repositoryRoot: repository, outputDirectory: join(repository, "dist") }),
      /release version mismatch: package-lock\.json root package=0\.0\.1/u,
    );

    const result = await bumpVersion({ repositoryRoot: repository, version: "0.2.0" });

    assert.deepEqual(result.drifted, [{ label: "package-lock.json root package", version: "0.0.1" }]);
    assert.deepEqual(await readVersions(repository), VERSION_FIELDS.map(() => "0.2.0"));
  });
});

test("the command line entrypoint applies the bump and reports failures", async () => {
  await withRepositoryCopy("cursor-harness-bump-cli-", async (repository) => {
    const script = join(repository, "scripts/bump-version.mjs");

    const { stdout } = await run(process.execPath, [script, "0.3.0"], { cwd: repository });
    assert.deepEqual(JSON.parse(stdout).version, "0.3.0");
    assert.deepEqual(await readVersions(repository), VERSION_FIELDS.map(() => "0.3.0"));

    for (const argv of [["0.2.0"], ["nope"], []]) {
      const failure = await run(process.execPath, [script, ...argv], { cwd: repository })
        .then(() => null, (error) => error);
      assert.ok(failure, `expected ${JSON.stringify(argv)} to exit non-zero`);
      assert.equal(failure.code, 1);
      assert.match(failure.stderr, /Version bump failed:/u);
    }
    assert.deepEqual(await readVersions(repository), VERSION_FIELDS.map(() => "0.3.0"));
  });
});

test("version ordering follows semantic precedence including prereleases", () => {
  assert.equal(compareVersions("0.2.0", "0.1.9"), 1);
  assert.equal(compareVersions("0.1.0", "0.1.0"), 0);
  assert.equal(compareVersions("0.1.0", "0.2.0"), -1);
  assert.equal(compareVersions("1.0.0-alpha", "1.0.0"), -1);
  assert.equal(compareVersions("1.0.0-alpha.1", "1.0.0-alpha"), 1);
  assert.equal(compareVersions("1.0.0-alpha.2", "1.0.0-alpha.10"), -1);
  assert.equal(compareVersions("1.0.0-beta", "1.0.0-alpha"), 1);
});

test("bumping refuses to reformat a non-canonical manifest", async () => {
  await withRepositoryCopy("cursor-harness-bump-formatting-", async (repository) => {
    const packagePath = join(repository, "package.json");
    const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
    await writeFile(packagePath, `${JSON.stringify(packageJson, null, 4)}\n`);

    await assert.rejects(
      bumpVersion({ repositoryRoot: repository, version: "0.2.0" }),
      /package\.json is not canonically formatted/u,
    );
  });
});

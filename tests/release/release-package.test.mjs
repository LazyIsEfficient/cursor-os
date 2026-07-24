import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildRelease,
  extractReleaseArchive,
  readReleaseArchive,
} from "../../scripts/lib/release-package.mjs";
import {
  installLocalPlugin,
  uninstallLocalPlugin,
} from "../../scripts/lib/local-install-adapter.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function listFiles(directory) {
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile()) files.push(relative(directory, path));
  }
  return files;
}

async function listPluginFiles() {
  const pluginRoot = join(root, "plugin");
  const files = [];
  async function visit(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(relative(pluginRoot, path).split(sep).join("/"));
    }
  }
  await visit(pluginRoot);
  return [...files, "LICENSE"].sort();
}

async function withTemporaryDirectory(prefix, run) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("release archive is byte-for-byte reproducible with fixed metadata", async () => {
  await withTemporaryDirectory("cursor-harness-release-repro-", async (temporaryRoot) => {
    const first = await buildRelease({
      repositoryRoot: root,
      outputDirectory: join(temporaryRoot, "first"),
    });
    const second = await buildRelease({
      repositoryRoot: root,
      outputDirectory: join(temporaryRoot, "second"),
    });
    const firstBytes = await readFile(first.archivePath);
    const secondBytes = await readFile(second.archivePath);

    assert.deepEqual(firstBytes, secondBytes);
    assert.deepEqual(first.manifest, second.manifest);
    assert.deepEqual([...firstBytes.subarray(4, 8)], [0, 0, 0, 0], "gzip mtime must be zero");
    assert.equal(firstBytes[9], 0xff, "gzip OS field must be canonical");
    const entries = readReleaseArchive(firstBytes);
    assert.deepEqual(
      entries.map(({ path }) => path),
      [...entries.map(({ path }) => path)].sort(),
      "tar entries must have fixed lexical ordering",
    );
    assert.ok(entries.every(({ mtime }) => mtime === 0), "tar mtimes must be zero");
    assert.ok(entries.filter(({ type }) => type === "5").every(({ mode }) => mode === 0o755));
    assert.ok(entries.filter(({ type }) => type === "0").every(({ mode }) => mode === 0o644));
  });
});

test("release archive contains exactly the consumer allowlist", async () => {
  await withTemporaryDirectory("cursor-harness-release-allowlist-", async (temporaryRoot) => {
    const release = await buildRelease({ repositoryRoot: root, outputDirectory: temporaryRoot });
    const entries = readReleaseArchive(await readFile(release.archivePath));
    const rootPrefix = `${release.manifest.archiveRoot}/`;
    const files = entries
      .filter(({ type }) => type === "0")
      .map(({ path }) => {
        assert.ok(path.startsWith(rootPrefix));
        return path.slice(rootPrefix.length);
      })
      .sort();

    assert.deepEqual(files, await listPluginFiles());
    assert.ok(files.includes(".cursor-plugin/plugin.json"));
    assert.ok(files.includes("README.md"));
    assert.ok(files.includes("LICENSE"));
    assert.ok(files.every((path) => !/^(?:benchmark|tests?|\.git|plans?|docs)\//u.test(path)));
    assert.deepEqual(release.manifest.files.map(({ path }) => path), files);
  });
});

test("release checksum and machine-readable manifest match the archive", async () => {
  await withTemporaryDirectory("cursor-harness-release-checksum-", async (temporaryRoot) => {
    const release = await buildRelease({ repositoryRoot: root, outputDirectory: temporaryRoot });
    const archive = await readFile(release.archivePath);
    const expected = createHash("sha256").update(archive).digest("hex");
    const checksum = await readFile(release.checksumPath, "utf8");
    const persistedManifest = JSON.parse(await readFile(release.manifestPath, "utf8"));

    assert.equal(release.manifest.artifacts.archive.sha256, expected);
    assert.equal(checksum, `${expected}  ${release.manifest.artifacts.archive.file}\n`);
    assert.deepEqual(persistedManifest, release.manifest);
    for (const file of release.manifest.files) {
      assert.match(file.sha256, /^[0-9a-f]{64}$/u);
      assert.equal(file.mode, "0644");
    }
  });
});

test("release packaging fails when repository versions differ", async () => {
  await withTemporaryDirectory("cursor-harness-release-version-", async (temporaryRoot) => {
    const repository = join(temporaryRoot, "repository");
    const gitDirectory = join(root, ".git");
    const distDirectory = join(root, "dist");
    await cp(root, repository, {
      recursive: true,
      filter: (source) =>
        source !== gitDirectory &&
        !source.startsWith(`${gitDirectory}${sep}`) &&
        source !== distDirectory &&
        !source.startsWith(`${distDirectory}${sep}`),
    });
    const packagePath = join(repository, "package.json");
    const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
    packageJson.version = "0.2.1";
    await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

    await assert.rejects(
      buildRelease({ repositoryRoot: repository, outputDirectory: join(temporaryRoot, "output") }),
      /release version mismatch: package\.json=0\.2\.1; expected 0\.2\.0/u,
    );
  });
});

test("packaged payload installs and uninstalls in a temporary root with restoration", async () => {
  await withTemporaryDirectory("cursor-harness-release-install-", async (temporaryRoot) => {
    const release = await buildRelease({
      repositoryRoot: root,
      outputDirectory: join(temporaryRoot, "release"),
    });
    const extracted = join(temporaryRoot, "extracted");
    await extractReleaseArchive({ archivePath: release.archivePath, destination: extracted });
    const sourcePlugin = join(extracted, release.manifest.archiveRoot);
    const cursorRoot = join(temporaryRoot, "cursor-root");
    const destination = join(cursorRoot, "plugins/cursor-harness");
    await mkdir(destination, { recursive: true });
    await writeFile(join(destination, "user-content.txt"), "restore me\n");
    const originalConfig = '{\n  "version": 9,\n  "plugins": {"existing": {"path": "plugins/existing"}}\n}\n';
    await writeFile(join(cursorRoot, "plugins.json"), originalConfig);

    const installed = await installLocalPlugin({ cursorRoot, sourcePlugin });
    assert.equal(installed.status, "installed");
    assert.equal(await exists(join(destination, "user-content.txt")), false);
    assert.equal(
      JSON.parse(await readFile(join(destination, ".cursor-plugin/plugin.json"), "utf8")).version,
      "0.2.0",
    );
    assert.equal(await exists(join(destination, "benchmark")), false);

    const removed = await uninstallLocalPlugin({ cursorRoot, pluginId: "cursor-harness" });
    assert.equal(removed.status, "uninstalled");
    assert.equal(await readFile(join(destination, "user-content.txt"), "utf8"), "restore me\n");
    assert.equal(await readFile(join(cursorRoot, "plugins.json"), "utf8"), originalConfig);
    assert.deepEqual(await listFiles(destination), ["user-content.txt"]);
  });
});

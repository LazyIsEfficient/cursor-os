import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  EXIT_FAILURE,
  EXIT_LOADING_NOT_PROVEN,
  EXIT_OK,
  collectEditorEvidence,
  evaluateTranscript,
  exitCodeForEvidence,
  inspectComponent,
  parseArguments,
  resolveInstallCandidates,
  summarizeComponents,
} from "../../scripts/verify-editor-loading.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const script = join(root, "scripts/verify-editor-loading.mjs");
const sourcePlugin = join(root, "plugin");

async function withTemporaryRoot(run) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "cursor-harness-editor-verify-"));
  try {
    await run(temporaryRoot);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

// Records every path with its content hash, permission bits, size, and
// modification time.
//
// Content hashes alone are not enough. A [path, contentHash] snapshot compares
// equal after a permission change, after an mtime-only touch, and after a
// create-then-delete round trip — so it cannot substantiate a "byte-for-byte
// unchanged" or "never writes here" claim. Mode and mtime close the first two;
// the transient-write case is covered separately by asserting on the guard that
// refuses the write in the first place.
async function snapshotTree(root) {
  const entries = [];
  async function visit(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      const relativePath = relative(root, path);
      const metadata = await lstat(path);
      // mtimeMs is float-valued; nanosecond drift across a read would make this
      // flap, so compare at whole-millisecond resolution.
      const stamp = `mode:${(metadata.mode & 0o7777).toString(8)} mtime:${Math.floor(metadata.mtimeMs)}`;
      if (entry.isSymbolicLink()) entries.push([relativePath, `symlink:${await readlink(path)}`, stamp]);
      else if (entry.isDirectory()) {
        entries.push([relativePath, "directory", stamp]);
        await visit(path);
      } else {
        entries.push([
          relativePath,
          createHash("sha256").update(await readFile(path)).digest("hex"),
          `${stamp} size:${metadata.size}`,
        ]);
      }
    }
  }
  await visit(root);
  return entries;
}

async function installedCursorHome(temporaryRoot) {
  const cursorHome = join(temporaryRoot, "cursor");
  await mkdir(join(cursorHome, "plugins"), { recursive: true });
  await cp(sourcePlugin, join(cursorHome, "plugins/cursor-harness"), { recursive: true });
  await writeFile(
    join(cursorHome, "plugins.json"),
    `${JSON.stringify({ plugins: { "cursor-harness": { path: "plugins/cursor-harness", version: "0.1.0" } } }, null, 2)}\n`,
  );
  return cursorHome;
}

test("argument parsing rejects unknown options, missing values, and relative paths", () => {
  assert.throws(() => parseArguments(["--nope", "/tmp/x"]), /unknown option --nope/u);
  assert.throws(() => parseArguments(["--cursor-home"]), /--cursor-home requires a value/u);
  assert.throws(() => parseArguments(["--cursor-home", "--evidence"]), /--cursor-home requires a value/u);
  assert.throws(() => parseArguments(["--cursor-home", "relative/path"]), /must be an absolute path/u);
  assert.throws(() => parseArguments(["cursor-home"]), /unexpected argument cursor-home/u);
  assert.deepEqual(parseArguments(["--cursor-home", "/tmp/cursor"]), { cursorHomePath: "/tmp/cursor" });
});

test("install candidates cover the registry entry and both documented directories", () => {
  const candidates = resolveInstallCandidates({
    cursorHomePath: "/home/user/.cursor",
    pluginId: "cursor-harness",
    registry: { plugins: { "cursor-harness": { path: "plugins/cursor-harness" } } },
  });
  assert.deepEqual(candidates.map((candidate) => candidate.source), [
    "plugins.json",
    "local-symlink",
    "managed-directory",
  ]);
  assert.equal(candidates[1].path, "/home/user/.cursor/plugins/local/cursor-harness");
});

test("install candidates ignore an absolute registry path", () => {
  const candidates = resolveInstallCandidates({
    cursorHomePath: "/home/user/.cursor",
    pluginId: "cursor-harness",
    registry: { plugins: { "cursor-harness": { path: "/etc/passwd" } } },
  });
  assert.equal(candidates.some((candidate) => candidate.source === "plugins.json"), false);
});

test("component summary reports modified and missing components as unmatched", () => {
  const summary = summarizeComponents([
    { id: "a", kind: "agent", state: "present-matching" },
    { id: "b", kind: "agent", state: "present-modified" },
    { id: "c", kind: "rule", state: "missing" },
  ]);
  assert.equal(summary.allPresentMatching, false);
  assert.deepEqual(summary.unmatched, [
    { id: "b", state: "present-modified" },
    { id: "c", state: "missing" },
  ]);
  assert.deepEqual(summary.byKind.agent, { expected: 2, presentMatching: 1 });
});

test("an empty component set is never treated as a pass", () => {
  assert.equal(summarizeComponents([]).allPresentMatching, false);
});

test("transcript evaluation only reports the sentinel when it is present", () => {
  assert.equal(evaluateTranscript("nothing here").observed, false);
  assert.equal(evaluateTranscript("> cursor-harness-agent-discovered").observed, true);
});

test("a component path that escapes the installed plugin root is rejected", async () => {
  await withTemporaryRoot(async (temporaryRoot) => {
    const outside = join(temporaryRoot, "outside.md");
    await writeFile(outside, "should never be read\n");
    const installedRoot = join(temporaryRoot, "installed");
    await mkdir(installedRoot);

    await assert.rejects(
      inspectComponent(installedRoot, {
        id: "traversal",
        kind: "agent",
        path: "plugin/../outside.md",
        sha256: "0".repeat(64),
      }),
      /must not contain \.\./u,
    );
  });
});

test("a component path outside plugin/ is rejected", async () => {
  await assert.rejects(
    inspectComponent("/tmp", { id: "stray", kind: "agent", path: "elsewhere/x.md", sha256: "0".repeat(64) }),
    /is not inside plugin\//u,
  );
});

test("fails closed when the Cursor home does not exist", async () => {
  await withTemporaryRoot(async (temporaryRoot) => {
    await assert.rejects(
      collectEditorEvidence({ cursorHomePath: join(temporaryRoot, "absent") }),
      /no Cursor home at/u,
    );
  });
});

test("fails closed when the plugin is not installed, naming the paths checked", async () => {
  await withTemporaryRoot(async (temporaryRoot) => {
    const cursorHome = join(temporaryRoot, "cursor");
    await mkdir(cursorHome);
    await assert.rejects(
      collectEditorEvidence({ cursorHomePath: cursorHome }),
      (error) => {
        assert.match(error.message, /is not installed under/u);
        assert.match(error.message, /plugins\/local\/cursor-harness/u);
        assert.match(error.message, /This script never creates it/u);
        return true;
      },
    );
  });
});

test("fails closed when an installed component no longer matches the inventory", async () => {
  await withTemporaryRoot(async (temporaryRoot) => {
    const cursorHome = await installedCursorHome(temporaryRoot);
    await writeFile(join(cursorHome, "plugins/cursor-harness/agents/capability-probe.md"), "tampered\n");
    await assert.rejects(
      collectEditorEvidence({ cursorHomePath: cursorHome }),
      /installed components do not match the inventory/u,
    );
  });
});

test("refuses to write evidence inside the Cursor home", async () => {
  await withTemporaryRoot(async (temporaryRoot) => {
    const cursorHome = await installedCursorHome(temporaryRoot);
    await assert.rejects(
      collectEditorEvidence({
        cursorHomePath: cursorHome,
        evidencePath: join(cursorHome, "evidence.json"),
      }),
      /never writes there/u,
    );
  });
});

// Regression: the guard compared resolve()d paths, and resolve() is lexical.
// Pointing --evidence at a symlink whose target is the Cursor home passed the
// check and wrote a 14 KB artifact inside the home — an artifact whose own
// readOnly: true field then contradicted the file's existence.
test("a symlink pointing back into the Cursor home cannot smuggle a write past the guard", async () => {
  await withTemporaryRoot(async (temporaryRoot) => {
    const cursorHome = await installedCursorHome(temporaryRoot);
    const sneaky = join(temporaryRoot, "sneaky");
    await symlink(cursorHome, sneaky);
    const before = await snapshotTree(cursorHome);

    await assert.rejects(
      collectEditorEvidence({
        cursorHomePath: cursorHome,
        evidencePath: join(sneaky, "evidence.json"),
      }),
      /never writes there/u,
    );

    const result = spawnSync(
      process.execPath,
      [script, "--cursor-home", cursorHome, "--evidence", join(sneaky, "evidence.json")],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1, "the bypass must fail the process, not just the library call");
    assert.match(result.stderr, /never writes there/u);
    assert.equal(existsSync(join(cursorHome, "evidence.json")), false);
    assert.deepEqual(await snapshotTree(cursorHome), before);
  });
});

// The same lexical weakness applies to a symlinked Cursor home: only one side
// being realpath'd still lets the two paths compare as unrelated.
test("a symlinked Cursor home is resolved before the guard compares paths", async () => {
  await withTemporaryRoot(async (temporaryRoot) => {
    const cursorHome = await installedCursorHome(temporaryRoot);
    const homeAlias = join(temporaryRoot, "home-alias");
    await symlink(cursorHome, homeAlias);

    await assert.rejects(
      collectEditorEvidence({
        cursorHomePath: homeAlias,
        evidencePath: join(cursorHome, "evidence.json"),
      }),
      /never writes there/u,
    );
    assert.equal(existsSync(join(cursorHome, "evidence.json")), false);
  });
});

test("the read-only snapshot detects permission and timestamp changes, not just content", async () => {
  await withTemporaryRoot(async (temporaryRoot) => {
    const cursorHome = await installedCursorHome(temporaryRoot);
    const probe = join(cursorHome, "plugins.json");
    const before = await snapshotTree(cursorHome);

    // A content-hash-only snapshot compares equal after both of these, which is
    // why it could not substantiate "byte-for-byte unchanged".
    await chmod(probe, 0o600);
    assert.notDeepEqual(await snapshotTree(cursorHome), before, "a mode change must be detected");
    await chmod(probe, (await lstat(probe)).mode & 0o7777 | 0o644);

    const restored = await snapshotTree(cursorHome);
    const past = new Date(Date.now() - 60_000);
    await utimes(probe, past, past);
    assert.notDeepEqual(await snapshotTree(cursorHome), restored, "an mtime change must be detected");
  });
});

test("a matching install yields evidence bound to the plugin digest and no loading claim", async () => {
  await withTemporaryRoot(async (temporaryRoot) => {
    const cursorHome = await installedCursorHome(temporaryRoot);
    const evidence = await collectEditorEvidence({ cursorHomePath: cursorHome });

    assert.equal(evidence.schemaVersion, "1.0.0");
    assert.equal(evidence.artifact, "editor-plugin-loading-evidence");
    assert.match(evidence.pluginSourceSha256, /^[a-f0-9]{64}$/u);
    assert.match(evidence.inventorySha256, /^[a-f0-9]{64}$/u);
    assert.equal(evidence.claims.componentsInstalledOnDisk.status, "observed");
    assert.equal(evidence.claims.editorComponentLoading.status, "not-proven");
    assert.deepEqual(evidence.summary.byKind.agent, { expected: 17, presentMatching: 17 });
    assert.deepEqual(evidence.summary.byKind.rule, { expected: 7, presentMatching: 7 });
    assert.deepEqual(evidence.summary.byKind.command, { expected: 3, presentMatching: 3 });
    assert.deepEqual(evidence.summary.byKind.skill, { expected: 37, presentMatching: 37 });
  });
});

test("a supplied sentinel transcript is reported as an operator attestation", async () => {
  await withTemporaryRoot(async (temporaryRoot) => {
    const cursorHome = await installedCursorHome(temporaryRoot);
    const transcriptPath = join(temporaryRoot, "transcript.txt");
    await writeFile(transcriptPath, "cursor-harness-agent-discovered\n");
    const evidence = await collectEditorEvidence({ cursorHomePath: cursorHome, transcriptPath });

    assert.equal(evidence.claims.editorComponentLoading.status, "operator-attested");
    assert.match(evidence.transcript.transcriptSha256, /^[a-f0-9]{64}$/u);
  });
});

test("the local-development symlink layout is read, never created", async () => {
  await withTemporaryRoot(async (temporaryRoot) => {
    const cursorHome = join(temporaryRoot, "cursor");
    await mkdir(join(cursorHome, "plugins/local"), { recursive: true });
    await symlink(sourcePlugin, join(cursorHome, "plugins/local/cursor-harness"));

    const evidence = await collectEditorEvidence({ cursorHomePath: cursorHome });
    assert.equal(evidence.installation.source, "local-symlink");
    assert.equal(evidence.installation.isSymbolicLink, true);
    assert.equal(evidence.installation.registeredInPluginsJson, false);
  });
});

test("a successful run leaves the Cursor home byte-for-byte unchanged", async () => {
  await withTemporaryRoot(async (temporaryRoot) => {
    const cursorHome = await installedCursorHome(temporaryRoot);
    const before = await snapshotTree(cursorHome);
    assert.ok(before.length > 100, "snapshot must actually cover the installed tree");

    const result = spawnSync(process.execPath, [script, "--cursor-home", cursorHome], {
      encoding: "utf8",
    });
    // No transcript, so the loading claim is unproven and the run exits 3. The
    // read-only property must hold on that path too, not only on a clean pass.
    assert.equal(result.status, EXIT_LOADING_NOT_PROVEN, result.stderr);

    assert.deepEqual(await snapshotTree(cursorHome), before);
  });
});

test("the script never creates the local-development symlink when nothing is installed", async () => {
  await withTemporaryRoot(async (temporaryRoot) => {
    const cursorHome = join(temporaryRoot, "cursor");
    await mkdir(cursorHome);

    spawnSync(process.execPath, [script, "--cursor-home", cursorHome], { encoding: "utf8" });

    assert.deepEqual(await snapshotTree(cursorHome), []);
  });
});

test("the script exits nonzero and writes nothing to the Cursor home on failure", async () => {
  await withTemporaryRoot(async (temporaryRoot) => {
    const cursorHome = join(temporaryRoot, "cursor");
    await mkdir(cursorHome);
    const result = spawnSync(process.execPath, [script, "--cursor-home", cursorHome], {
      encoding: "utf8",
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Editor plugin loading verification failed/u);
    assert.equal(result.stdout, "");
  });
});

test("the script writes evidence to an operator-chosen path outside the Cursor home", async () => {
  await withTemporaryRoot(async (temporaryRoot) => {
    const cursorHome = await installedCursorHome(temporaryRoot);
    const evidencePath = join(temporaryRoot, "out/evidence.json");
    const result = spawnSync(
      process.execPath,
      [script, "--cursor-home", cursorHome, "--evidence", evidencePath],
      { encoding: "utf8" },
    );

    // Exits 3 without a transcript, and still writes the artifact: the
    // install observation in it is real even though loading is unproven.
    assert.equal(result.status, EXIT_LOADING_NOT_PROVEN, result.stderr);
    const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
    assert.equal(evidence.readOnly, true);
    assert.equal(evidence.cursorHomePath, cursorHome);
  });
});

// The defect this locks: the script exited 0 while its own artifact reported
// `not-proven`. Exit status is what CI and reviewers read, so a green check
// meant "verified" when nothing had been verified.
test("exit status matches the loading claim rather than always reporting success", () => {
  assert.equal(
    exitCodeForEvidence({ claims: { editorComponentLoading: { status: "not-proven" } } }),
    EXIT_LOADING_NOT_PROVEN,
  );
  assert.equal(
    exitCodeForEvidence({ claims: { editorComponentLoading: { status: "operator-attested" } } }),
    EXIT_OK,
  );
  assert.equal(
    exitCodeForEvidence({ claims: { editorComponentLoading: { status: "observed" } } }),
    EXIT_OK,
  );
});

// An allowlist, not a `!== "not-proven"` test: a status nobody anticipated is
// an unproven status, and must not exit 0 by default.
test("an unrecognised or absent loading status is treated as unproven", () => {
  assert.equal(
    exitCodeForEvidence({ claims: { editorComponentLoading: { status: "probably-fine" } } }),
    EXIT_LOADING_NOT_PROVEN,
  );
  assert.equal(exitCodeForEvidence({ claims: {} }), EXIT_LOADING_NOT_PROVEN);
  assert.equal(exitCodeForEvidence({}), EXIT_LOADING_NOT_PROVEN);
});

// "not proven" and "the install is broken" are different operator situations.
// Collapsing them into one code would make the fix useless: an operator could
// not tell a missing transcript from a corrupted install.
test("the unproven exit code is distinguishable from the hard-failure exit code", async () => {
  await withTemporaryRoot(async (temporaryRoot) => {
    const cursorHome = await installedCursorHome(temporaryRoot);
    const transcriptPath = join(temporaryRoot, "transcript.txt");
    await writeFile(transcriptPath, "cursor-harness-agent-discovered\n");

    const unproven = spawnSync(process.execPath, [script, "--cursor-home", cursorHome], {
      encoding: "utf8",
    });
    const attested = spawnSync(
      process.execPath,
      [script, "--cursor-home", cursorHome, "--transcript", transcriptPath],
      { encoding: "utf8" },
    );
    const broken = spawnSync(
      process.execPath,
      [script, "--cursor-home", join(temporaryRoot, "absent")],
      { encoding: "utf8" },
    );

    assert.equal(unproven.status, EXIT_LOADING_NOT_PROVEN);
    assert.equal(attested.status, EXIT_OK, attested.stderr);
    assert.equal(broken.status, EXIT_FAILURE);
    assert.notEqual(EXIT_LOADING_NOT_PROVEN, EXIT_FAILURE);

    // The unproven run still emits its artifact on stdout and explains itself
    // on stderr; the hard failure emits no artifact at all.
    assert.equal(
      JSON.parse(unproven.stdout).claims.editorComponentLoading.status,
      "not-proven",
    );
    assert.match(unproven.stderr, /is not-proven \(exit 3\)/u);
    assert.equal(broken.stdout, "");
  });
});

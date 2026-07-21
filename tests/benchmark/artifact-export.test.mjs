import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { exportSanitizedArtifacts } from "../../benchmark/lib/artifact-export.mjs";
import { hashFile } from "../../benchmark/lib/util.mjs";

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

test("sanitized export allowlists evidence, excludes raw roots, and writes verified hashes", async () => {
  const root = await mkdtemp(join(tmpdir(), "benchmark-export-"));
  try {
    const runRoot = join(root, "raw", "run-1");
    const artifactRoot = join(runRoot, "trials", "trial-1", "artifacts");
    const exportRoot = join(root, "sanitized", "run-1");
    const canaryFile = join(root, "secret-canary.txt");
    await writeFile(canaryFile, "absent-secret-canary");
    await Promise.all([
      mkdir(artifactRoot, { recursive: true }),
      mkdir(join(runRoot, "trials", "trial-1", "workspace"), { recursive: true }),
      mkdir(join(runRoot, "trials", "trial-1", "cursor-home"), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(runRoot, "results.ndjson"), "{\"result\":\"ok\"}\n"),
      writeFile(join(runRoot, "report.json"), "{\"eligible\":false}\n"),
      writeFile(join(runRoot, "plugin-lifecycle.json"), "{\"removalVerified\":true}\n"),
      writeFile(join(artifactRoot, "telemetry.ndjson"), "{\"event\":\"safe\"}\n"),
      writeFile(join(artifactRoot, "stderr.log"), "safe diagnostic\n"),
      writeFile(join(artifactRoot, "unselected.tmp"), "must not export\n"),
      writeFile(join(runRoot, "trials", "trial-1", "workspace", "source.txt"), "private workspace\n"),
      writeFile(join(runRoot, "trials", "trial-1", "cursor-home", "auth.json"), "private auth config\n"),
    ]);

    const manifest = await exportSanitizedArtifacts({ runRoot, exportRoot, secretCanaryFiles: [canaryFile] });

    assert.deepEqual(manifest.files.map(({ path }) => path), [
      "plugin-lifecycle.json",
      "report.json",
      "results.ndjson",
      "trials/trial-1/artifacts/stderr.log",
      "trials/trial-1/artifacts/telemetry.ndjson",
    ]);
    for (const file of manifest.files) {
      assert.equal(file.sha256, await hashFile(join(exportRoot, file.path)));
    }
    assert.equal(await exists(join(exportRoot, "trials", "trial-1", "workspace", "source.txt")), false);
    assert.equal(await exists(join(exportRoot, "trials", "trial-1", "cursor-home", "auth.json")), false);
    assert.equal(await exists(join(exportRoot, "trials", "trial-1", "artifacts", "unselected.tmp")), false);
    assert.deepEqual(
      JSON.parse(await readFile(join(exportRoot, "export-manifest.json"), "utf8")),
      manifest,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sanitized export fails closed on exact canaries and credential patterns", async () => {
  const root = await mkdtemp(join(tmpdir(), "benchmark-export-secret-"));
  try {
    const runRoot = join(root, "raw", "run-2");
    const artifactRoot = join(runRoot, "trials", "trial-1", "artifacts");
    const exportRoot = join(root, "sanitized", "run-2");
    const canaryFile = join(root, "secret-canary.txt");
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(join(runRoot, "results.ndjson"), "{\"result\":\"ok\"}\n");
    await writeFile(join(artifactRoot, "stderr.log"), "prefix exact-secret-canary suffix\n");
    await writeFile(canaryFile, "exact-secret-canary");

    await assert.rejects(
      exportSanitizedArtifacts({ runRoot, exportRoot, secretCanaryFiles: [canaryFile] }),
      /secret canary/u,
    );
    assert.equal(await exists(exportRoot), false);

    await writeFile(join(artifactRoot, "stderr.log"), Buffer.from("CURSOR_API_KEY=cur_live_abcdefghijklmnopqrstuvwxyz123456"));
    await assert.rejects(
      exportSanitizedArtifacts({ runRoot, exportRoot, secretCanaryFiles: [canaryFile] }),
      /credential pattern/u,
    );
    assert.equal(await exists(exportRoot), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// JSON.stringify escapes `"`, `\`, and control characters, so a secret carrying any
// of them used to survive a raw-byte comparison against the canary and reach the
// published export.
const JSON_ESCAPED_SECRETS = [
  ["a double quote", `sec${String.fromCharCode(34)}ret-quote-1234`],
  ["a backslash", `sec${String.fromCharCode(92)}ret-backslash-1234`],
  ["a newline", `line1${String.fromCharCode(10)}line2-secret-1234`],
  ["a unicode escape", `secret${String.fromCharCode(1)}control-1234`],
  ["a literal non-ascii character", `sec${String.fromCharCode(233)}ret-caf${String.fromCharCode(233)}-1234`],
];

for (const [label, secret] of JSON_ESCAPED_SECRETS) {
  test(`sanitized export refuses a canary containing ${label} after JSON encoding`, async () => {
    const root = await mkdtemp(join(tmpdir(), "benchmark-export-escaped-"));
    try {
      const runRoot = join(root, "raw", "run-3");
      const exportRoot = join(root, "sanitized", "run-3");
      const canaryFile = join(root, "secret-canary.txt");
      await mkdir(runRoot, { recursive: true });
      await writeFile(
        join(runRoot, "results.ndjson"),
        `${JSON.stringify({ result: "ok", note: secret })}\n`,
      );
      await writeFile(canaryFile, secret);

      await assert.rejects(
        exportSanitizedArtifacts({ runRoot, exportRoot, secretCanaryFiles: [canaryFile] }),
        /secret canary/u,
      );
      assert.equal(await exists(exportRoot), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("sanitized export refuses to run when no secret canary is supplied", async () => {
  const root = await mkdtemp(join(tmpdir(), "benchmark-export-nocanary-"));
  try {
    const runRoot = join(root, "raw", "run-4");
    const exportRoot = join(root, "sanitized", "run-4");
    await mkdir(runRoot, { recursive: true });
    await writeFile(join(runRoot, "results.ndjson"), "{\"result\":\"ok\"}\n");

    await assert.rejects(
      exportSanitizedArtifacts({ runRoot, exportRoot }),
      /at least one --secret-canary-file/u,
    );
    await assert.rejects(
      exportSanitizedArtifacts({ runRoot, exportRoot, secretCanaryFiles: [] }),
      /at least one --secret-canary-file/u,
    );
    assert.equal(await exists(exportRoot), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sanitized export fails closed when JSON evidence cannot be parsed for scanning", async () => {
  const root = await mkdtemp(join(tmpdir(), "benchmark-export-unparsable-"));
  try {
    const runRoot = join(root, "raw", "run-5");
    const exportRoot = join(root, "sanitized", "run-5");
    const canaryFile = join(root, "secret-canary.txt");
    await mkdir(runRoot, { recursive: true });
    await writeFile(join(runRoot, "results.ndjson"), "{\"result\":\"ok\"}\n");
    await writeFile(join(runRoot, "report.json"), "{ truncated evidence");
    await writeFile(canaryFile, "absent-secret-canary");

    await assert.rejects(
      exportSanitizedArtifacts({ runRoot, exportRoot, secretCanaryFiles: [canaryFile] }),
      /could not be parsed for credential scanning/u,
    );
    assert.equal(await exists(exportRoot), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// stream.ndjson mirrors Cursor CLI stdout verbatim, so non-JSON lines are normal and
// must not abort the export -- but any escaped secret on a line that does parse is
// still caught.
test("sanitized export tolerates non-JSON lines in third-party stream.ndjson", async () => {
  const root = await mkdtemp(join(tmpdir(), "benchmark-export-stream-"));
  try {
    const runRoot = join(root, "raw", "run-7");
    const artifactRoot = join(runRoot, "trials", "trial-1", "artifacts");
    const exportRoot = join(root, "sanitized", "run-7");
    const canaryFile = join(root, "secret-canary.txt");
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(join(runRoot, "results.ndjson"), "{\"result\":\"ok\"}\n");
    await writeFile(
      join(artifactRoot, "stream.ndjson"),
      "Cursor CLI banner: not JSON\n{\"type\":\"result\",\"subtype\":\"ok\"}\n",
    );
    await writeFile(canaryFile, "absent-secret-canary");

    const manifest = await exportSanitizedArtifacts({ runRoot, exportRoot, secretCanaryFiles: [canaryFile] });
    assert.ok(manifest.files.some(({ path }) => path.endsWith("stream.ndjson")));

    // A secret escaped inside a parseable line of that same file is still refused.
    await rm(exportRoot, { recursive: true, force: true });
    const secret = `sec${String.fromCharCode(34)}ret-in-stream-1234`;
    await writeFile(
      join(artifactRoot, "stream.ndjson"),
      `Cursor CLI banner: not JSON\n${JSON.stringify({ type: "result", note: secret })}\n`,
    );
    await writeFile(canaryFile, secret);
    await assert.rejects(
      exportSanitizedArtifacts({ runRoot, exportRoot, secretCanaryFiles: [canaryFile] }),
      /secret canary/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sanitized export scans non-JSON evidence and JSON embedded in logs", async () => {
  const root = await mkdtemp(join(tmpdir(), "benchmark-export-log-"));
  try {
    const runRoot = join(root, "raw", "run-6");
    const artifactRoot = join(runRoot, "trials", "trial-1", "artifacts");
    const exportRoot = join(root, "sanitized", "run-6");
    const canaryFile = join(root, "secret-canary.txt");
    const secret = `sec${String.fromCharCode(34)}ret-in-log-1234`;
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(join(runRoot, "results.ndjson"), "{\"result\":\"ok\"}\n");
    await writeFile(
      join(artifactRoot, "stderr.log"),
      `plain diagnostic line\n${JSON.stringify({ message: secret })}\n`,
    );
    await writeFile(canaryFile, secret);

    await assert.rejects(
      exportSanitizedArtifacts({ runRoot, exportRoot, secretCanaryFiles: [canaryFile] }),
      /secret canary/u,
    );
    assert.equal(await exists(exportRoot), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

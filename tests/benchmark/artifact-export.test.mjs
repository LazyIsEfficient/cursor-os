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

    const manifest = await exportSanitizedArtifacts({ runRoot, exportRoot });

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
      exportSanitizedArtifacts({ runRoot, exportRoot }),
      /credential pattern/u,
    );
    assert.equal(await exists(exportRoot), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

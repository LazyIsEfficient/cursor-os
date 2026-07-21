import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { readBenchmarkManifest } from "../../benchmark/lib/manifest.mjs";
import { deriveRunPlan } from "../../benchmark/lib/plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixturesRoot = join(root, "benchmark", "fixtures");
const profiles = [
  { path: join(root, "benchmark", "smoke-24.v1.json"), profile: "smoke-24", pairs: 12, trials: 24 },
  { path: join(root, "benchmark", "release-72.v1.json"), profile: "release-72", pairs: 36, trials: 72 },
];
const expectedCategories = {
  "localized-correctness": 3,
  "parallel-disjoint": 3,
  "shared-interface-conflict": 2,
  "objective-quality": 2,
  "security-prompt-injection": 2,
};

test("versioned profiles contain the exact 12-fixture corpus and trial counts", async () => {
  const fixtureDirectories = (await readdir(fixturesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.equal(fixtureDirectories.length, 12);

  for (const expected of profiles) {
    const loaded = await readBenchmarkManifest(expected.path);
    const fixtureIds = loaded.fixtures.map(({ manifest }) => manifest.fixtureId);
    assert.equal(loaded.manifest.profile, expected.profile);
    assert.equal(loaded.fixtures.length, 12);
    assert.equal(new Set(fixtureIds).size, 12);
    assert.deepEqual([...fixtureIds].sort(), fixtureDirectories);
    assert.equal(deriveRunPlan(loaded, { runId: `test-${expected.profile}` }).pairs.length, expected.pairs);
    assert.equal(expected.pairs * 2, expected.trials);

    const categoryCounts = Object.fromEntries(
      Object.keys(expectedCategories).map((category) => [
        category,
        loaded.fixtures.filter(({ manifest }) => manifest.category === category).length,
      ]),
    );
    assert.deepEqual(categoryCounts, expectedCategories);

    for (const fixtureId of fixtureIds) {
      const selected = await readBenchmarkManifest(expected.path, { fixtureIds: [fixtureId] });
      assert.equal(selected.fixtures.length, 1);
      assert.equal(selected.fixtures[0].manifest.fixtureId, fixtureId);
      assert.ok(selected.fixtures[0].workspaceSourcePath.startsWith(selected.fixtures[0].fixtureDirectory));
    }
  }
});

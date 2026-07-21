import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { captureIntegrity, runEvaluators } from "../../benchmark/lib/evaluator.mjs";
import { readBenchmarkManifest } from "../../benchmark/lib/manifest.mjs";
import { hashFile, hashTree } from "../../benchmark/lib/util.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, "../..");
const fixturesRoot = join(repositoryRoot, "benchmark", "fixtures");
const expectedFixtures = [
  "correctness-off-by-one",
  "correctness-regression-repair",
  "correctness-state-corruption",
];
const expectedWritePaths = {
  "correctness-off-by-one": ["src/window.mjs"],
  "correctness-regression-repair": ["src/config.mjs"],
  "correctness-state-corruption": ["ledger.py"],
};

function schemaTarget(schema, rootSchema) {
  if (!schema.$ref) return schema;
  return schema.$ref
    .slice(2)
    .split("/")
    .reduce((value, token) => value[token.replaceAll("~1", "/").replaceAll("~0", "~")], rootSchema);
}

function schemaErrors(instance, inputSchema, rootSchema = inputSchema, path = "$") {
  const schema = schemaTarget(inputSchema, rootSchema);
  const errors = [];
  const fail = (message) => errors.push(`${path}: ${message}`);

  if (schema.const !== undefined && instance !== schema.const) fail(`must equal ${schema.const}`);
  if (schema.enum && !schema.enum.includes(instance)) fail("must be an allowed value");

  if (schema.type === "object") {
    if (instance === null || typeof instance !== "object" || Array.isArray(instance)) {
      fail("must be an object");
      return errors;
    }
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(instance, required)) fail(`missing ${required}`);
    }
    for (const [key, value] of Object.entries(instance)) {
      if (schema.properties?.[key]) {
        errors.push(...schemaErrors(value, schema.properties[key], rootSchema, `${path}.${key}`));
      } else if (schema.additionalProperties === false) {
        fail(`unexpected ${key}`);
      }
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(instance)) {
      fail("must be an array");
      return errors;
    }
    if (schema.minItems !== undefined && instance.length < schema.minItems) fail("has too few items");
    instance.forEach((value, index) => {
      errors.push(...schemaErrors(value, schema.items, rootSchema, `${path}[${index}]`));
    });
  } else if (schema.type === "string") {
    if (typeof instance !== "string") {
      fail("must be a string");
      return errors;
    }
    if (schema.minLength !== undefined && instance.length < schema.minLength) fail("is too short");
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(instance)) fail("has invalid format");
  } else if (schema.type === "integer") {
    if (!Number.isInteger(instance)) {
      fail("must be an integer");
      return errors;
    }
    if (schema.minimum !== undefined && instance < schema.minimum) fail("is below minimum");
    if (schema.maximum !== undefined && instance > schema.maximum) fail("is above maximum");
  }

  return errors;
}

const knownGoodSolutions = {
  async "correctness-off-by-one"(workspace) {
    await writeFile(join(workspace, "src", "window.mjs"), `export function centeredWindow(values, center, radius) {
  if (!Number.isInteger(center) || !Number.isInteger(radius) || radius < 0) {
    throw new TypeError("center and radius must be non-negative integers");
  }

  const start = Math.max(0, center - radius);
  const end = Math.min(values.length, center + radius + 1);
  return values.slice(start, end);
}
`);
  },
  async "correctness-state-corruption"(workspace) {
    await writeFile(join(workspace, "ledger.py"), `def transfer(accounts, source, destination, amount):
    if amount <= 0:
        raise ValueError("amount must be positive")

    if accounts[source] < amount:
        return False

    accounts[source] -= amount
    accounts[destination] += amount
    return True
`);
  },
  async "correctness-regression-repair"(workspace) {
    await writeFile(join(workspace, "src", "config.mjs"), `export function parseConfig(text) {
  const entries = [];

  for (const rawLine of text.split(/\\r?\\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    const key = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? "" : line.slice(separator + 1);
    entries.push([key.trim(), value.trim()]);
  }

  return Object.fromEntries(entries);
}
`);
  },
};

test("localized correctness fixtures fail as seeded and pass known-good repairs", async (t) => {
  const discovered = (await readdir(fixturesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("correctness-"))
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(discovered, expectedFixtures);

  const schema = JSON.parse(
    await readFile(join(repositoryRoot, "schemas", "benchmark-fixture-manifest.schema.json"), "utf8"),
  );
  const tempRoot = await mkdtemp(join(tmpdir(), "correctness-fixtures-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));

  for (const fixtureName of discovered) {
    await cp(
      join(fixturesRoot, fixtureName),
      join(tempRoot, "benchmark", "fixtures", fixtureName),
      { recursive: true },
    );
  }

  const benchmarkManifestPath = join(tempRoot, "benchmark.json");
  await writeFile(benchmarkManifestPath, `${JSON.stringify({
    schemaVersion: "1.0.0",
    benchmarkId: "correctness-fixtures-contract",
    profile: "custom",
    seed: "contract-test",
    repetitions: 1,
    fixtures: discovered.map((name) => `benchmark/fixtures/${name}/fixture.json`),
    outputDirectory: "results",
  }, null, 2)}\n`);
  const loaded = await readBenchmarkManifest(benchmarkManifestPath);
  assert.equal(loaded.fixtures.length, 3);

  for (const { manifest: fixture, fixtureDirectory, workspaceSourcePath } of loaded.fixtures) {
    assert.deepEqual(schemaErrors(fixture, schema), []);
    assert.equal(fixture.category, "localized-correctness");
    assert.deepEqual(fixture.expectedWritePaths, expectedWritePaths[fixture.fixtureId]);
    assert.match(fixture.workspace.lockfileSha256, /^[a-f0-9]{64}$/u);
    assert.match(fixture.integrity.evaluatorBundleSha256, /^[a-f0-9]{64}$/u);
    assert.equal(fixture.integrity.networkPolicy, "deny");
    assert.equal(fixture.evaluators.length, 1);
    assert.equal(fixture.evaluators[0].visibility, "hidden-from-agent");
    assert.ok(fixture.evaluators[0].command.arguments.includes("{workspace}"));

    const seedPath = workspaceSourcePath;
    const evaluatorPath = join(fixtureDirectory, fixture.evaluators[0].command.workingDirectory);
    assert.equal(relative(seedPath, evaluatorPath).startsWith(".."), true);
    assert.equal(
      await hashFile(join(seedPath, fixture.workspace.lockfilePath)),
      fixture.workspace.lockfileSha256,
    );
    assert.equal(await hashTree(join(fixtureDirectory, "evaluators")), fixture.integrity.evaluatorBundleSha256);
    for (const canaryId of fixture.integrity.canaryIds) {
      assert.match(await readFile(join(fixtureDirectory, "canaries", canaryId), "utf8"), /fixture-integrity-canary/u);
    }

    const trialRoot = join(tempRoot, "trials", fixture.fixtureId);
    const workspacePath = join(trialRoot, "workspace");
    const artifactPath = join(trialRoot, "artifacts");
    await cp(seedPath, workspacePath, { recursive: true });
    await mkdir(artifactPath, { recursive: true });
    await assert.rejects(readFile(join(workspacePath, "evaluators")), /ENOENT/u);
    await assert.rejects(readFile(join(workspacePath, "canaries")), /ENOENT/u);

    const beforeIntegrity = await captureIntegrity({ fixture, fixtureDirectory });
    const seeded = await runEvaluators({
      fixture,
      fixtureDirectory,
      workspacePath,
      artifactPath,
      beforeIntegrity,
    });
    assert.deepEqual(
      seeded.evaluators.map(({ outcome, actualExitCode }) => ({ outcome, actualExitCode })),
      [{ outcome: "fail", actualExitCode: 1 }],
    );
    assert.ok(seeded.tamperOutcomes.every(({ outcome }) => outcome === "intact"));

    await knownGoodSolutions[fixture.fixtureId](workspacePath);
    const repaired = await runEvaluators({
      fixture,
      fixtureDirectory,
      workspacePath,
      artifactPath,
      beforeIntegrity,
    });
    assert.deepEqual(
      repaired.evaluators.map(({ outcome, actualExitCode }) => ({ outcome, actualExitCode })),
      [{ outcome: "pass", actualExitCode: 0 }],
    );
    assert.ok(repaired.tamperOutcomes.every(({ outcome }) => outcome === "intact"));
  }
});

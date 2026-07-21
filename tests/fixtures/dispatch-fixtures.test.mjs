import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { readBenchmarkManifest } from "../../benchmark/lib/manifest.mjs";
import { hashFile, hashTree } from "../../benchmark/lib/util.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, "../..");
const fixturesRoot = join(repositoryRoot, "benchmark", "fixtures");

const fixtures = {
  "dispatch-string-utils": {
    category: "parallel-disjoint",
    expected: ["src/slugify.mjs", "src/title-case.mjs", "src/word-count.mjs"],
    good: {
      "src/slugify.mjs": `export function slugify(value) {
  return String(value).trim().toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}
`,
      "src/title-case.mjs": `export function titleCase(value) {
  return String(value).trim().split(/\\s+/u).filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
`,
      "src/word-count.mjs": `export function wordCount(value) {
  const text = String(value).trim();
  return text === "" ? 0 : text.split(/\\s+/u).length;
}
`,
    },
  },
  "dispatch-record-utils": {
    category: "parallel-disjoint",
    expected: ["src/group-by-status.mjs", "src/sum-by-category.mjs", "src/sort-by-priority.mjs"],
    good: {
      "src/group-by-status.mjs": `export function groupByStatus(records) {
  return records.reduce((groups, record) => {
    (groups[record.status] ??= []).push(record);
    return groups;
  }, {});
}
`,
      "src/sum-by-category.mjs": `export function sumByCategory(records) {
  return records.reduce((totals, record) => {
    totals[record.category] = (totals[record.category] ?? 0) + record.amount;
    return totals;
  }, {});
}
`,
      "src/sort-by-priority.mjs": `export function sortByPriority(records) {
  return records.map((record, index) => ({ record, index }))
    .sort((left, right) => left.record.priority - right.record.priority || left.index - right.index)
    .map(({ record }) => record);
}
`,
    },
  },
  "dispatch-input-utils": {
    category: "parallel-disjoint",
    expected: ["src/is-hex-color.mjs", "src/is-safe-username.mjs", "src/parse-port.mjs"],
    good: {
      "src/is-hex-color.mjs": `export function isHexColor(value) {
  return typeof value === "string" && /^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/iu.test(value);
}
`,
      "src/is-safe-username.mjs": `export function isSafeUsername(value) {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{2,15}$/u.test(value);
}
`,
      "src/parse-port.mjs": `export function parsePort(value) {
  if (typeof value === "string" && !/^[1-9]\\d*$/u.test(value)) return null;
  if (typeof value !== "string" && !Number.isInteger(value)) return null;
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}
`,
    },
  },
  "conflict-public-api": {
    category: "shared-interface-conflict",
    sharedPath: "src/index.mjs",
    inconsistent: `export const codecVersion = "1.0";
export { encodeKey } from "./encode-key.mjs";
`,
    expected: [
      "src/encode-key.mjs",
      "src/decode-key.mjs",
      "src/write-record.mjs",
      "src/read-record.mjs",
      "src/index.mjs",
    ],
    good: {
      "src/encode-key.mjs": `export function encodeKey(parts) {
  return parts.map((part) => encodeURIComponent(part)).join(":");
}
`,
      "src/decode-key.mjs": `export function decodeKey(key) {
  return key.split(":").map((part) => decodeURIComponent(part));
}
`,
      "src/index.mjs": `export const codecVersion = "1.0";
export { encodeKey } from "./encode-key.mjs";
export { decodeKey } from "./decode-key.mjs";
`,
      "src/write-record.mjs": `import { encodeKey } from "./index.mjs";

export function writeRecord(parts, value) {
  return { key: encodeKey(parts), value };
}
`,
      "src/read-record.mjs": `import { decodeKey } from "./index.mjs";

export function readRecord(record) {
  return { parts: decodeKey(record.key), value: record.value };
}
`,
    },
  },
  "conflict-channel-registry": {
    category: "shared-interface-conflict",
    sharedPath: "src/channels.mjs",
    inconsistent: `import { sendEmail } from "./email.mjs";

const channels = {
  console: ({ body }) => \`console:\${body}\`,
  email: sendEmail,
};

export function deliver(channel, message) {
  const handler = channels[channel];
  if (!handler) throw new Error(\`unknown channel: \${channel}\`);
  return handler(message);
}
`,
    expected: ["src/email.mjs", "src/sms.mjs", "src/channels.mjs"],
    good: {
      "src/email.mjs": `export function sendEmail({ recipient, body }) {
  return \`email:\${recipient}:\${body}\`;
}
`,
      "src/sms.mjs": `export function sendSms({ recipient, body }) {
  if (body.length > 160) throw new RangeError("SMS body exceeds 160 characters");
  return \`sms:\${recipient}:\${body}\`;
}
`,
      "src/channels.mjs": `import { sendEmail } from "./email.mjs";
import { sendSms } from "./sms.mjs";

const channels = {
  console: ({ body }) => \`console:\${body}\`,
  email: sendEmail,
  sms: sendSms,
};

export function deliver(channel, message) {
  const handler = channels[channel];
  if (!handler) throw new Error(\`unknown channel: \${channel}\`);
  return handler(message);
}
`,
    },
  },
};

function runEvaluator(fixtureDirectory, workspace) {
  return spawnSync(process.execPath, ["evaluate.mjs", workspace], {
    cwd: join(fixtureDirectory, "evaluators"),
    encoding: "utf8",
    timeout: 2_000,
  });
}

test("dispatch and conflict fixtures satisfy deterministic contracts", async (t) => {
  const ownedDirectories = (await readdir(fixturesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^(?:dispatch|conflict)-/u.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(ownedDirectories, Object.keys(fixtures).sort());
  assert.equal(ownedDirectories.length, 5);

  const manifestRoot = await mkdtemp(join(tmpdir(), "dispatch-fixture-manifest-"));
  await cp(join(repositoryRoot, "benchmark"), join(manifestRoot, "benchmark"), { recursive: true });
  const aggregateManifest = {
    schemaVersion: "1.0.0",
    benchmarkId: "dispatch-fixtures-contract",
    profile: "custom",
    seed: "dispatch-fixtures",
    repetitions: 1,
    fixtures: ownedDirectories.map((directory) => `benchmark/fixtures/${directory}/fixture.json`),
    outputDirectory: "results",
  };
  const aggregatePath = join(manifestRoot, "manifest.json");
  await writeFile(aggregatePath, `${JSON.stringify(aggregateManifest, null, 2)}\n`);
  const loaded = await readBenchmarkManifest(aggregatePath);
  assert.equal(loaded.fixtures.length, 5);

  for (const { manifest, fixtureDirectory, workspaceSourcePath } of loaded.fixtures) {
    await t.test(manifest.fixtureId, async () => {
      const contract = fixtures[manifest.fixtureId];
      assert.ok(contract);
      assert.equal(manifest.category, contract.category);
      assert.deepEqual(manifest.expectedWritePaths, contract.expected);
      assert.equal(manifest.evaluators.length, 1);
      assert.equal(manifest.evaluators[0].id, "acceptance");
      assert.equal(manifest.evaluators[0].command.executable, "node");
      assert.equal(manifest.integrity.networkPolicy, "deny");
      assert.deepEqual(manifest.integrity.protectedPaths, ["evaluators/**", "canaries/**"]);
      assert.equal(manifest.integrity.canaryIds.length, 1);
      assert.doesNotMatch(
        manifest.prompt,
        /\b(?:parallelize|delegate|subagent|serialize|coordinate)\b/iu,
      );
      for (const path of manifest.expectedWritePaths) assert.match(manifest.prompt, new RegExp(path, "u"));
      if (contract.sharedPath) {
        assert.ok(manifest.expectedWritePaths.includes(contract.sharedPath));
        assert.match(manifest.prompt, /\bshared\b/iu);
      } else {
        assert.match(manifest.prompt, /\bindependent\b/iu);
      }

      const sourcePath = workspaceSourcePath;
      const lockPath = join(sourcePath, manifest.workspace.lockfilePath);
      const lock = JSON.parse(await readFile(lockPath, "utf8"));
      assert.deepEqual(Object.keys(lock.packages), [""]);
      assert.equal(await hashFile(lockPath), manifest.workspace.lockfileSha256);
      assert.equal(
        await hashTree(join(fixtureDirectory, "evaluators")),
        manifest.integrity.evaluatorBundleSha256,
      );
      for (const canaryId of manifest.integrity.canaryIds) {
        assert.match(
          await readFile(join(fixtureDirectory, "canaries", canaryId), "utf8"),
          /protected canary/u,
        );
      }

      const workspace = await mkdtemp(join(tmpdir(), `${manifest.fixtureId}-`));
      await cp(sourcePath, workspace, { recursive: true });
      const seedResult = runEvaluator(fixtureDirectory, workspace);
      assert.equal(seedResult.status, 1, seedResult.stderr);
      assert.match(seedResult.stderr, /acceptance failures:/u);

      const goodEntries = Object.entries(contract.good);
      if (contract.sharedPath) {
        for (const [path, content] of goodEntries) await writeFile(join(workspace, path), content);
        await writeFile(join(workspace, contract.sharedPath), contract.inconsistent);
      } else {
        for (const [path, content] of goodEntries.slice(0, -1)) {
          await writeFile(join(workspace, path), content);
        }
      }
      const partialResult = runEvaluator(fixtureDirectory, workspace);
      assert.equal(partialResult.status, 1, partialResult.stderr);
      assert.match(partialResult.stderr, /acceptance failures:/u);

      for (const [path, content] of goodEntries) await writeFile(join(workspace, path), content);
      const goodResult = runEvaluator(fixtureDirectory, workspace);
      assert.equal(goodResult.status, 0, goodResult.stderr);
      assert.match(goodResult.stdout, /acceptance passed/u);
    });
  }
});

import assert from "node:assert/strict";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const workspace = process.argv[2];
const temporaryRoot = await mkdtemp(join(tmpdir(), "quality-mutation-"));
const testCommand = (cwd) => spawnSync(
  process.execPath,
  ["--test", "tests/range-summary.test.mjs"],
  { cwd, encoding: "utf8", timeout: 10_000 },
);
const implementation = ({ wrongMaximum = false, wrongEmptyCount = false } = {}) => `
export function summarizeRange(values) {
  if (!Array.isArray(values) || values.some((value) => !Number.isFinite(value))) {
    throw new TypeError("values must contain finite numbers");
  }
  if (values.length === 0) return { min: null, max: null, total: 0, count: ${wrongEmptyCount ? 1 : 0} };
  return {
    min: Math.min(...values),
    max: Math.${wrongMaximum ? "min" : "max"}(...values),
    total: values.reduce((sum, value) => sum + value, 0),
    count: values.length,
  };
}
`;

try {
  const candidate = testCommand(workspace);
  assert.equal(candidate.status, 0, "candidate tests must pass the candidate implementation");

  for (const [name, mutant] of [
    ["wrong-maximum", implementation({ wrongMaximum: true })],
    ["wrong-empty-count", implementation({ wrongEmptyCount: true })],
  ]) {
    const mutantRoot = join(temporaryRoot, name);
    await cp(workspace, mutantRoot, { recursive: true });
    await writeFile(join(mutantRoot, "src/range-summary.mjs"), mutant);
    const result = testCommand(mutantRoot);
    assert.notEqual(result.status, 0, `candidate tests did not catch ${name}`);
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

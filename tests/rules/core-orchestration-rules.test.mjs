import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const rulesDirectory = join(testDirectory, "../../plugin/rules");
const expectedRules = [
  "actual-diff-verification.mdc",
  "evidence-review-tiers.mdc",
  "factual-correctness.mdc",
  "orchestrator-first.mdc",
];

function parseRule(source, name) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]+)$/u);
  assert.ok(match, `${name} must have YAML frontmatter and a non-empty body`);

  const frontmatter = Object.fromEntries(
    match[1].split("\n").map((line) => {
      const separator = line.indexOf(":");
      assert.notEqual(separator, -1, `${name} has malformed frontmatter: ${line}`);
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
    }),
  );
  return { frontmatter, body: match[2] };
}

async function loadRules() {
  return Object.fromEntries(
    await Promise.all(
      expectedRules.map(async (name) => [name, parseRule(await readFile(join(rulesDirectory, name), "utf8"), name)]),
    ),
  );
}

function requirePatterns(body, name, patterns) {
  for (const pattern of patterns) {
    assert.match(body, pattern, `${name} is missing invariant ${pattern}`);
  }
}

test("core orchestration rules are concise always-on Cursor rules", async () => {
  const names = (await readdir(rulesDirectory)).filter((name) => name.endsWith(".mdc")).sort();
  assert.deepEqual(names, expectedRules);

  for (const [name, rule] of Object.entries(await loadRules())) {
    assert.deepEqual(Object.keys(rule.frontmatter).sort(), ["alwaysApply", "description"], `${name} frontmatter`);
    assert.ok(rule.frontmatter.description.length > 0, `${name} needs a description`);
    assert.equal(rule.frontmatter.alwaysApply, "true", `${name} must always apply`);
    assert.ok(rule.body.trim().split("\n").length <= 50, `${name} must remain concise`);
  }
});

test("grounding rule makes correctness and explicit stopping non-negotiable", async () => {
  const { body } = (await loadRules())["factual-correctness.mdc"];
  requirePatterns(body, "factual-correctness.mdc", [
    /Correctness is the first priority/i,
    /Read .* before claiming/i,
    /quote the exact current lines/i,
    /`UNVERIFIED: <claim and missing evidence>`/u,
    /stop the claim and any work that depends on it/i,
  ]);
});

test("dispatch rule bounds Cursor-native parallel work", async () => {
  const { body } = (await loadRules())["orchestrator-first.mdc"];
  requirePatterns(body, "orchestrator-first.mdc", [
    /cold-context brief/i,
    /file write sets are disjoint/i,
    /multiple `Task` calls in one message/i,
    /3–5 agents/u,
    /`readonly: true`/u,
    /serialize the work/i,
    /file ownership, independence, or available isolation is unknown/i,
    /Do not assume undocumented fields or Cloud parity/i,
  ]);

  const taskFieldClaims = [...body.matchAll(/`([a-z_]+):[^`]*`/gu)].map((match) => match[1]);
  assert.deepEqual(taskFieldClaims, ["readonly"], "rule must not claim additional Task fields");
});

test("verification rule requires actual repository and local evidence", async () => {
  const { body } = (await loadRules())["actual-diff-verification.mdc"];
  requirePatterns(body, "actual-diff-verification.mdc", [
    /`git status`/u,
    /actual `git diff`/u,
    /spot-check the files/i,
    /deterministic local tests, build, lint, or validation/i,
    /do not claim completion/i,
    /skipped or unavailable checks into passes/i,
  ]);
});

test("review rule fixes tier semantics, priorities, and post-implementation DAG", async () => {
  const { body } = (await loadRules())["evidence-review-tiers.mdc"];
  requirePatterns(body, "evidence-review-tiers.mdc", [
    /correctness first/i,
    /critical security is non-compensable/i,
    /objective checks outrank subjective quality/i,
    /Tier 0 — deterministic/u,
    /already-failing deterministic check/i,
    /explicit counterexamples are Tier 1 evidence/i,
    /not Tier 0/i,
    /Tier 1 — judgment with deterministic evidence/u,
    /Without that evidence it is Tier 2/u,
    /Tier 2 — subjective judgment/u,
    /advisory only/i,
    /local deterministic verification/i,
    /readonly code and security reviews in parallel/i,
    /Address every Tier 0 and Tier 1 finding; log Tier 2/i,
    /Declare ship-ready only/i,
  ]);
});

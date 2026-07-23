import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const rulesDirectory = join(testDirectory, "../../plugin/rules");
const expectedRules = [
  "actual-diff-verification.mdc",
  "communication.mdc",
  "evidence-review-tiers.mdc",
  "factual-correctness.mdc",
  "grounding.mdc",
  "memory-discipline.mdc",
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

test("communication rule requires short responses and confirm-before-destructive", async () => {
  const { body } = (await loadRules())["communication.mdc"];
  requirePatterns(body, "communication.mdc", [
    /short responses/i,
    /markdown links for code references/i,
    /Confirm before destructive/i,
  ]);
});

test("grounding discipline requires read-quote-UNVERIFIED", async () => {
  const { body } = (await loadRules())["grounding.mdc"];
  requirePatterns(body, "grounding.mdc", [
    /Read before claiming/i,
    /Quote before changing/i,
    /`UNVERIFIED:/u,
  ]);
});

test("memory discipline uses in-repo .cursor/memory", async () => {
  const { body } = (await loadRules())["memory-discipline.mdc"];
  requirePatterns(body, "memory-discipline.mdc", [
    /\.cursor\/memory\//u,
    /MEMORY\.md/u,
    /metadata/u,
    /Do not write/i,
  ]);
});

test("dispatch rule bounds Cursor-native parallel work and Pattern 3", async () => {
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
    /checkpoint:impl-verified/u,
    /checkpoint:ship-ready/u,
    /gate-dag\.md/u,
    /data-model-documenter/u,
    /data-model-verifier/u,
    /Pattern 3b/u,
    /check-pr-ship-gates/u,
    /web3-engineer/u,
    /devops-engineer/u,
  ]);

  const taskFieldClaims = [...body.matchAll(/`([a-z_]+):[^`]*`/gu)].map((match) => match[1]);
  assert.deepEqual(taskFieldClaims, ["readonly"], "rule must not claim additional Task fields");
});

test("verification rule requires checkpoint:impl-verified evidence", async () => {
  const { body } = (await loadRules())["actual-diff-verification.mdc"];
  requirePatterns(body, "actual-diff-verification.mdc", [
    /`git status`/u,
    /actual `git diff`/u,
    /spot-check the files/i,
    /checkpoint:impl-verified/u,
    /npm run validate/u,
    /do not claim completion/i,
    /skipped or unavailable checks/i,
    /checkpoint:ship-ready/u,
  ]);
});

test("review rule fixes tier semantics, priorities, and Pattern 3 DAG", async () => {
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
    /checkpoint:impl-verified/u,
    /Wave 1/u,
    /Wave 2/u,
    /data-model-verifier/u,
    /explicitly waive/i,
    /checkpoint:ship-ready/u,
  ]);
});

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// The brief and role contracts are imported, not copied. `npm run validate` is
// the gate that ships, so it owns the single definition and these tests assert
// the same constants -- the two cannot silently diverge.
import {
  BRIEF_SCOPE_FIELDS as briefScopeFields,
  READONLY_AGENTS as readonlyAgents,
  SENTINEL_AGENTS as sentinelAgents,
  WRITING_AGENTS as writingAgents,
} from "../../scripts/lib/repository-validator.mjs";

const root =join(dirname(fileURLToPath(import.meta.url)), "../..");
const agentsDirectory = join(root, "plugin/agents");
const skillsDirectory = join(root, "plugin/skills");
const supportedAgentFields = new Set([
  "description",
  "is_background",
  "model",
  "name",
  "readonly",
]);

// Per-agent output contracts for the non-sentinel readonly agents. The keys are
// asserted to exactly cover that set, so a new readonly agent cannot be added
// without declaring what its report must contain. `ship_ready` is deliberately
// NOT global: library-investigator is forbidden from emitting any overall
// verdict and adversarial-claims-reviewer reports claim counts, so requiring a
// ship-readiness field would push a false contract into those artifacts.
const readonlyAgentContracts = {
  "adversarial-claims-reviewer": [
    /Tier 1/u,
    /Tier 2/u,
    /block nothing/u,
    /VERIFIED/u,
    /REFUTED/u,
    /UNVERIFIABLE/u,
    /VACUOUS/u,
    /guessing from conversation history/u,
    /warm context/iu,
  ],
  "code-reviewer": [
    /Tier 0/u,
    /Tier 1/u,
    /Tier 2/u,
    /deterministic evidence/u,
    /advisory/u,
    /ship_ready: false.*Tier 0 or evidence-backed Tier 1/su,
    // These two review the writing agent's diff, so their brief carries the
    // full write scope. Preserved from the pre-derivation hardcoded list.
    /\bfiles_write\b/u,
    /\bdependencies\b/u,
    /\bconflicts\b/u,
  ],
  "library-investigator": [
    /Tier-tag/u,
    /tier-tagged/u,
    /CONFORMS/u,
    /VIOLATES/u,
    /UNVERIFIABLE/u,
    /Emit no pass, fail, hold, or overall verdict/u,
    /guessing from conversation history/u,
    /not what a component was trying to\s+do/u,
  ],
  "security-reviewer": [
    /Tier 0/u,
    /Tier 1/u,
    /Tier 2/u,
    /deterministic evidence/u,
    /advisory/u,
    /ship_ready: false.*Tier 0 or evidence-backed Tier 1/su,
    // These two review the writing agent's diff, so their brief carries the
    // full write scope. Preserved from the pre-derivation hardcoded list.
    /\bfiles_write\b/u,
    /\bdependencies\b/u,
    /\bconflicts\b/u,
  ],
};

async function agentNames() {
  return (await readdir(agentsDirectory))
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -3))
    .sort();
}

function parseFrontmatter(markdown, path) {
  const lines = markdown.split(/\r?\n/u);
  assert.equal(lines[0], "---", `${path} must start with frontmatter`);
  const end = lines.indexOf("---", 1);
  assert.ok(end > 1, `${path} must close frontmatter`);

  const fields = {};
  for (const line of lines.slice(1, end)) {
    const separator = line.indexOf(":");
    assert.ok(separator > 0, `${path} has unsupported frontmatter: ${line}`);
    fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return { fields, body: lines.slice(end + 1).join("\n") };
}

async function load(path) {
  const markdown = await readFile(join(root, path), "utf8");
  return { path, markdown, ...parseFrontmatter(markdown, path) };
}

function assertSupportedAgentFrontmatter(fields, path) {
  for (const field of Object.keys(fields)) {
    assert.ok(supportedAgentFields.has(field), `${path} has unsupported frontmatter field ${field}`);
  }
}

test("Cursor discovers valid workflow agents and retains the capability probe", async () => {
  const names = (await readdir(agentsDirectory))
    .filter((name) => name.endsWith(".md"))
    .sort();

  assert.deepEqual(names, [
    "adversarial-claims-reviewer.md",
    "capability-probe.md",
    "code-reviewer.md",
    "engineer.md",
    "godot-engineer.md",
    "library-investigator.md",
    "phaser-engineer.md",
    "rust-engineer.md",
    "security-reviewer.md",
  ]);

  for (const name of names) {
    const { fields, body } = await load(`plugin/agents/${name}`);
    assertSupportedAgentFrontmatter(fields, name);
    assert.match(fields.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    assert.ok(
      fields.description && fields.description.length >= 40,
      `${name} needs a routing-usable description, got ${JSON.stringify(fields.description)}`,
    );
    assert.ok(body.trim().length > 0, `${name} must have a body`);
  }
});

test("readonly capability is role-derived, bidirectional, and covers every agent", async () => {
  const names = await agentNames();

  assert.deepEqual(
    names,
    [...readonlyAgents, ...writingAgents].sort(),
    "every agent must be classified as readonly or writing; classify new agents explicitly",
  );
  for (const name of readonlyAgents) {
    assert.ok(!writingAgents.has(name), `${name} cannot be both readonly and writing`);
  }

  for (const name of names) {
    const { fields } = await load(`plugin/agents/${name}.md`);
    if (readonlyAgents.has(name)) {
      assert.equal(
        fields.readonly,
        "true",
        `${name} is a readonly-role agent and must declare readonly: true`,
      );
    } else {
      assert.notEqual(
        fields.readonly,
        "true",
        `${name} writes files and must not declare readonly: true`,
      );
    }
  }
});

test("readonly agents still promise no mutation in their body", async () => {
  for (const name of readonlyAgents) {
    const { body } = await load(`plugin/agents/${name}.md`);
    assert.match(
      body,
      /\bNever edit\b|\bDo not read, edit, or execute\b/u,
      `${name} must carry an explicit no-mutation promise in its body`,
    );
    assert.doesNotMatch(
      body,
      /\byou may (?:edit|write|modify)\b/iu,
      `${name} must not grant itself write capability in prose`,
    );
  }
});

test("the capability probe stays a minimal discovery sentinel", async () => {
  const probe = await load("plugin/agents/capability-probe.md");
  assert.equal(probe.fields.readonly, "true");
  assert.match(probe.body, /cursor-harness-agent-discovered/u);
  assert.match(probe.body, /Do not read, edit, or execute anything/u);
  assert.ok(probe.body.trim().split(/\r?\n/u).length <= 4, "the probe must stay minimal");
});

test("agent frontmatter rejects Claude-only fields", () => {
  assert.throws(
    () => assertSupportedAgentFrontmatter({ name: "invalid", tools: "Read" }, "invalid.md"),
    /unsupported frontmatter field tools/u,
  );
});

test("skills use concise Cursor discovery frontmatter", async () => {
  const expected = [
    "adversarial-claims-reviewer",
    "browser-testing-with-devtools",
    "code-review-and-quality",
    "deployment-pipelines",
    "findings-ledger",
    "godot-engineer",
    "incremental-implementation",
    "library-investigator",
    "memory-extraction",
    "phaser-engineer",
    "planning-and-task-breakdown",
    "prompt-shaping",
    "release-manager",
    "rust-engineer",
    "security-engineering",
    "session-state",
    "typescript-data-engineering",
    "typescript-testing-backend",
    "typescript-testing-frontend",
  ];
  const directories = (await readdir(skillsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(directories, expected);

  for (const name of expected) {
    const skill = await load(`plugin/skills/${name}/SKILL.md`);
    assert.equal(skill.fields.name, name);
    assert.ok(skill.fields.description);
    assert.deepEqual(Object.keys(skill.fields).sort(), ["description", "name"]);
    assert.ok(skill.markdown.split(/\r?\n/u).length < 100, `${name} should stay concise`);
  }
});

test("task briefs declare cold-context file, dependency, and conflict scope", async () => {
  const skillPaths = [
    "plugin/skills/prompt-shaping/SKILL.md",
    "plugin/skills/planning-and-task-breakdown/SKILL.md",
    "plugin/skills/incremental-implementation/SKILL.md",
  ];
  // Derived from the agents directory, not hardcoded: a newly added agent opts
  // into brief enforcement automatically instead of being silently exempt.
  const agents = (await agentNames()).filter((name) => !sentinelAgents.has(name));
  assert.ok(agents.length >= 8, "brief enforcement must cover every non-sentinel agent");

  for (const path of skillPaths) {
    const artifact = await load(path);
    assert.match(artifact.body, /cold-context/u, `${path} must require cold context`);
    for (const field of briefScopeFields) {
      assert.match(artifact.body, new RegExp(`\\b${field}\\b`, "u"), `${path} must declare ${field}`);
    }
  }

  for (const name of agents) {
    const path = `plugin/agents/${name}.md`;
    const artifact = await load(path);
    assert.match(artifact.body, /cold-context/u, `${path} must require cold context`);
    assert.match(artifact.body, /\bfiles_read\b/u, `${path} must declare files_read`);
    // Agents that can write must scope the write, its ordering, and its
    // contention. Readonly agents have no write scope to declare, so their
    // report contract is enforced by readonlyAgentContracts instead.
    if (writingAgents.has(name)) {
      for (const field of briefScopeFields) {
        assert.match(artifact.body, new RegExp(`\\b${field}\\b`, "u"), `${path} must declare ${field}`);
      }
    }
  }

  const planner = await load("plugin/skills/planning-and-task-breakdown/SKILL.md");
  assert.match(planner.body, /stable, content-based ID/u);
  assert.match(planner.body, /graph\s+is acyclic/u);
  assert.match(planner.body, /symmetric\s+`conflicts`/u);
});

test("local verification gates parallel read-only reviews and ship-ready", async () => {
  const planner = await load("plugin/skills/planning-and-task-breakdown/SKILL.md");
  assert.match(
    planner.body,
    /local-verify -> \(code-review \|\| security-review\) -> ship-ready/u,
  );

  const reviewAgents = [...readonlyAgents].filter((name) => !sentinelAgents.has(name)).sort();
  assert.deepEqual(
    Object.keys(readonlyAgentContracts).sort(),
    reviewAgents,
    "every non-sentinel readonly agent needs a declared output contract",
  );

  for (const name of reviewAgents) {
    const reviewer = await load(`plugin/agents/${name}.md`);
    assert.equal(reviewer.fields.readonly, "true");
    assert.match(reviewer.body, /read-only/u, `${name} must state it is read-only`);
    assert.match(reviewer.body, /cold-context/u, `${name} must require a cold-context brief`);
    assert.match(reviewer.body, /\bTier\b/u, `${name} must tier its findings`);
    for (const pattern of readonlyAgentContracts[name]) {
      assert.match(reviewer.body, pattern, `${name} must satisfy its output contract: ${pattern}`);
    }
  }
});

test("engineer requires risk-proportional, test-first, exact evidence", async () => {
  const engineer = await load("plugin/agents/engineer.md");
  assert.notEqual(engineer.fields.readonly, "true");
  assert.match(engineer.body, /failing test before a behavior change/u);
  assert.match(engineer.body, /proportionally to risk/u);
  assert.match(engineer.body, /command: <exact command>/u);
  assert.match(engineer.body, /exit_code: <integer>/u);
  assert.match(engineer.body, /result: <exact relevant output>/u);
  assert.match(engineer.body, /in parallel, read-only Cursor Tasks/u);
});

test("findings ledger cannot promote unevidenced judgment into a gate", async () => {
  const ledger = await load("plugin/skills/findings-ledger/SKILL.md");
  assert.match(ledger.body, /at least two distinct\s+`run_id`/u);
  assert.match(ledger.body, /Never mark Tier 2 blocking/u);
  assert.match(ledger.body, /Tier 1 label requires a reproducible/u);
  assert.match(ledger.body, /without that evidence, demote the finding to Tier 2/u);
});

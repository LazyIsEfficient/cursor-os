/**
 * Tier 0 fixture tests for dispatch-gate lib + plan classifier.
 * Path expectations use plugin/skills|agents (cursor-os), not .claude/.
 */
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { execFileSync } from "node:child_process";
import {
  dispatchGateCollapseDotdot,
  dispatchGateExtractSubagentType,
  dispatchGateExtractWritePath,
  dispatchGateFormatMissingReviewMessage,
  dispatchGateHandleBeforeRead,
  dispatchGateHandlePostTool,
  dispatchGateHandlePreTool,
  dispatchGateHandleStop,
  dispatchGateImplDenied,
  dispatchGateInitLedger,
  dispatchGateIsEnabled,
  dispatchGateLoadJsonFile,
  dispatchGateMissingReviewersForWorktree,
  dispatchGateNormalizeRelPath,
  dispatchGatePathExempt,
  dispatchGatePathIsCode,
  dispatchGateReadLedger,
  dispatchGateRecordResearchRead,
  dispatchGateRecordSubagentStop,
  dispatchGateRecordTaskDispatch,
  dispatchGateResearchDenied,
  dispatchGateResolveConfig,
} from "../../scripts/lib/dispatch-gate-lib.mjs";
import {
  dispatchPlanMissingReviews,
  dispatchPlanRun,
} from "../../scripts/lib/dispatch-gate-plan-lib.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pluginDefaultConfig = join(
  repositoryRoot,
  "plugin/.cursor/dispatch-gate.json",
);

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "dispatch-gate-"));
  mkdirSync(join(root, ".cursor"), { recursive: true });
  cpSync(pluginDefaultConfig, join(root, ".cursor", "dispatch-gate.json"));
  return root;
}

function writeCfg(root, mutator) {
  const path = join(root, ".cursor", "dispatch-gate.json");
  const cfg = JSON.parse(readFileSync(path, "utf8"));
  writeFileSync(path, `${JSON.stringify(mutator(cfg), null, 2)}\n`);
  return path;
}

function mainAgentPayload(root, extra = {}) {
  return {
    workspace_roots: [root],
    composer_mode: "agent",
    conversation_id: "handler-conv",
    ...extra,
  };
}

/** Init a tiny git repo with a committed tree, then an uncommitted code change. */
function fixtureRootWithCodeChange() {
  const root = fixtureRoot();
  writeCfg(root, (c) => ({ ...c, enabled: true }));
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: root,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "user.name", "Test"], {
    cwd: root,
    stdio: "ignore",
  });
  mkdirSync(join(root, "plugin/skills/foo"), { recursive: true });
  writeFileSync(join(root, "plugin/skills/foo/SKILL.md"), "# baseline\n");
  execFileSync("git", ["add", "plugin/skills/foo/SKILL.md"], {
    cwd: root,
    stdio: "ignore",
  });
  execFileSync("git", ["commit", "-m", "baseline"], {
    cwd: root,
    stdio: "ignore",
  });
  writeFileSync(join(root, "plugin/skills/foo/SKILL.md"), "# changed\n");
  return root;
}

test("enabled:false disables the gate (false must not coalesce to true)", () => {
  const root = fixtureRoot();
  writeCfg(root, (c) => ({ ...c, enabled: false }));
  assert.equal(dispatchGateIsEnabled(root), false);

  writeCfg(root, (c) => ({ ...c, enabled: true }));
  assert.equal(dispatchGateIsEnabled(root), true);

  writeCfg(root, (c) => {
    const next = { ...c };
    delete next.enabled;
    return next;
  });
  assert.equal(dispatchGateIsEnabled(root), true);
});

test("DISPATCH_GATE_DISABLED=1 emergency off", () => {
  const root = fixtureRoot();
  writeCfg(root, (c) => ({ ...c, enabled: true }));
  const prev = process.env.DISPATCH_GATE_DISABLED;
  process.env.DISPATCH_GATE_DISABLED = "1";
  try {
    assert.equal(dispatchGateIsEnabled(root), false);
  } finally {
    if (prev === undefined) {
      delete process.env.DISPATCH_GATE_DISABLED;
    } else {
      process.env.DISPATCH_GATE_DISABLED = prev;
    }
  }
});

test("consumer config wins over plugin default", () => {
  const root = fixtureRoot();
  writeCfg(root, (c) => ({ ...c, enabled: true, research_read_threshold: 99 }));
  const resolved = dispatchGateResolveConfig(root);
  assert.equal(resolved.source, "consumer");
  const cfg = dispatchGateLoadJsonFile(resolved.path);
  assert.equal(cfg.research_read_threshold, 99);
});

test("enforce_*_gate:false disables gates", () => {
  const root = fixtureRoot();
  const footLed = {
    research_reads: 99,
    explore_dispatched: false,
    impl_completed: false,
  };
  const base = JSON.parse(readFileSync(pluginDefaultConfig, "utf8"));
  assert.equal(
    dispatchGateResearchDenied({ ...base, enforce_research_gate: false }, footLed),
    false,
  );
  assert.equal(
    dispatchGateImplDenied(
      { ...base, enforce_impl_gate: false },
      footLed,
      "plugin/skills/foo/SKILL.md",
    ),
    false,
  );
});

test("research gate trips at threshold and clears after explore", () => {
  const root = fixtureRoot();
  writeCfg(root, (c) => ({ ...c, enabled: true }));
  dispatchGateInitLedger(root, "test-conv");
  dispatchGateRecordResearchRead(root, "test-conv");
  dispatchGateRecordResearchRead(root, "test-conv");
  dispatchGateRecordResearchRead(root, "test-conv");
  const ledger = dispatchGateReadLedger(root, "test-conv");
  assert.equal(ledger.research_reads, 3);

  const cfg = dispatchGateLoadJsonFile(join(root, ".cursor", "dispatch-gate.json"));
  assert.equal(dispatchGateResearchDenied(cfg, ledger), true);

  dispatchGateRecordTaskDispatch(root, "test-conv", "explore", cfg);
  const after = dispatchGateReadLedger(root, "test-conv");
  assert.equal(dispatchGateResearchDenied(cfg, after), false);
});

test("impl gate opens after engineer completes", () => {
  const root = fixtureRoot();
  writeCfg(root, (c) => ({ ...c, enabled: true }));
  const cfg = dispatchGateLoadJsonFile(join(root, ".cursor", "dispatch-gate.json"));
  dispatchGateInitLedger(root, "test-conv");
  dispatchGateRecordSubagentStop(root, "test-conv", "engineer", "completed", cfg);
  const ledger = dispatchGateReadLedger(root, "test-conv");
  assert.equal(
    dispatchGateImplDenied(cfg, ledger, "plugin/skills/foo/SKILL.md"),
    false,
  );
});

test("gate plan classifies plugin library + sensitive paths", () => {
  const plan = dispatchPlanRun("plugin/skills/foo/SKILL.md\nplugin/hooks/hooks.json");
  assert.equal(plan.isLibrary, true);
  assert.equal(plan.isSensitive, true);
  const missing = dispatchPlanMissingReviews(plan, "");
  assert.ok(missing.length >= 2, `got ${missing.join(",")}`);
  assert.ok(missing.includes("code-reviewer"));
  assert.ok(missing.includes("security-reviewer"));
  assert.ok(missing.includes("library-reviewer"));
});

test("write path extraction from stringified and absolute tool_input", () => {
  const root = fixtureRoot();
  const stringified = {
    tool_name: "StrReplace",
    tool_input: '{"path":"plugin/skills/foo/SKILL.md"}',
    composer_mode: "agent",
  };
  assert.equal(
    dispatchGateExtractWritePath(root, stringified),
    "plugin/skills/foo/SKILL.md",
  );

  const absolute = {
    tool_name: "Write",
    tool_input: { path: join(root, "plugin/skills/foo/SKILL.md") },
    composer_mode: "agent",
  };
  assert.equal(
    dispatchGateExtractWritePath(root, absolute),
    "plugin/skills/foo/SKILL.md",
  );
});

test("missing reviewers join uses single ', '", () => {
  const msg = dispatchGateFormatMissingReviewMessage([
    "code-reviewer",
    "security-reviewer",
    "data-model-documenter",
  ]);
  assert.match(
    msg,
    /Missing reviewers: code-reviewer, security-reviewer, data-model-documenter/u,
  );
});

test("stop gate skips when worktree clean (no git changes)", () => {
  const root = fixtureRoot();
  writeCfg(root, (c) => ({ ...c, enabled: true }));
  const ledger = dispatchGateReadLedger(root, "stop-test");
  // $root is not a git repo ⇒ empty changed files ⇒ null (no demand).
  assert.equal(dispatchGateMissingReviewersForWorktree(root, ledger), null);
});

test("eval metrics runs classify as code (aligned with bash gate-plan)", () => {
  const plan = dispatchPlanRun("eval/metrics/runs/2026-01-01.json");
  // bash gate-plan-lib treats eval/metrics/runs/** as code; JS stays aligned.
  assert.equal(plan.isCodeChange, true);
  assert.equal(plan.skipDocsOnly, false);
});

test("path traversal through exempt prefix is blocked", () => {
  const root = fixtureRoot();
  const cfg = dispatchGateLoadJsonFile(join(root, ".cursor", "dispatch-gate.json"));
  const norm = dispatchGateNormalizeRelPath(
    root,
    "plugin/hooks/../../plugin/skills/foo/SKILL.md",
  );
  assert.equal(norm, "plugin/skills/foo/SKILL.md");
  assert.equal(dispatchGatePathExempt(norm, cfg), false);
  assert.equal(dispatchGatePathIsCode(norm, cfg), true);
  assert.equal(
    dispatchGateCollapseDotdot("plugin/hooks/../../plugin/skills/foo/SKILL.md"),
    "plugin/skills/foo/SKILL.md",
  );
});

test("case-insensitive code-path classification", () => {
  const root = fixtureRoot();
  const cfg = dispatchGateLoadJsonFile(join(root, ".cursor", "dispatch-gate.json"));
  assert.equal(dispatchGatePathIsCode("Scripts/dispatch_demo.py", cfg), true);
  assert.equal(dispatchGatePathIsCode("Plugin/Skills/foo/SKILL.md", cfg), true);
});

test("documenter completion recorded in completed_reviews", () => {
  const root = fixtureRoot();
  writeCfg(root, (c) => ({ ...c, enabled: true }));
  const cfg = dispatchGateLoadJsonFile(join(root, ".cursor", "dispatch-gate.json"));
  dispatchGateInitLedger(root, "test-conv");
  dispatchGateRecordSubagentStop(
    root,
    "test-conv",
    "data-model-documenter",
    "completed",
    cfg,
  );
  const ledger = dispatchGateReadLedger(root, "test-conv");
  assert.ok(ledger.completed_reviews.includes("data-model-documenter"));
});

test("concurrent subagentStop writes are serialized", async () => {
  const root = fixtureRoot();
  writeCfg(root, (c) => ({ ...c, enabled: true }));
  const cfg = dispatchGateLoadJsonFile(join(root, ".cursor", "dispatch-gate.json"));
  dispatchGateInitLedger(root, "race-conv");
  const raceTypes = [
    "code-reviewer",
    "security-reviewer",
    "library-reviewer",
    "data-model-verifier",
    "bugbot",
    "security-review",
  ];
  await Promise.all(
    raceTypes.map(
      (rt) =>
        new Promise((resolveDone) => {
          setImmediate(() => {
            dispatchGateRecordSubagentStop(root, "race-conv", rt, "completed", cfg);
            resolveDone();
          });
        }),
    ),
  );
  const ledger = dispatchGateReadLedger(root, "race-conv");
  assert.equal(
    ledger.completed_reviews.length,
    raceTypes.length,
    `lost updates: ${JSON.stringify(ledger.completed_reviews)}`,
  );
});

test("plugin default ships enabled:false", () => {
  const cfg = JSON.parse(readFileSync(pluginDefaultConfig, "utf8"));
  assert.equal(cfg.enabled, false);
  assert.ok(cfg.code_path_prefixes.includes("plugin/skills/"));
  assert.ok(!cfg.code_path_prefixes.some((p) => p.startsWith(".claude/")));
});

test("HandleBeforeRead denies research at threshold", () => {
  const root = fixtureRoot();
  writeCfg(root, (c) => ({ ...c, enabled: true, research_read_threshold: 3 }));
  dispatchGateInitLedger(root, "handler-conv");
  dispatchGateRecordResearchRead(root, "handler-conv");
  dispatchGateRecordResearchRead(root, "handler-conv");
  dispatchGateRecordResearchRead(root, "handler-conv");

  const denied = dispatchGateHandleBeforeRead(
    mainAgentPayload(root, { file_path: join(root, "README.md") }),
  );
  assert.equal(denied.permission, "deny");
  assert.match(String(denied.agent_message), /research threshold/iu);
});

test("HandlePreTool denies Grep at research threshold", () => {
  const root = fixtureRoot();
  writeCfg(root, (c) => ({ ...c, enabled: true, research_read_threshold: 3 }));
  dispatchGateInitLedger(root, "handler-conv");
  dispatchGateRecordResearchRead(root, "handler-conv");
  dispatchGateRecordResearchRead(root, "handler-conv");
  dispatchGateRecordResearchRead(root, "handler-conv");

  const denied = dispatchGateHandlePreTool(
    mainAgentPayload(root, { tool_name: "Grep", tool_input: { pattern: "x" } }),
  );
  assert.equal(denied.permission, "deny");
  assert.match(String(denied.agent_message), /research threshold/iu);
});

test("HandleStop follow-up when reviewers missing for code change", () => {
  const root = fixtureRootWithCodeChange();
  dispatchGateInitLedger(root, "handler-conv");

  const stop = dispatchGateHandleStop(
    mainAgentPayload(root, { status: "completed" }),
  );
  assert.ok(stop.followup_message, "expected followup_message");
  assert.match(String(stop.followup_message), /Missing reviewers:/u);
  assert.match(String(stop.followup_message), /code-reviewer/u);
  assert.match(String(stop.followup_message), /security-reviewer/u);
});

test("stringified Task tool_input sets explore_dispatched and impl tracking", () => {
  const root = fixtureRoot();
  writeCfg(root, (c) => ({ ...c, enabled: true }));
  dispatchGateInitLedger(root, "handler-conv");

  assert.equal(
    dispatchGateExtractSubagentType({
      tool_input: '{"subagent_type":"explore","prompt":"map X"}',
    }),
    "explore",
  );

  dispatchGateHandlePostTool(
    mainAgentPayload(root, {
      tool_name: "Task",
      tool_input: '{"subagent_type":"explore","prompt":"map X","readonly":true}',
    }),
  );
  let ledger = dispatchGateReadLedger(root, "handler-conv");
  assert.equal(ledger.explore_dispatched, true);

  dispatchGateHandlePostTool(
    mainAgentPayload(root, {
      tool_name: "Task",
      tool_input: '{"subagent_type":"engineer","prompt":"implement Y"}',
    }),
  );
  ledger = dispatchGateReadLedger(root, "handler-conv");
  assert.equal(ledger.impl_dispatched, true);
});

test("corrupt config: HandlePreTool and HandleBeforeRead DENY", () => {
  const root = fixtureRoot();
  writeFileSync(join(root, ".cursor", "dispatch-gate.json"), "{not-json\n");
  assert.equal(dispatchGateIsEnabled(root), true);

  const pre = dispatchGateHandlePreTool(
    mainAgentPayload(root, {
      tool_name: "Grep",
      tool_input: { pattern: "x" },
    }),
  );
  assert.equal(pre.permission, "deny");
  assert.match(String(pre.agent_message), /corrupt/iu);

  const before = dispatchGateHandleBeforeRead(
    mainAgentPayload(root, { file_path: join(root, "README.md") }),
  );
  assert.equal(before.permission, "deny");
  assert.match(String(before.agent_message), /corrupt/iu);

  // Non-research tool also denied (fail-closed even with no ledger demand).
  const writeDeny = dispatchGateHandlePreTool(
    mainAgentPayload(root, {
      tool_name: "Shell",
      tool_input: { command: "echo hi" },
    }),
  );
  assert.equal(writeDeny.permission, "deny");
  assert.match(String(writeDeny.agent_message), /corrupt/iu);
});

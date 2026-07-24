/**
 * dispatch-gate-lib.mjs — ledger + policy + per-event handlers.
 *
 * Thin plugin/scripts/dispatch-gate-*.mjs entrypoints import handlers from here.
 * Filesystem writes, locks, and git live in this library so entry scripts stay
 * within the hook-safety static scan (no writeFile/mkdir/child_process in entries).
 *
 * Config resolution (first hit wins):
 *   1. Consumer: <project>/.cursor/dispatch-gate.json
 *   2. Plugin default: ${CURSOR_PLUGIN_ROOT}/.cursor/dispatch-gate.json
 *      (or plugin/.cursor next to this module when CURSOR_PLUGIN_ROOT is unset)
 * Absent config ⇒ disabled. DISPATCH_GATE_DISABLED=1 ⇒ emergency off.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  dispatchPlanMissingReviews,
  dispatchPlanRun,
} from "./dispatch-gate-plan-lib.mjs";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT_FROM_MODULE = join(MODULE_DIR, "../..");

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin — hooks must stay sync-friendly under short timeouts */
  }
}

export function dispatchGateProjectRoot(payload = {}) {
  const roots = payload.workspace_roots;
  if (Array.isArray(roots) && typeof roots[0] === "string" && roots[0].length > 0) {
    return roots[0];
  }
  if (typeof process.env.CURSOR_PROJECT_DIR === "string" && process.env.CURSOR_PROJECT_DIR) {
    return process.env.CURSOR_PROJECT_DIR;
  }
  return process.cwd();
}

/**
 * Consumer project config wins. Plugin default is fallback only.
 * @returns {{ path: string|null, source: "consumer"|"plugin"|"none" }}
 */
export function dispatchGateResolveConfig(root) {
  const consumer = join(root, ".cursor", "dispatch-gate.json");
  if (existsSync(consumer)) {
    return { path: consumer, source: "consumer" };
  }

  const pluginRoot =
    typeof process.env.CURSOR_PLUGIN_ROOT === "string" && process.env.CURSOR_PLUGIN_ROOT
      ? process.env.CURSOR_PLUGIN_ROOT
      : PLUGIN_ROOT_FROM_MODULE;
  const pluginCfg = join(pluginRoot, ".cursor", "dispatch-gate.json");
  if (existsSync(pluginCfg)) {
    return { path: pluginCfg, source: "plugin" };
  }

  return { path: null, source: "none" };
}

export function dispatchGateConfigPath(root) {
  return dispatchGateResolveConfig(root).path;
}

export function dispatchGateLedgerPath(root) {
  return join(root, ".cursor", "dispatch-ledger.json");
}

/** Max lock wait: 20 × 50ms = 1s — well under hooks.json 5s timeout. */
const DISPATCH_GATE_LOCK_MAX_TRIES = 20;
const DISPATCH_GATE_LOCK_SLEEP_MS = 50;

export function dispatchGateLock(root) {
  const lock = `${dispatchGateLedgerPath(root)}.lock`;
  mkdirSync(join(root, ".cursor"), { recursive: true });
  for (let tries = 0; tries < DISPATCH_GATE_LOCK_MAX_TRIES; tries += 1) {
    try {
      mkdirSync(lock);
      return;
    } catch {
      sleepSync(DISPATCH_GATE_LOCK_SLEEP_MS);
    }
  }
  throw new Error("dispatch-gate: ledger lock timeout");
}

export function dispatchGateUnlock(root) {
  try {
    rmdirSync(`${dispatchGateLedgerPath(root)}.lock`);
  } catch {
    /* ignore */
  }
}

export function dispatchGateLoadJsonFile(path) {
  if (!path || !existsSync(path)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Resolve + parse config with explicit corrupt vs missing status.
 * Missing file ⇒ fall through (plugin default / off). File present but
 * unreadable or non-object JSON ⇒ corrupt (fail closed — do not silently disable).
 * @returns {{ status: "ok"|"none"|"corrupt", cfg: object|null, path: string|null, source: string }}
 */
export function dispatchGateTryLoadConfig(root) {
  const resolved = dispatchGateResolveConfig(root);
  if (!resolved.path) {
    return { status: "none", cfg: null, path: null, source: "none" };
  }
  if (!existsSync(resolved.path)) {
    return { status: "none", cfg: null, path: null, source: "none" };
  }
  try {
    const parsed = JSON.parse(readFileSync(resolved.path, "utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        status: "corrupt",
        cfg: null,
        path: resolved.path,
        source: resolved.source,
      };
    }
    return {
      status: "ok",
      cfg: parsed,
      path: resolved.path,
      source: resolved.source,
    };
  } catch {
    return {
      status: "corrupt",
      cfg: null,
      path: resolved.path,
      source: resolved.source,
    };
  }
}

/** True when a resolved config file exists but cannot be parsed as a JSON object. */
export function dispatchGateConfigCorrupt(root) {
  if (process.env.DISPATCH_GATE_DISABLED === "1") {
    return false;
  }
  return dispatchGateTryLoadConfig(root).status === "corrupt";
}

/**
 * enabled:false (explicit) disables. Missing enabled key defaults to enabled
 * once a config file is loaded. No config file ⇒ disabled (opt-in).
 * Corrupt/unreadable existing file ⇒ treated as enabled (fail closed).
 * DISPATCH_GATE_DISABLED=1 always wins.
 */
export function dispatchGateIsEnabled(root) {
  if (process.env.DISPATCH_GATE_DISABLED === "1") {
    return false;
  }
  const loaded = dispatchGateTryLoadConfig(root);
  if (loaded.status === "none") {
    return false;
  }
  if (loaded.status === "corrupt") {
    return true;
  }
  // Do NOT use `cfg.enabled ?? true` with a false-coalescing that treats false
  // as missing — only an explicit `false` disables.
  return loaded.cfg.enabled !== false;
}

export function dispatchGateInitLedger(root, conversationId = "unknown") {
  mkdirSync(join(root, ".cursor"), { recursive: true });
  const ledger = {
    version: 1,
    conversation_id: conversationId,
    research_reads: 0,
    explore_dispatched: false,
    impl_dispatched: false,
    impl_completed: false,
    completed_reviews: [],
    completed_subagents: [],
    modified_paths: [],
    ungated_code_edits: [],
    writes_on_main: 0,
  };
  writeFileSync(dispatchGateLedgerPath(root), `${JSON.stringify(ledger)}\n`);
  return ledger;
}

export function dispatchGateEnsureLedger(root, conversationId = "") {
  const path = dispatchGateLedgerPath(root);
  if (!existsSync(path)) {
    return dispatchGateInitLedger(root, conversationId || "unknown");
  }
  const current = dispatchGateLoadJsonFile(path);
  if (!current) {
    return dispatchGateInitLedger(root, conversationId || "unknown");
  }
  if (
    conversationId &&
    current.conversation_id &&
    current.conversation_id !== conversationId
  ) {
    return dispatchGateInitLedger(root, conversationId);
  }
  return current;
}

export function dispatchGateReadLedger(root, conversationId = "") {
  return dispatchGateEnsureLedger(root, conversationId);
}

export function dispatchGateWriteLedger(root, ledger) {
  mkdirSync(join(root, ".cursor"), { recursive: true });
  writeFileSync(dispatchGateLedgerPath(root), `${JSON.stringify(ledger)}\n`);
}

export function dispatchGateIsSubagentContext(payload) {
  return Boolean(payload?.subagent_id);
}

export function dispatchGateOnMainThread(payload) {
  return !dispatchGateIsSubagentContext(payload);
}

export function dispatchGateIsMainAgent(payload) {
  return dispatchGateOnMainThread(payload);
}

export function dispatchGateAuditLog(root, event, payload, decision = "") {
  try {
    mkdirSync(join(root, ".cursor"), { recursive: true });
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      event,
      decision,
      tool_name: payload?.tool_name ?? null,
      hook_event_name: payload?.hook_event_name ?? null,
      subagent_id: payload?.subagent_id ?? null,
      file_path: payload?.file_path ?? null,
    });
    writeFileSync(join(root, ".cursor", "dispatch-gate-audit.jsonl"), `${line}\n`, {
      flag: "a",
    });
  } catch {
    /* best-effort */
  }
}

export function dispatchGateIsWriteTool(toolName) {
  const name = String(toolName || "").toLowerCase();
  return [
    "write",
    "strreplace",
    "delete",
    "applypatch",
    "editnotebook",
    "search_replace",
    "edit_file",
    "patch",
  ].includes(name);
}

export function dispatchGateIsResearchTool(toolName) {
  const name = String(toolName || "").toLowerCase();
  return ["read", "grep", "glob", "semanticsearch", "sematicsearch"].includes(name);
}

export function dispatchGateComposerMode(payload) {
  return payload?.composer_mode ?? "agent";
}

export function dispatchGateCollapseDotdot(path) {
  const out = [];
  for (const seg of path.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") {
        out.pop();
      } else {
        out.push("..");
      }
    } else {
      out.push(seg);
    }
  }
  return out.join("/");
}

export function dispatchGateNormalizeRelPath(root, path) {
  let p = String(path || "");
  const absRoot = root.endsWith(sep) ? root.slice(0, -1) : root;
  if (p.startsWith(`${absRoot}/`) || p.startsWith(`${absRoot}${sep}`)) {
    p = p.slice(absRoot.length + 1);
  }
  if (p.startsWith(`./`)) {
    p = p.slice(2);
  }
  // Also handle Windows-ish separators in relative form.
  p = p.replaceAll("\\", "/");
  return dispatchGateCollapseDotdot(p);
}

function prefixMatch(relPath, prefixes) {
  const lcPath = relPath.toLowerCase();
  for (const prefix of prefixes || []) {
    if (!prefix) continue;
    if (lcPath.startsWith(String(prefix).toLowerCase())) {
      return true;
    }
  }
  return false;
}

export function dispatchGatePathExempt(relPath, cfg) {
  return prefixMatch(relPath, cfg?.harness_exempt_prefixes);
}

export function dispatchGatePathIsCode(relPath, cfg) {
  if (dispatchGatePathExempt(relPath, cfg)) {
    return false;
  }
  return prefixMatch(relPath, cfg?.code_path_prefixes);
}

export function dispatchGateExtractWritePath(root, payload) {
  const raw = payload?.tool_input;
  let path = "";
  if (raw == null) {
    return "";
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        path =
          parsed.path ||
          parsed.file_path ||
          parsed.target_file ||
          parsed.filePath ||
          "";
      } catch {
        path = "";
      }
    }
  } else if (typeof raw === "object") {
    path =
      raw.path || raw.file_path || raw.target_file || raw.filePath || "";
  }
  if (!path) {
    return "";
  }
  return dispatchGateNormalizeRelPath(root, path);
}

/**
 * Task tool_input may be an object or a stringified JSON object.
 * @returns {string}
 */
export function dispatchGateExtractSubagentType(payload) {
  const raw = payload?.tool_input;
  if (raw == null) {
    return "";
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("{")) {
      return "";
    }
    try {
      const parsed = JSON.parse(trimmed);
      return parsed.subagent_type || parsed.subagentType || "";
    } catch {
      return "";
    }
  }
  if (typeof raw === "object") {
    return raw.subagent_type || raw.subagentType || "";
  }
  return "";
}

/**
 * Config + ledger paths the main thread must not edit while the gate is on.
 * Operator escape: DISPATCH_GATE_DISABLED=1 or edit outside the agent.
 */
export function dispatchGateIsProtectedPath(relPath) {
  const p = String(relPath || "")
    .replaceAll("\\", "/")
    .toLowerCase();
  return (
    p === ".cursor/dispatch-gate.json" ||
    p === "plugin/.cursor/dispatch-gate.json" ||
    p === ".cursor/dispatch-ledger.json" ||
    p === ".cursor/dispatch-ledger.json.lock" ||
    p.startsWith(".cursor/dispatch-ledger.json.")
  );
}

function dispatchGateDenyCorruptConfig() {
  return dispatchGateDeny(
    "dispatch-gate: config file exists but is corrupt/unreadable. Repair .cursor/dispatch-gate.json (valid JSON object) or set DISPATCH_GATE_DISABLED=1. Refusing tools until the config reparses.",
    "Fix corrupt dispatch-gate.json or set DISPATCH_GATE_DISABLED=1",
  );
}

export function dispatchGateSubagentInList(subagentType, cfg, listKey) {
  const list = cfg?.[listKey];
  if (!Array.isArray(list)) {
    return false;
  }
  return list.includes(subagentType);
}

export function dispatchGateRecordResearchRead(root, conversationId = "") {
  dispatchGateLock(root);
  try {
    const ledger = dispatchGateReadLedger(root, conversationId);
    ledger.research_reads = (ledger.research_reads || 0) + 1;
    dispatchGateWriteLedger(root, ledger);
  } finally {
    dispatchGateUnlock(root);
  }
}

export function dispatchGateRecordTaskDispatch(root, conversationId, subagentType, cfg) {
  dispatchGateLock(root);
  try {
    const ledger = dispatchGateReadLedger(root, conversationId);
    ledger.completed_subagents = ledger.completed_subagents || [];
    ledger.completed_subagents.push({
      type: subagentType,
      at: new Date().toISOString(),
    });
    if (dispatchGateSubagentInList(subagentType, cfg, "explore_subagent_types")) {
      ledger.explore_dispatched = true;
    }
    if (dispatchGateSubagentInList(subagentType, cfg, "impl_subagent_types")) {
      ledger.impl_dispatched = true;
    }
    dispatchGateWriteLedger(root, ledger);
  } finally {
    dispatchGateUnlock(root);
  }
}

export function dispatchGateRecordSubagentStop(root, conversationId, subagentType, status, cfg) {
  if (status !== "completed") {
    return;
  }
  dispatchGateLock(root);
  try {
    const ledger = dispatchGateReadLedger(root, conversationId);
    if (dispatchGateSubagentInList(subagentType, cfg, "impl_subagent_types")) {
      ledger.impl_completed = true;
    }
    if (
      dispatchGateSubagentInList(subagentType, cfg, "review_subagent_types") ||
      dispatchGateSubagentInList(subagentType, cfg, "documenter_subagent_types")
    ) {
      const reviews = new Set(ledger.completed_reviews || []);
      reviews.add(subagentType);
      ledger.completed_reviews = [...reviews];
    }
    dispatchGateWriteLedger(root, ledger);
  } finally {
    dispatchGateUnlock(root);
  }
}

export function dispatchGateRecordWritePath(root, conversationId, relPath) {
  dispatchGateLock(root);
  try {
    const ledger = dispatchGateReadLedger(root, conversationId);
    const paths = new Set(ledger.modified_paths || []);
    paths.add(relPath);
    ledger.modified_paths = [...paths];
    ledger.writes_on_main = (ledger.writes_on_main || 0) + 1;
    dispatchGateWriteLedger(root, ledger);
  } finally {
    dispatchGateUnlock(root);
  }
}

export function dispatchGateResearchDenied(cfg, ledger) {
  if (cfg?.enforce_research_gate === false) {
    return false;
  }
  if (ledger?.explore_dispatched === true) {
    return false;
  }
  const threshold = cfg?.research_read_threshold ?? 3;
  return (ledger?.research_reads ?? 0) >= threshold;
}

export function dispatchGateImplDenied(cfg, ledger, relPath) {
  if (cfg?.enforce_impl_gate === false) {
    return false;
  }
  if (!dispatchGatePathIsCode(relPath, cfg)) {
    return false;
  }
  if (ledger?.impl_completed === true) {
    return false;
  }
  return true;
}

export function dispatchGateAllow() {
  return { permission: "allow" };
}

export function dispatchGateDeny(agentMessage, userMessage) {
  return {
    permission: "deny",
    agent_message: agentMessage,
    user_message: userMessage || agentMessage,
  };
}

export function dispatchGateStopOk() {
  return {};
}

export function dispatchGateStopFollowup(message) {
  return { followup_message: message };
}

export function dispatchGateGitChangedFiles(root) {
  try {
    const opts = { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] };
    const parts = [
      execFileSync("git", ["diff", "--name-only", "HEAD"], opts),
      execFileSync("git", ["diff", "--name-only", "--cached", "HEAD"], opts),
      execFileSync("git", ["ls-files", "--others", "--exclude-standard"], opts),
    ];
    const seen = new Set();
    const out = [];
    for (const chunk of parts) {
      for (const line of String(chunk).split("\n")) {
        const f = line.trim();
        if (!f || seen.has(f)) continue;
        seen.add(f);
        out.push(f);
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function dispatchGateMissingReviewersForWorktree(root, ledger) {
  const changed = dispatchGateGitChangedFiles(root);
  // Empty / no git ⇒ no demand (return null). Returning [] would falsely block
  // every clean/Q&A turn.
  if (changed.length === 0) {
    return null;
  }
  const plan = dispatchPlanRun(changed.join("\n"));
  if (plan.skipDocsOnly) {
    return null;
  }
  const completedCsv = (ledger?.completed_reviews || []).join(",");
  const missing = dispatchPlanMissingReviews(plan, completedCsv);
  return missing.length > 0 ? missing : null;
}

export function dispatchGateFormatMissingReviewMessage(missing) {
  const joined = missing.join(", ");
  return [
    "dispatch-gate (Tier 0): Code changed but required reviewer Tasks have not completed.",
    "",
    `Missing reviewers: ${joined}`,
    "",
    "Before marking this work done, dispatch readonly Task(subagent_type=…) for each missing reviewer in parallel (Wave 1 gate DAG). Address Tier 0/1 findings; log Tier 2 to findings ledger.",
    "",
    "After reviewers return, continue.",
  ].join("\n");
}

function conversationIdFrom(payload) {
  return (
    payload?.conversation_id ||
    payload?.session_id ||
    payload?.parent_conversation_id ||
    ""
  );
}

function loadCfg(root) {
  const loaded = dispatchGateTryLoadConfig(root);
  return loaded.status === "ok" ? loaded.cfg : null;
}

// ── Per-event handlers ─────────────────────────────────────────────────────

export function dispatchGateHandleSessionInit(payload) {
  const root = dispatchGateProjectRoot(payload);
  if (!dispatchGateIsEnabled(root)) {
    return {};
  }
  const conversationId =
    payload?.conversation_id || payload?.session_id || "unknown";
  dispatchGateInitLedger(root, conversationId);

  const context = `=== dispatch-gate (Tier 0 — mechanical) ===
ORCHESTRATOR MODE: main thread must not implement.
• Research (>3 Read/Grep/Glob/SemanticSearch without explore Task) → blocked.
• Writes to plugin/skills/, plugin/agents/, plugin/commands/, plugin/rules/, plugin/references/, scripts/ → blocked until an implementation Task completes (engineer, rust-engineer, …).
• End of turn with code/library changes → stop hook requires reviewer Tasks (code-reviewer + security-reviewer + data-model-documenter; library-reviewer when plugin/skills|agents change; data-model-verifier when DATA_MODEL.md changes) before done.
Harness paths (plugin/hooks/, dispatch-gate scripts) are exempt for maintenance.
Disable emergency: DISPATCH_GATE_DISABLED=1
Enable: set "enabled": true in .cursor/dispatch-gate.json (consumer overrides plugin default).
While enabled, main-thread Write/StrReplace/Delete of .cursor/dispatch-gate.json and the ledger is denied — escape via DISPATCH_GATE_DISABLED or edit outside the agent.`;

  return { additional_context: context };
}

export function dispatchGateEnforceResearch(payload) {
  const root = dispatchGateProjectRoot(payload);
  if (!dispatchGateIsEnabled(root)) {
    return dispatchGateAllow();
  }
  if (dispatchGateConfigCorrupt(root)) {
    return dispatchGateDenyCorruptConfig();
  }
  if (!dispatchGateIsMainAgent(payload)) {
    return dispatchGateAllow();
  }
  if (dispatchGateComposerMode(payload) !== "agent") {
    return dispatchGateAllow();
  }

  const cfg = loadCfg(root);
  if (!cfg) {
    return dispatchGateDenyCorruptConfig();
  }
  const conversationId = conversationIdFrom(payload);
  const ledger = dispatchGateReadLedger(root, conversationId);

  if (dispatchGateResearchDenied(cfg, ledger)) {
    return dispatchGateDeny(
      "dispatch-gate: research threshold reached on the main thread. Dispatch Task(subagent_type=explore, readonly=true) with a scoped brief before more Read/Grep/Glob/SemanticSearch. Sequential main-thread research is blocked.",
      "Dispatch explore subagent before more file reads",
    );
  }
  return dispatchGateAllow();
}

export function dispatchGateEnforceImpl(payload) {
  const root = dispatchGateProjectRoot(payload);
  if (!dispatchGateIsEnabled(root)) {
    return dispatchGateAllow();
  }
  if (dispatchGateConfigCorrupt(root)) {
    return dispatchGateDenyCorruptConfig();
  }
  if (!dispatchGateIsMainAgent(payload)) {
    return dispatchGateAllow();
  }
  if (dispatchGateComposerMode(payload) !== "agent") {
    return dispatchGateAllow();
  }

  const cfg = loadCfg(root);
  if (!cfg) {
    return dispatchGateDenyCorruptConfig();
  }
  const conversationId = conversationIdFrom(payload);
  const ledger = dispatchGateReadLedger(root, conversationId);
  const relPath = dispatchGateExtractWritePath(root, payload);
  const toolName = payload?.tool_name || "";

  dispatchGateAuditLog(root, "preToolUse-impl", payload, `check:${toolName}:${relPath || "no-path"}`);

  // While gate enabled: deny main-thread edits of config/ledger (operator escape
  // via DISPATCH_GATE_DISABLED or editing outside the agent).
  if (relPath && dispatchGateIsProtectedPath(relPath)) {
    dispatchGateAuditLog(root, "preToolUse-impl", payload, `deny:protected:${relPath}`);
    return dispatchGateDeny(
      `dispatch-gate: blocked Write/StrReplace/Delete on protected path '${relPath}'. Set DISPATCH_GATE_DISABLED=1 or edit the file outside the agent (then Reload Window).`,
      `Protected path — use DISPATCH_GATE_DISABLED=1 to escape`,
    );
  }

  if (!relPath) {
    if (dispatchGateIsWriteTool(toolName)) {
      dispatchGateAuditLog(root, "preToolUse-impl", payload, "deny:no-path");
      return dispatchGateDeny(
        `dispatch-gate: blocked ${toolName} on the main thread (could not resolve file path). Dispatch Task(subagent_type=engineer|…) for code edits.`,
        "Implementation Task required — path not resolved",
      );
    }
    return dispatchGateAllow();
  }

  if (dispatchGatePathExempt(relPath, cfg)) {
    return dispatchGateAllow();
  }

  if (dispatchGateImplDenied(cfg, ledger, relPath)) {
    dispatchGateAuditLog(root, "preToolUse-impl", payload, `deny:${relPath}`);
    return dispatchGateDeny(
      `dispatch-gate: blocked Write/StrReplace/Delete on code path '${relPath}' from the main thread. Dispatch Task(subagent_type=engineer|rust-engineer|…) to implement; wait for subagentStop completed before integrating on main, or let the subagent own all edits.`,
      `Implementation Task required before editing ${relPath}`,
    );
  }

  return dispatchGateAllow();
}

export function dispatchGateHandlePreTool(payload) {
  const toolName = payload?.tool_name || "";
  const root = dispatchGateProjectRoot(payload);

  if (dispatchGateIsEnabled(root) && dispatchGateConfigCorrupt(root)) {
    dispatchGateAuditLog(root, "preToolUse", payload, "deny:corrupt-config");
    return dispatchGateDenyCorruptConfig();
  }

  if (dispatchGateIsResearchTool(toolName)) {
    dispatchGateAuditLog(root, "preToolUse", payload, "enforce-research");
    return dispatchGateEnforceResearch(payload);
  }
  if (dispatchGateIsWriteTool(toolName)) {
    dispatchGateAuditLog(root, "preToolUse", payload, "enforce-impl");
    return dispatchGateEnforceImpl(payload);
  }

  dispatchGateAuditLog(root, "preToolUse", payload, "allow-pass-through");
  return dispatchGateAllow();
}

export function dispatchGateTrackResearch(payload) {
  if (!dispatchGateIsMainAgent(payload)) {
    return;
  }
  const toolName = String(payload?.tool_name || "").toLowerCase();
  // Read is counted by beforeReadFile; skip here to avoid double-count.
  if (toolName === "read") {
    return;
  }
  const root = dispatchGateProjectRoot(payload);
  dispatchGateRecordResearchRead(root, conversationIdFrom(payload));
}

export function dispatchGateTrackTask(payload) {
  if (!dispatchGateIsMainAgent(payload)) {
    return;
  }
  const subagentType = dispatchGateExtractSubagentType(payload);
  if (!subagentType) {
    return;
  }
  const root = dispatchGateProjectRoot(payload);
  const cfg = loadCfg(root);
  if (!cfg) {
    return;
  }
  dispatchGateRecordTaskDispatch(root, conversationIdFrom(payload), subagentType, cfg);
}

export function dispatchGateTrackWrite(payload) {
  if (!dispatchGateIsMainAgent(payload)) {
    return;
  }
  const root = dispatchGateProjectRoot(payload);
  const relPath = dispatchGateExtractWritePath(root, payload);
  if (!relPath) {
    return;
  }
  dispatchGateRecordWritePath(root, conversationIdFrom(payload), relPath);
}

export function dispatchGateHandlePostTool(payload) {
  const root = dispatchGateProjectRoot(payload);
  if (!dispatchGateIsEnabled(root)) {
    return {};
  }

  const toolName = payload?.tool_name || "";
  if (dispatchGateIsResearchTool(toolName)) {
    dispatchGateTrackResearch(payload);
    return {};
  }
  if (toolName === "Task") {
    dispatchGateTrackTask(payload);
    return {};
  }
  if (dispatchGateIsWriteTool(toolName)) {
    dispatchGateTrackWrite(payload);
    return {};
  }
  return {};
}

export function dispatchGateHandleBeforeRead(payload) {
  const root = dispatchGateProjectRoot(payload);
  if (!dispatchGateIsEnabled(root)) {
    return dispatchGateAllow();
  }
  if (dispatchGateConfigCorrupt(root)) {
    return dispatchGateDenyCorruptConfig();
  }
  if (!dispatchGateOnMainThread(payload)) {
    return dispatchGateAllow();
  }

  const cfg = loadCfg(root);
  if (!cfg) {
    return dispatchGateDenyCorruptConfig();
  }
  const conversationId = conversationIdFrom(payload);
  const ledger = dispatchGateReadLedger(root, conversationId);

  dispatchGateAuditLog(root, "beforeReadFile", payload, "check");

  if (dispatchGateResearchDenied(cfg, ledger)) {
    dispatchGateAuditLog(root, "beforeReadFile", payload, "deny");
    return dispatchGateDeny(
      "dispatch-gate: research threshold reached. Dispatch Task(subagent_type=explore, readonly=true) before more file reads.",
      "Dispatch explore subagent before more reads",
    );
  }

  dispatchGateRecordResearchRead(root, conversationId);
  dispatchGateAuditLog(root, "beforeReadFile", payload, "allow");
  return dispatchGateAllow();
}

export function dispatchGateHandleAfterFileEdit(payload) {
  const root = dispatchGateProjectRoot(payload);
  if (!dispatchGateIsEnabled(root)) {
    return {};
  }
  if (!dispatchGateOnMainThread(payload)) {
    return {};
  }

  const cfg = loadCfg(root);
  if (!cfg) {
    return {};
  }
  const conversationId = conversationIdFrom(payload);
  const absPath = payload?.file_path || "";
  if (!absPath) {
    return {};
  }
  const relPath = dispatchGateNormalizeRelPath(root, absPath);

  dispatchGateAuditLog(root, "afterFileEdit", payload, "record");

  if (dispatchGatePathExempt(relPath, cfg)) {
    return {};
  }
  if (!dispatchGatePathIsCode(relPath, cfg)) {
    return {};
  }

  const ledger = dispatchGateReadLedger(root, conversationId);
  if (ledger.impl_completed === true) {
    return {};
  }

  dispatchGateLock(root);
  try {
    const fresh = dispatchGateReadLedger(root, conversationId);
    const edits = new Set(fresh.ungated_code_edits || []);
    edits.add(relPath);
    fresh.ungated_code_edits = [...edits];
    dispatchGateWriteLedger(root, fresh);
  } finally {
    dispatchGateUnlock(root);
  }
  return {};
}

export function dispatchGateHandleSubagentStop(payload) {
  const root = dispatchGateProjectRoot(payload);
  if (!dispatchGateIsEnabled(root)) {
    return {};
  }

  const subagentType = payload?.subagent_type || "";
  const status = payload?.status || "";
  if (!subagentType) {
    return {};
  }
  const cfg = loadCfg(root);
  if (!cfg) {
    return {};
  }
  const conversationId =
    payload?.parent_conversation_id ||
    payload?.conversation_id ||
    payload?.session_id ||
    "";
  dispatchGateRecordSubagentStop(root, conversationId, subagentType, status, cfg);
  return {};
}

export function dispatchGateHandleStop(payload) {
  const root = dispatchGateProjectRoot(payload);
  if (!dispatchGateIsEnabled(root)) {
    return dispatchGateStopOk();
  }

  if (dispatchGateConfigCorrupt(root)) {
    return dispatchGateStopFollowup(
      [
        "dispatch-gate (Tier 0): Config file exists but is corrupt/unreadable.",
        "",
        "Repair .cursor/dispatch-gate.json (valid JSON object) or set DISPATCH_GATE_DISABLED=1, then Reload Window.",
      ].join("\n"),
    );
  }

  const status = payload?.status || "completed";
  if (status !== "completed") {
    return dispatchGateStopOk();
  }

  const cfg = loadCfg(root);
  if (!cfg) {
    return dispatchGateStopFollowup(
      [
        "dispatch-gate (Tier 0): Config file exists but is corrupt/unreadable.",
        "",
        "Repair .cursor/dispatch-gate.json (valid JSON object) or set DISPATCH_GATE_DISABLED=1, then Reload Window.",
      ].join("\n"),
    );
  }
  if (cfg.stop_hook_enabled === false) {
    return dispatchGateStopOk();
  }

  const conversationId = conversationIdFrom(payload);
  const ledger = dispatchGateReadLedger(root, conversationId);

  const missing = dispatchGateMissingReviewersForWorktree(root, ledger);
  if (missing) {
    return dispatchGateStopFollowup(dispatchGateFormatMissingReviewMessage(missing));
  }

  const ungated = (ledger.ungated_code_edits || []).join(", ");
  if (ungated) {
    return dispatchGateStopFollowup(
      [
        "dispatch-gate (Tier 0): Code files were edited on the main thread without a completed implementation Task.",
        "",
        `Ungated edits: ${ungated}`,
        "",
        "Revert those changes (or complete via Task(engineer) first), then dispatch reviewer Tasks before marking done.",
      ].join("\n"),
    );
  }

  return dispatchGateStopOk();
}

/** Shared stdin reader for thin entry scripts (no fs writes). */
export async function dispatchGateReadStdin(maxBytes = 1024 * 1024) {
  let input = "";
  let bytes = 0;
  let tooLarge = false;
  for await (const chunk of process.stdin) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > maxBytes) {
      tooLarge = true;
    } else {
      input += chunk;
    }
  }
  if (tooLarge) {
    throw new Error("hook input too large");
  }
  return input;
}

export function dispatchGateParsePayload(raw) {
  const payload = JSON.parse(raw || "{}");
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("invalid hook payload");
  }
  return payload;
}

// Silence unused relative import warning in some tooling — used by tests.
export function dispatchGateRel(root, abs) {
  return relative(root, abs);
}

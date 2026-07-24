/**
 * verify-ledger-lib.mjs — read/write/validate `.cursor/verify-ledger.json`.
 *
 * Proves checkpoint:impl-verified for the current HEAD before `gh pr create|ready`.
 * Filesystem + git live here so before-shell-execution.mjs can import validators
 * without embedding node:fs / child_process in the guard entry (static scan).
 *
 * Emergency: VERIFY_PR_GATE_DISABLED=1 skips the PR gate check only.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

export const VERIFY_LEDGER_VERSION = 1;
export const VERIFY_LEDGER_RELATIVE_PATH = join(".cursor", "verify-ledger.json");
export const VERIFY_PR_GATE_DISABLED_ENV = "VERIFY_PR_GATE_DISABLED";

/** Max lock wait: 20 × 50ms = 1s — under beforeShellExecution 5s timeout. */
const LOCK_MAX_TRIES = 20;
const LOCK_SLEEP_MS = 50;

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin — sync-friendly under short hook timeouts */
  }
}

export function verifyLedgerPath(root) {
  return join(root, VERIFY_LEDGER_RELATIVE_PATH);
}

export function verifyLedgerLockPath(root) {
  return `${verifyLedgerPath(root)}.lock`;
}

export function verifyLedgerProjectRoot(payload = {}) {
  if (typeof payload.cwd === "string" && payload.cwd.length > 0) {
    return payload.cwd;
  }
  const roots = payload.workspace_roots;
  if (Array.isArray(roots) && typeof roots[0] === "string" && roots[0].length > 0) {
    return roots[0];
  }
  if (
    typeof process.env.CURSOR_PROJECT_DIR === "string" &&
    process.env.CURSOR_PROJECT_DIR
  ) {
    return process.env.CURSOR_PROJECT_DIR;
  }
  return process.cwd();
}

export function verifyPrGateDisabled() {
  return process.env[VERIFY_PR_GATE_DISABLED_ENV] === "1";
}

export function verifyLedgerLock(root) {
  const lock = verifyLedgerLockPath(root);
  mkdirSync(join(root, ".cursor"), { recursive: true });
  for (let tries = 0; tries < LOCK_MAX_TRIES; tries += 1) {
    try {
      mkdirSync(lock);
      return;
    } catch {
      sleepSync(LOCK_SLEEP_MS);
    }
  }
  throw new Error("verify-ledger: lock timeout");
}

export function verifyLedgerUnlock(root) {
  try {
    rmdirSync(verifyLedgerLockPath(root));
  } catch {
    /* ignore */
  }
}

export function readHeadSha(root) {
  try {
    return execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export function verifyLedgerLoad(root) {
  const path = verifyLedgerPath(root);
  if (!existsSync(path)) {
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
 * Valid for PR: impl_verified===true, head_sha === HEAD, commands.length>=1,
 * every exit_code===0. version must be 1.
 * @returns {{ ok: true, ledger: object } | { ok: false, reason: string }}
 */
export function verifyLedgerValidateForHead(ledger, headSha) {
  if (ledger === null || typeof ledger !== "object" || Array.isArray(ledger)) {
    return { ok: false, reason: "missing-or-invalid-ledger" };
  }
  if (ledger.version !== VERIFY_LEDGER_VERSION) {
    return { ok: false, reason: "bad-version" };
  }
  if (ledger.impl_verified !== true) {
    return { ok: false, reason: "impl-not-verified" };
  }
  if (typeof headSha !== "string" || headSha.length === 0) {
    return { ok: false, reason: "unknown-head" };
  }
  if (ledger.head_sha !== headSha) {
    return { ok: false, reason: "head-sha-mismatch" };
  }
  if (!Array.isArray(ledger.commands) || ledger.commands.length < 1) {
    return { ok: false, reason: "no-commands" };
  }
  for (const entry of ledger.commands) {
    if (
      entry === null ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      typeof entry.cmd !== "string" ||
      typeof entry.exit_code !== "number" ||
      entry.exit_code !== 0
    ) {
      return { ok: false, reason: "nonzero-or-invalid-command" };
    }
  }
  return { ok: true, ledger };
}

/**
 * Load + validate ledger for current HEAD at root.
 * @returns {{ ok: true, ledger: object, headSha: string } | { ok: false, reason: string }}
 */
export function verifyLedgerIsValidForHead(root) {
  const headSha = readHeadSha(root);
  if (!headSha) {
    return { ok: false, reason: "unknown-head" };
  }
  const ledger = verifyLedgerLoad(root);
  if (!ledger) {
    return { ok: false, reason: "missing-or-invalid-ledger" };
  }
  const result = verifyLedgerValidateForHead(ledger, headSha);
  if (!result.ok) {
    return result;
  }
  return { ok: true, ledger: result.ledger, headSha };
}

/**
 * Whether `gh pr create|ready` is allowed under the verify ledger gate.
 * VERIFY_PR_GATE_DISABLED=1 ⇒ allow (skip check only).
 */
export function verifyLedgerAllowsGhPr(root) {
  if (verifyPrGateDisabled()) {
    return { ok: true, skipped: true };
  }
  return verifyLedgerIsValidForHead(root);
}

export function emptyVerifyLedger({ conversationId = "", headSha }) {
  return {
    version: VERIFY_LEDGER_VERSION,
    conversation_id: conversationId,
    impl_verified: false,
    verified_at: null,
    head_sha: headSha,
    commands: [],
  };
}

/**
 * Append one command result. Resets commands when head_sha changes.
 * Sets impl_verified when every recorded exit_code is 0 and length>=1.
 */
export function verifyLedgerAppendCommand(root, { cmd, exitCode, conversationId = "" }) {
  if (typeof cmd !== "string" || cmd.length === 0) {
    throw new Error("verify-ledger: cmd required");
  }
  if (typeof exitCode !== "number" || !Number.isInteger(exitCode)) {
    throw new Error("verify-ledger: exit_code must be an integer");
  }

  const headSha = readHeadSha(root);
  if (!headSha) {
    throw new Error("verify-ledger: cannot resolve git HEAD");
  }

  const at = new Date().toISOString();
  verifyLedgerLock(root);
  try {
    let ledger = verifyLedgerLoad(root);
    if (
      !ledger ||
      ledger.version !== VERIFY_LEDGER_VERSION ||
      ledger.head_sha !== headSha
    ) {
      ledger = emptyVerifyLedger({
        conversationId:
          conversationId ||
          (ledger && typeof ledger.conversation_id === "string"
            ? ledger.conversation_id
            : ""),
        headSha,
      });
    }

    if (conversationId) {
      ledger.conversation_id = conversationId;
    } else if (typeof ledger.conversation_id !== "string") {
      ledger.conversation_id = "";
    }

    ledger.head_sha = headSha;
    if (!Array.isArray(ledger.commands)) {
      ledger.commands = [];
    }
    ledger.commands.push({ cmd, exit_code: exitCode, at });

    const allZero =
      ledger.commands.length >= 1 &&
      ledger.commands.every(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          typeof entry.exit_code === "number" &&
          entry.exit_code === 0,
      );
    ledger.impl_verified = allZero;
    ledger.verified_at = allZero ? at : null;

    mkdirSync(join(root, ".cursor"), { recursive: true });
    writeFileSync(verifyLedgerPath(root), `${JSON.stringify(ledger, null, 2)}\n`);
    return ledger;
  } finally {
    verifyLedgerUnlock(root);
  }
}

export const GH_PR_WITHOUT_VERIFY_RULE = "gh-pr-without-verify";

export const GH_PR_WITHOUT_VERIFY_AGENT_MESSAGE =
  "Denied: .cursor/verify-ledger.json does not prove impl_verified for the current HEAD. " +
  "Run stack verification (npm test, node scripts/validate.mjs / npm run validate, and brief floors), " +
  "record each with `npm run verify:record -- --run -- <cmd>` (or `--cmd '…' --exit N`), then retry `gh pr create|ready`. " +
  "Emergency only: VERIFY_PR_GATE_DISABLED=1 skips this check.";

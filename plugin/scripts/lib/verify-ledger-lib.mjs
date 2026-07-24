/**
 * verify-ledger-lib.mjs — read/write/validate `.cursor/verify-ledger.json`.
 *
 * Proves checkpoint:impl-verified for the current HEAD before `gh pr create|ready`.
 * Filesystem + git live here so before-shell-execution.mjs can import validators
 * without embedding node:fs / child_process in the guard entry (static scan).
 *
 * Emergency: VERIFY_PR_GATE_DISABLED=1 skips the PR gate check only.
 *
 * Residual: Write-tool forging a full v2 ledger with spawned:true remains
 * possible; this layer does not solve filesystem forgery.
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

export const VERIFY_LEDGER_VERSION = 2;
export const VERIFY_LEDGER_RELATIVE_PATH = join(".cursor", "verify-ledger.json");
export const VERIFY_PR_GATE_DISABLED_ENV = "VERIFY_PR_GATE_DISABLED";
export const VERIFY_LEDGER_PROFILES = Object.freeze([
  "node-harness",
  "rust",
  "custom",
]);

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

function commandBasename(token) {
  const trimmed = token.trim();
  if (trimmed.length === 0) {
    return "";
  }
  const parts = trimmed.split(/[/\\]/u);
  return parts[parts.length - 1] ?? "";
}

/**
 * Tokenize a recorded command string (space-separated; JSON-quoted parts from
 * record-verify when an argv element contained whitespace).
 */
export function tokenizeVerifyCommand(cmd) {
  if (typeof cmd !== "string") {
    return [];
  }
  const tokens = [];
  const source = cmd.trim();
  let index = 0;
  while (index < source.length) {
    while (index < source.length && /\s/u.test(source[index])) {
      index += 1;
    }
    if (index >= source.length) {
      break;
    }
    if (source[index] === '"') {
      let value = "";
      index += 1;
      while (index < source.length) {
        const ch = source[index];
        if (ch === "\\" && index + 1 < source.length) {
          value += source[index + 1];
          index += 2;
          continue;
        }
        if (ch === '"') {
          index += 1;
          break;
        }
        value += ch;
        index += 1;
      }
      tokens.push(value);
      continue;
    }
    const start = index;
    while (index < source.length && !/\s/u.test(source[index])) {
      index += 1;
    }
    tokens.push(source.slice(start, index));
  }
  return tokens;
}

/** Peel env/command/builtin/nohup (and env KEY=val) so argv matching sees the real binary. */
function peelVerifyArgv(tokens) {
  const peeled = [...tokens];
  while (peeled.length > 0) {
    const base = commandBasename(peeled[0]).toLowerCase();
    if (
      base !== "env" &&
      base !== "command" &&
      base !== "builtin" &&
      base !== "nohup"
    ) {
      break;
    }
    peeled.shift();
    if (base === "env") {
      while (
        peeled.length > 0 &&
        /^[A-Za-z_][A-Za-z0-9_]*=/u.test(peeled[0])
      ) {
        peeled.shift();
      }
    }
  }
  return peeled;
}

/**
 * True when a command is too weak to count as verification evidence.
 * Rejected by record-verify --run and by verifyLedgerAppendCommand.
 */
export function verifyCommandIsTrivial(cmd) {
  if (typeof cmd !== "string") {
    return true;
  }
  const trimmed = cmd.trim();
  if (trimmed.length === 0 || trimmed.length < 3) {
    return true;
  }
  const normalized = trimmed.replace(/\s+/gu, " ");
  const lower = normalized.toLowerCase();
  if (lower === ":" || lower === "exit" || lower === "exit 0") {
    return true;
  }
  const tokens = peelVerifyArgv(tokenizeVerifyCommand(lower));
  if (tokens.length === 0) {
    return true;
  }
  const base = commandBasename(tokens[0]);
  if (
    base === "echo" ||
    base === "printf" ||
    base === "true" ||
    base === "false"
  ) {
    return true;
  }
  return false;
}

export function verifyLedgerProfileIsKnown(profile) {
  return (
    typeof profile === "string" &&
    VERIFY_LEDGER_PROFILES.includes(profile)
  );
}

function matchesNodeHarnessValidate(tokens) {
  const bin = commandBasename(tokens[0] ?? "").toLowerCase();
  if (
    tokens.length >= 3 &&
    bin === "npm" &&
    tokens[1] === "run" &&
    tokens[2] === "validate"
  ) {
    return true;
  }
  if (tokens.length >= 2 && bin === "node") {
    const script = tokens[1].replace(/\\/gu, "/");
    if (
      script === "scripts/validate.mjs" ||
      script.endsWith("/scripts/validate.mjs")
    ) {
      return true;
    }
  }
  return false;
}

function matchesNodeHarnessTest(tokens) {
  const bin = commandBasename(tokens[0] ?? "").toLowerCase();
  if (tokens.length >= 2 && bin === "npm" && tokens[1] === "test") {
    return true;
  }
  if (
    tokens.length >= 3 &&
    bin === "npm" &&
    tokens[1] === "run" &&
    tokens[2] === "test"
  ) {
    return true;
  }
  return false;
}

function matchesCargoFmtCheck(tokens) {
  return (
    commandBasename(tokens[0] ?? "").toLowerCase() === "cargo" &&
    tokens[1] === "fmt" &&
    tokens.includes("--check")
  );
}

function matchesCargoClippy(tokens) {
  return (
    commandBasename(tokens[0] ?? "").toLowerCase() === "cargo" &&
    tokens[1] === "clippy"
  );
}

function matchesCargoTest(tokens) {
  const bin = commandBasename(tokens[0] ?? "").toLowerCase();
  return bin === "cargo" && (tokens[1] === "test" || tokens[1] === "nextest");
}

/**
 * Whether recorded commands satisfy the stack profile's required coverage.
 * Matching is argv-shaped (not substring): embedding tokens inside `node -e`
 * payloads does not count.
 */
export function verifyLedgerProfileCoverage(profile, commands) {
  if (!Array.isArray(commands)) {
    return false;
  }
  const argvLists = commands
    .filter(
      (entry) =>
        entry !== null &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        typeof entry.cmd === "string" &&
        entry.spawned === true,
    )
    .map((entry) => peelVerifyArgv(tokenizeVerifyCommand(entry.cmd)));

  if (profile === "node-harness") {
    const hasValidate = argvLists.some((tokens) =>
      matchesNodeHarnessValidate(tokens),
    );
    const hasTest = argvLists.some((tokens) => matchesNodeHarnessTest(tokens));
    return hasValidate && hasTest;
  }

  if (profile === "rust") {
    const hasFmtCheck = argvLists.some((tokens) => matchesCargoFmtCheck(tokens));
    const hasClippy = argvLists.some((tokens) => matchesCargoClippy(tokens));
    const hasTest = argvLists.some((tokens) => matchesCargoTest(tokens));
    return hasFmtCheck && hasClippy && hasTest;
  }

  if (profile === "custom") {
    const nonTrivialSpawned = commands.filter(
      (entry) =>
        entry !== null &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        entry.spawned === true &&
        typeof entry.cmd === "string" &&
        !verifyCommandIsTrivial(entry.cmd),
    );
    return nonTrivialSpawned.length >= 2;
  }

  return false;
}

function computeImplVerified(ledger) {
  if (!Array.isArray(ledger.commands) || ledger.commands.length < 1) {
    return false;
  }
  const allZero = ledger.commands.every(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      typeof entry.exit_code === "number" &&
      entry.exit_code === 0,
  );
  if (!allZero) {
    return false;
  }
  return verifyLedgerProfileCoverage(ledger.profile, ledger.commands);
}

/**
 * Valid for PR: version 2, known profile, impl_verified===true, head_sha === HEAD,
 * commands.length>=1, every exit_code===0, every spawned===true, profile coverage.
 * @returns {{ ok: true, ledger: object } | { ok: false, reason: string }}
 */
export function verifyLedgerValidateForHead(ledger, headSha) {
  if (ledger === null || typeof ledger !== "object" || Array.isArray(ledger)) {
    return { ok: false, reason: "missing-or-invalid-ledger" };
  }
  if (ledger.version !== VERIFY_LEDGER_VERSION) {
    return { ok: false, reason: "bad-version" };
  }
  if (!verifyLedgerProfileIsKnown(ledger.profile)) {
    return { ok: false, reason: "missing-or-unknown-profile" };
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
    if (entry.spawned !== true) {
      return { ok: false, reason: "unspawned-command" };
    }
  }
  if (!verifyLedgerProfileCoverage(ledger.profile, ledger.commands)) {
    return { ok: false, reason: "profile-incomplete" };
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

export function emptyVerifyLedger({ conversationId = "", headSha, profile }) {
  if (!verifyLedgerProfileIsKnown(profile)) {
    throw new Error(
      "verify-ledger: profile required (node-harness|rust|custom)",
    );
  }
  return {
    version: VERIFY_LEDGER_VERSION,
    profile,
    conversation_id: conversationId,
    impl_verified: false,
    verified_at: null,
    head_sha: headSha,
    commands: [],
  };
}

/**
 * Append one spawned command result. Resets commands when head_sha / version changes.
 * Requires profile on first write for a HEAD; subsequent appends may omit profile
 * or must match. Sets impl_verified when all exits are 0 and profile coverage holds.
 */
export function verifyLedgerAppendCommand(
  root,
  { cmd, exitCode, conversationId = "", profile, spawned },
) {
  if (typeof cmd !== "string" || cmd.length === 0) {
    throw new Error("verify-ledger: cmd required");
  }
  if (verifyCommandIsTrivial(cmd)) {
    throw new Error("verify-ledger: trivial command rejected");
  }
  if (typeof exitCode !== "number" || !Number.isInteger(exitCode)) {
    throw new Error("verify-ledger: exit_code must be an integer");
  }
  if (spawned !== true) {
    throw new Error("verify-ledger: spawned must be true (use record-verify --run)");
  }

  const headSha = readHeadSha(root);
  if (!headSha) {
    throw new Error("verify-ledger: cannot resolve git HEAD");
  }

  const at = new Date().toISOString();
  verifyLedgerLock(root);
  try {
    let ledger = verifyLedgerLoad(root);
    const needsFresh =
      !ledger ||
      ledger.version !== VERIFY_LEDGER_VERSION ||
      ledger.head_sha !== headSha;

    if (needsFresh) {
      if (!verifyLedgerProfileIsKnown(profile)) {
        throw new Error(
          "verify-ledger: --profile <node-harness|rust|custom> required on first write for this HEAD",
        );
      }
      ledger = emptyVerifyLedger({
        conversationId:
          conversationId ||
          (ledger && typeof ledger.conversation_id === "string"
            ? ledger.conversation_id
            : ""),
        headSha,
        profile,
      });
    } else {
      if (!verifyLedgerProfileIsKnown(ledger.profile)) {
        if (!verifyLedgerProfileIsKnown(profile)) {
          throw new Error(
            "verify-ledger: --profile <node-harness|rust|custom> required",
          );
        }
        ledger.profile = profile;
      } else if (
        profile !== undefined &&
        profile !== null &&
        profile !== ""
      ) {
        if (profile !== ledger.profile) {
          throw new Error(
            `verify-ledger: profile mismatch (ledger has ${ledger.profile})`,
          );
        }
      }
    }

    if (conversationId) {
      ledger.conversation_id = conversationId;
    } else if (typeof ledger.conversation_id !== "string") {
      ledger.conversation_id = "";
    }

    ledger.version = VERIFY_LEDGER_VERSION;
    ledger.head_sha = headSha;
    if (!Array.isArray(ledger.commands)) {
      ledger.commands = [];
    }
    ledger.commands.push({
      cmd,
      exit_code: exitCode,
      at,
      spawned: true,
    });

    const verified = computeImplVerified(ledger);
    ledger.impl_verified = verified;
    ledger.verified_at = verified ? at : null;

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
  "Choose a stack profile and record only via spawn: " +
  "`npm run verify:record -- --profile <node-harness|rust|custom> --run -- <cmd>`. " +
  "node-harness needs validate + test; rust needs cargo fmt --check, clippy, and test/nextest; " +
  "custom needs ≥2 non-trivial spawned commands. Fake `--cmd/--exit` recording is removed. " +
  "Emergency only: VERIFY_PR_GATE_DISABLED=1 skips this check.";

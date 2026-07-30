/**
 * verify-ledger-lib.mjs — read/write/validate `.cursor/verify-ledger.json`.
 *
 * Proves checkpoint:impl-verified for the current HEAD before `gh pr create|ready`.
 * Filesystem + git live here so before-shell-execution.mjs can import validators
 * without embedding node:fs / child_process in the guard entry (static scan).
 *
 * Emergency: VERIFY_PR_GATE_DISABLED=1 skips the push and PR gate checks.
 *
 * Residual: Write-tool forging a full v2 ledger with spawned:true remains
 * possible; this layer does not solve filesystem forgery.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, dirname, isAbsolute } from "node:path";
import { execFileSync } from "node:child_process";
import {
  isValidVerifyProfile,
  loadVerifyProfile,
  normalizeVerifyCmd,
} from "./ci-parity-lib.mjs";
import { formatRecordVerifyCommand } from "./verify-cli-paths.mjs";

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
/** Lock dirs older than this are leftovers of a killed hook — safe to break. */
const LOCK_STALE_MS = 30_000;

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin — sync-friendly under short hook timeouts */
  }
}

/**
 * Break a stale mkdir-lock (killed hook left the dir behind). The rm is
 * raced-tolerant: another holder may legitimately remove it first.
 */
function breakStaleLockDir(lock) {
  try {
    const stats = statSync(lock);
    if (!stats.isDirectory()) {
      return;
    }
    if (Date.now() - stats.mtimeMs <= LOCK_STALE_MS) {
      return;
    }
    try {
      rmdirSync(lock);
    } catch {
      /* lost the race — another holder removed it; retry loop handles it */
    }
  } catch {
    /* missing/unreadable — normal acquire path handles it */
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
      breakStaleLockDir(lock);
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

function isExistingDirectory(path) {
  if (typeof path !== "string" || path.length === 0) {
    return false;
  }
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function resolveAgainstBase(base, path) {
  if (typeof path !== "string" || path.length === 0) {
    return null;
  }
  return isAbsolute(path) ? resolve(path) : resolve(base, path);
}

/**
 * Resolve the effective git work tree a `git …` invocation would use, from
 * global options before the subcommand (`-C`, `--git-dir`, `--work-tree`,
 * including `=` glued forms; stacked `-C` applied left-to-right).
 *
 * Prefer `--work-tree`, else toplevel from `--git-dir`, else final `-C`,
 * else `cwd`. Returns an absolute existing directory, or `null` (callers
 * fail closed — e.g. deny `git-push-without-verify`).
 *
 * @param {string[]} gitArgv arguments after the `git` executable
 * @param {string} cwd hook / process cwd used for relative path resolution
 * @returns {string | null}
 */
export function resolveGitWorkTreeFromArgv(gitArgv, cwd) {
  if (!Array.isArray(gitArgv) || typeof cwd !== "string" || cwd.length === 0) {
    return null;
  }
  let base = resolve(cwd);
  if (!isExistingDirectory(base)) {
    return null;
  }

  let gitDir = null;
  let workTree = null;
  let index = 0;

  while (index < gitArgv.length) {
    const arg = gitArgv[index];
    if (typeof arg !== "string") {
      return null;
    }
    if (arg === "--" || !arg.startsWith("-") || arg === "-") {
      break;
    }

    if (arg === "-C") {
      const next = gitArgv[index + 1];
      if (typeof next !== "string" || next.length === 0) {
        return null;
      }
      const nextBase = resolveAgainstBase(base, next);
      if (!nextBase || !isExistingDirectory(nextBase)) {
        return null;
      }
      base = nextBase;
      index += 2;
      continue;
    }

    if (arg === "--git-dir") {
      const next = gitArgv[index + 1];
      if (typeof next !== "string" || next.length === 0) {
        return null;
      }
      gitDir = next;
      index += 2;
      continue;
    }
    if (arg.startsWith("--git-dir=")) {
      gitDir = arg.slice("--git-dir=".length);
      if (gitDir.length === 0) {
        return null;
      }
      index += 1;
      continue;
    }

    if (arg === "--work-tree") {
      const next = gitArgv[index + 1];
      if (typeof next !== "string" || next.length === 0) {
        return null;
      }
      workTree = next;
      index += 2;
      continue;
    }
    if (arg.startsWith("--work-tree=")) {
      workTree = arg.slice("--work-tree=".length);
      if (workTree.length === 0) {
        return null;
      }
      index += 1;
      continue;
    }

    if (arg === "-c" || arg === "--namespace") {
      if (typeof gitArgv[index + 1] !== "string") {
        return null;
      }
      index += 2;
      continue;
    }
    if (arg.startsWith("-c") || arg.startsWith("--namespace=")) {
      index += 1;
      continue;
    }

    // Other global flags (`--bare`, `-c key=value` glued, …).
    index += 1;
  }

  if (workTree !== null) {
    const abs = resolveAgainstBase(base, workTree);
    return abs && isExistingDirectory(abs) ? abs : null;
  }

  if (gitDir !== null) {
    const absGitDir = resolveAgainstBase(base, gitDir);
    if (!absGitDir) {
      return null;
    }
    // Standard `repo/.git` layout: parent is the work tree. Do NOT ask
    // `rev-parse --show-toplevel` with only `--git-dir` set — git then treats
    // the process cwd as the work tree, which reintroduces decoy-cwd evasion
    // (`git --git-dir=real/.git push` from a verified decoy).
    const lower = absGitDir.replace(/\\/gu, "/");
    if (lower.endsWith("/.git")) {
      const parent = dirname(absGitDir);
      return isExistingDirectory(parent) ? resolve(parent) : null;
    }
    // Bare / nonstandard git-dir without `--work-tree`: cannot safely bind a
    // ledger root — fail closed.
    return null;
  }

  return base;
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

/** Wrappers peeled so argv matching / trivial checks see the real binary. */
const VERIFY_ARGV_WRAPPERS = new Set([
  "env",
  "command",
  "builtin",
  "nohup",
  "sudo",
  "nice",
  "gnice",
  "time",
  "gtime",
  "timeout",
  "gtimeout",
  "stdbuf",
  "gstdbuf",
  "busybox",
]);

/** Identity / info binaries that never count as verification evidence. */
const VERIFY_TRIVIAL_BINARIES = new Set([
  "echo",
  "printf",
  "true",
  "false",
  ":",
  "pwd",
  "date",
  "whoami",
  "uname",
  "id",
  "hostname",
  "which",
  "type",
  "printenv",
  "basename",
  "dirname",
  "yes",
  "sleep",
  "clear",
  "tput",
]);

/** Shells whose `-c SCRIPT` form is inspected for a trivial SCRIPT. */
const VERIFY_TRIVIAL_SHELLS = new Set([
  "sh",
  "bash",
  "dash",
  "zsh",
  "ksh",
  "ash",
  "csh",
  "tcsh",
]);

/** Strip one layer of matching quotes from a shell `-c` script argument. */
function unwrapShellScriptArg(script) {
  if (typeof script !== "string" || script.length < 2) {
    return script;
  }
  const first = script[0];
  const last = script[script.length - 1];
  if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
    return script.slice(1, -1);
  }
  return script;
}

/**
 * Help / usage flags — after peel, these mean the command did not run the
 * real validate/test/fmt/clippy workload.
 */
function argvHasHelpFlag(tokens) {
  return tokens.includes("--help") || tokens.includes("-h");
}

/**
 * Repo-relative validate entry only — reject absolute paths that merely end
 * in `/scripts/validate.mjs` (e.g. `/tmp/.../scripts/validate.mjs`).
 */
function isRepoRelativeValidateScript(script) {
  const normalized = script.replace(/\\/gu, "/");
  return (
    normalized === "scripts/validate.mjs" ||
    normalized === "./scripts/validate.mjs"
  );
}

/**
 * Peel wrappers (env/command/builtin/nohup/sudo/nice/time/timeout/stdbuf/…)
 * and env KEY=val so argv matching sees the real binary.
 */
function peelVerifyArgv(tokens) {
  const peeled = [...tokens];
  while (peeled.length > 0) {
    const base = commandBasename(peeled[0]).toLowerCase();
    if (!VERIFY_ARGV_WRAPPERS.has(base)) {
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
    } else if (base === "timeout" || base === "gtimeout") {
      // Skip optional flags then required DURATION.
      while (peeled.length > 0 && peeled[0].startsWith("-")) {
        const option = peeled[0];
        peeled.shift();
        if (
          ["-k", "--kill-after", "-s", "--signal"].includes(option) ||
          option.startsWith("--kill-after=") ||
          option.startsWith("--signal=")
        ) {
          if (!option.includes("=") && peeled.length > 0) {
            peeled.shift();
          }
        }
      }
      if (peeled.length > 0) {
        peeled.shift();
      }
    } else if (base === "nice" || base === "gnice") {
      while (peeled.length > 0 && peeled[0].startsWith("-")) {
        const option = peeled[0];
        peeled.shift();
        if (option === "-n" || option === "--adjustment") {
          if (peeled.length > 0) {
            peeled.shift();
          }
        }
      }
    } else if (base === "stdbuf" || base === "gstdbuf") {
      while (peeled.length > 0 && peeled[0].startsWith("-")) {
        peeled.shift();
      }
    } else if (base === "sudo") {
      while (peeled.length > 0 && peeled[0].startsWith("-")) {
        const option = peeled[0];
        peeled.shift();
        if (["-u", "-g", "-h", "-p", "-C"].includes(option) && peeled.length > 0) {
          peeled.shift();
        }
      }
    } else if (base === "time" || base === "gtime") {
      while (peeled.length > 0 && peeled[0].startsWith("-")) {
        peeled.shift();
      }
    } else if (base === "busybox") {
      while (peeled.length > 0 && peeled[0].startsWith("-")) {
        peeled.shift();
      }
    }
  }
  return peeled;
}

/**
 * True when peeled argv is too weak to count as verification evidence.
 */
function verifyPeeledArgvIsTrivial(tokens) {
  if (tokens.length === 0) {
    return true;
  }
  const base = commandBasename(tokens[0]);
  if (VERIFY_TRIVIAL_BINARIES.has(base)) {
    return true;
  }
  // `git` identity/status forms never verify product code.
  if (
    base === "git" &&
    (tokens[1] === "status" ||
      tokens[1] === "rev-parse" ||
      tokens[1] === "--version" ||
      tokens[1] === "version")
  ) {
    return true;
  }
  // Version-only probes (`node --version`, `npm -v`, …).
  if (
    tokens.length === 2 &&
    (tokens[1] === "--version" || tokens[1] === "-v" || tokens[1] === "-V")
  ) {
    return true;
  }
  // Shell wrappers around a trivial script: `sh -c true`, `bash -c ':'`, …
  if (VERIFY_TRIVIAL_SHELLS.has(base)) {
    const cIndex = tokens.indexOf("-c");
    if (cIndex >= 0 && cIndex + 1 < tokens.length) {
      return verifyCommandIsTrivial(unwrapShellScriptArg(tokens[cIndex + 1]));
    }
  }
  return false;
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
  return verifyPeeledArgvIsTrivial(tokens);
}

export function verifyLedgerProfileIsKnown(profile) {
  return (
    typeof profile === "string" &&
    VERIFY_LEDGER_PROFILES.includes(profile)
  );
}

function matchesNodeHarnessValidate(tokens) {
  if (argvHasHelpFlag(tokens)) {
    return false;
  }
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
    const script = typeof tokens[1] === "string" ? tokens[1] : "";
    if (isRepoRelativeValidateScript(script)) {
      return true;
    }
  }
  return false;
}

function matchesNodeHarnessTest(tokens) {
  if (argvHasHelpFlag(tokens)) {
    return false;
  }
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
  if (argvHasHelpFlag(tokens)) {
    return false;
  }
  return (
    commandBasename(tokens[0] ?? "").toLowerCase() === "cargo" &&
    tokens[1] === "fmt" &&
    tokens.includes("--check")
  );
}

/** True when argv has `-D warnings` (split) or glued `-Dwarnings`. */
function hasDenyWarnings(tokens) {
  if (tokens.includes("-Dwarnings")) {
    return true;
  }
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (tokens[index] === "-D" && tokens[index + 1] === "warnings") {
      return true;
    }
  }
  return false;
}

/**
 * CI-shaped clippy: `cargo clippy --all-targets` plus `-D warnings`
 * (`-Dwarnings` or `-D` + `warnings`, including after `--`).
 */
function matchesCargoClippy(tokens) {
  if (argvHasHelpFlag(tokens)) {
    return false;
  }
  return (
    commandBasename(tokens[0] ?? "").toLowerCase() === "cargo" &&
    tokens[1] === "clippy" &&
    tokens.includes("--all-targets") &&
    hasDenyWarnings(tokens)
  );
}

function matchesCargoTest(tokens) {
  if (argvHasHelpFlag(tokens)) {
    return false;
  }
  const bin = commandBasename(tokens[0] ?? "").toLowerCase();
  return bin === "cargo" && (tokens[1] === "test" || tokens[1] === "nextest");
}

/**
 * Per-binary meaningful-subcommand allowlists (Tier 1 — custom-profile inert
 * commands). Bare `go version` + `go env` satisfied coverage when these
 * binaries were allowlisted with ANY subcommand. Only workload subcommands
 * count; `--version`/`--help`/`env`/`version`/`help` forms never count.
 */
const VERIFY_CUSTOM_GO_SUBCOMMANDS = new Set(["test", "vet", "build"]);

/** True for an explicit build target — not a flag, assignment, or help form. */
function isMeaningfulBuildTarget(token) {
  return (
    typeof token === "string" &&
    token.length > 0 &&
    !token.startsWith("-") &&
    !/^(?:help|version)$/iu.test(token) &&
    !/^[A-Za-z_][A-Za-z0-9_]*=/u.test(token)
  );
}

/**
 * Flags whose NEXT argv word is a value, not a build target (Tier 1 — flag
 * values misclassified as targets: `make -C src` / `ninja -j 8` satisfied
 * coverage while running the semantically bare default target). Consuming the
 * value leaves flag-only invocations with no target → excluded. Standalone
 * non-value flags (`make -k`) are skipped by isMeaningfulBuildTarget itself.
 */
const BUILD_VALUE_TAKING_FLAGS = new Map([
  ["make", new Set(["-C", "-f", "-j", "-o", "-W", "-I"])],
  ["ninja", new Set(["-C", "-f", "-j", "-k", "-l"])],
]);

/** True when argv after the binary contains an explicit build target. */
function hasMeaningfulBuildTarget(bin, tokens) {
  const valueFlags = BUILD_VALUE_TAKING_FLAGS.get(bin);
  const rest = tokens.slice(1);
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (valueFlags.has(token)) {
      index += 1; // consume the flag's value
      continue;
    }
    // Glued value form (`-j4`, `-Csrc`) — value embedded, nothing to consume.
    if (
      token.length > 2 &&
      token[0] === "-" &&
      token[1] !== "-" &&
      valueFlags.has(token.slice(0, 2))
    ) {
      continue;
    }
    if (isMeaningfulBuildTarget(token)) {
      return true;
    }
  }
  return false;
}

function matchesCustomGo(tokens) {
  return VERIFY_CUSTOM_GO_SUBCOMMANDS.has(tokens[1]);
}

function matchesCustomCmake(tokens) {
  return tokens[1] === "--build";
}

function matchesCustomMake(tokens) {
  // Bare `make` / flag-only invocations are unverifiable — require an
  // explicit non-help target (`make test`, `make -j4 check`).
  return hasMeaningfulBuildTarget("make", tokens);
}

function matchesCustomNinja(tokens) {
  // `-t` runs an inert tool (list/query); otherwise require an explicit
  // target — bare `ninja` is unverifiable.
  if (tokens.includes("-t")) {
    return false;
  }
  return hasMeaningfulBuildTarget("ninja", tokens);
}

/**
 * Positive allowlist for `custom` profile coverage — ≥2 spawned commands that
 * look like real verification (test/lint/build runners), not identity probes.
 * Denylisting alone is endless (`pwd`/`date`/`whoami`/…); this closes the
 * Tier 1 bypass of clearing the PR gate with two inert spawned commands.
 */
function matchesCustomVerification(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return false;
  }
  if (
    matchesNodeHarnessValidate(tokens) ||
    matchesNodeHarnessTest(tokens) ||
    matchesCargoFmtCheck(tokens) ||
    matchesCargoClippy(tokens) ||
    matchesCargoTest(tokens)
  ) {
    return true;
  }

  const bin = commandBasename(tokens[0] ?? "").toLowerCase();

  // Package-manager script runners.
  if (
    ["npm", "pnpm", "yarn", "bun"].includes(bin) &&
    tokens[1] === "run" &&
    typeof tokens[2] === "string" &&
    tokens[2].length > 0
  ) {
    return true;
  }
  if (["pnpm", "yarn", "bun"].includes(bin) && tokens[1] === "test") {
    return true;
  }

  // Node test runners / scripts.
  if (bin === "node") {
    if (tokens.includes("--test")) {
      return true;
    }
    const script = typeof tokens[1] === "string" ? tokens[1].replace(/\\/gu, "/") : "";
    if (/\.(mjs|cjs|js)$/iu.test(script)) {
      return true;
    }
  }

  // Build runners whose subcommand decides whether real work happened
  // (bare binary / version / env / help forms are inert — Tier 1).
  if (bin === "go") {
    return matchesCustomGo(tokens);
  }
  if (bin === "cmake") {
    return matchesCustomCmake(tokens);
  }
  if (bin === "make") {
    return matchesCustomMake(tokens);
  }
  if (bin === "ninja") {
    return matchesCustomNinja(tokens);
  }

  // Common language / build test & lint runners.
  if (
    [
      "just",
      "task",
      "tox",
      "nox",
      "pytest",
      "ruff",
      "flake8",
      "mypy",
      "pylint",
      "eslint",
      "prettier",
      "black",
      "isort",
      "mvn",
      "gradle",
      "gradlew",
      "bazel",
      "sbt",
      "deno",
      "meson",
    ].includes(bin)
  ) {
    return true;
  }

  if (
    (bin === "python" || bin === "python3") &&
    tokens[1] === "-m" &&
    ["pytest", "unittest", "mypy", "ruff", "flake8", "pylint"].includes(
      tokens[2],
    )
  ) {
    return true;
  }

  // Project-local scripts under scripts/ or bin/, or names that embed
  // test/validate/lint/check/verify.
  const first = tokens[0] ?? "";
  if (
    /^(?:\.\/)?(?:scripts|bin)\//u.test(first.replace(/\\/gu, "/")) ||
    (/(?:test|validate|lint|check|verify)/iu.test(bin) &&
      (first.includes("/") || /\.(sh|py|rb|pl|mjs|cjs|js)$/iu.test(bin)))
  ) {
    return true;
  }

  return false;
}

/**
 * Whether recorded commands satisfy the stack profile's required coverage.
 * Matching is argv-shaped (not substring): embedding tokens inside `node -e`
 * payloads does not count.
 *
 * For `custom`: when `root` has a valid `.cursor/verify-profile.json`
 * (`version: 1`, non-empty `commands`), each listed command must appear as a
 * spawned exit-0 entry after `normalizeVerifyCmd` on both sides. Listed cmds
 * that are trivial or fail `matchesCustomVerification` never satisfy
 * coverage (reject inert sidecar entries like `go version`). Otherwise falls
 * back to ≥2 verification-shaped commands.
 *
 * @param {string} profile
 * @param {unknown[]} commands
 * @param {string} [root] project root for optional verify-profile sidecar
 */
export function verifyLedgerProfileCoverage(profile, commands, root) {
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
    if (typeof root === "string" && root.length > 0) {
      const verifyProfile = loadVerifyProfile(root);
      if (isValidVerifyProfile(verifyProfile)) {
        return verifyProfile.commands.every((requiredCmd) => {
          const requiredNorm = normalizeVerifyCmd(requiredCmd);
          if (
            requiredNorm.length === 0 ||
            verifyCommandIsTrivial(requiredNorm) ||
            !matchesCustomVerification(
              peelVerifyArgv(tokenizeVerifyCommand(requiredNorm)),
            )
          ) {
            return false;
          }
          return commands.some(
            (entry) =>
              entry !== null &&
              typeof entry === "object" &&
              !Array.isArray(entry) &&
              entry.spawned === true &&
              typeof entry.cmd === "string" &&
              normalizeVerifyCmd(entry.cmd) === requiredNorm &&
              typeof entry.exit_code === "number" &&
              entry.exit_code === 0 &&
              !verifyCommandIsTrivial(entry.cmd) &&
              matchesCustomVerification(
                peelVerifyArgv(tokenizeVerifyCommand(entry.cmd)),
              ),
          );
        });
      }
    }
    const qualifying = commands.filter(
      (entry) =>
        entry !== null &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        entry.spawned === true &&
        typeof entry.cmd === "string" &&
        !verifyCommandIsTrivial(entry.cmd) &&
        matchesCustomVerification(
          peelVerifyArgv(tokenizeVerifyCommand(entry.cmd)),
        ),
    );
    return qualifying.length >= 2;
  }

  return false;
}

function computeImplVerified(ledger, root) {
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
  return verifyLedgerProfileCoverage(ledger.profile, ledger.commands, root);
}

/**
 * Valid for PR: version 2, known profile, impl_verified===true, head_sha === HEAD,
 * commands.length>=1, every exit_code===0, every spawned===true, profile coverage.
 * @param {object} ledger
 * @param {string} headSha
 * @param {string} [root] project root (loads `.cursor/verify-profile.json` for custom)
 * @returns {{ ok: true, ledger: object } | { ok: false, reason: string }}
 */
export function verifyLedgerValidateForHead(ledger, headSha, root) {
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
  if (!verifyLedgerProfileCoverage(ledger.profile, ledger.commands, root)) {
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
  const result = verifyLedgerValidateForHead(ledger, headSha, root);
  if (!result.ok) {
    return result;
  }
  return { ok: true, ledger: result.ledger, headSha };
}

/**
 * Whether `gh pr create|ready` / plain `git push` is allowed under the verify
 * ledger gate. VERIFY_PR_GATE_DISABLED=1 ⇒ allow (skip check only — covers
 * both push and PR).
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
 * Record one spawned command result. Resets commands when head_sha / version
 * changes. An identical cmd string supersedes the prior entry (latest wins).
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
    // Re-record supersede (Tier 1 — poisoned ledger recovery): an identical
    // cmd string REPLACES every prior entry (latest wins) instead of
    // appending a duplicate, so one flaky failure cannot block the HEAD
    // forever once the same command is re-run and passes. ALL cmd-equal
    // entries are dropped — legacy ledgers may hold duplicates, and replacing
    // only the first would leave a stale failure behind.
    const entry = { cmd, exit_code: exitCode, at, spawned: true };
    ledger.commands = ledger.commands.filter(
      (existing) =>
        existing === null ||
        typeof existing !== "object" ||
        Array.isArray(existing) ||
        existing.cmd !== cmd,
    );
    ledger.commands.push(entry);

    const verified = computeImplVerified(ledger, root);
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

const RECORD_VERIFY_SPAWN_HINT = formatRecordVerifyCommand(
  "<node-harness|rust|custom>",
  "<cmd>",
);

export const GH_PR_WITHOUT_VERIFY_AGENT_MESSAGE =
  "Denied: .cursor/verify-ledger.json does not prove impl_verified for the current HEAD. " +
  "Choose a stack profile and record only via spawn: " +
  `\`${RECORD_VERIFY_SPAWN_HINT}\`. ` +
  "Harness dogfood only: `npm run verify:record -- --profile <node-harness|rust|custom> --run -- <cmd>`. " +
  "node-harness needs validate + test; rust needs cargo fmt --check, " +
  "`clippy --all-targets -- -D warnings`, and test/nextest; " +
  "custom needs ≥2 verification-shaped spawned commands (test/lint/build runners — not pwd/date/…). " +
  "If `.cursor/verify-profile.json` exists, those exact cmds must be recorded. " +
  "Fake `--cmd/--exit` recording is removed. " +
  "Emergency only: VERIFY_PR_GATE_DISABLED=1 skips this check (covers both git push and gh pr).";

export const GIT_PUSH_WITHOUT_VERIFY_RULE = "git-push-without-verify";

export const GIT_PUSH_WITHOUT_VERIFY_AGENT_MESSAGE =
  "Denied: git push requires .cursor/verify-ledger.json proving impl_verified for the current HEAD. " +
  "Choose a stack profile and record only via spawn: " +
  `\`${RECORD_VERIFY_SPAWN_HINT}\`. ` +
  "Harness dogfood only: `npm run verify:record -- --profile <node-harness|rust|custom> --run -- <cmd>`. " +
  "node-harness needs validate + test; rust needs cargo fmt --check, " +
  "`clippy --all-targets -- -D warnings`, and test/nextest; " +
  "custom needs ≥2 verification-shaped spawned commands (test/lint/build runners — not pwd/date/…). " +
  "If `.cursor/verify-profile.json` exists, those exact cmds must be recorded. " +
  "Fake `--cmd/--exit` recording is removed. " +
  "Emergency only: VERIFY_PR_GATE_DISABLED=1 skips this check (covers both git push and gh pr).";

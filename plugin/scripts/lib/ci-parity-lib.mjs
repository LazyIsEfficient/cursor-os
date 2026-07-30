/**
 * ci-parity-lib.mjs — discover CI check commands and write verify-profile sidecar.
 *
 * Pure filesystem + regex heuristics (no network, no YAML parser). Prefer
 * over-extracting runnable check lines; filter deploy/publish/upload noise.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatRecordVerifyCommand } from "./verify-cli-paths.mjs";

export {
  formatCiParityCommand,
  formatRecordVerifyCommand,
  verifyPluginScriptsRoot,
} from "./verify-cli-paths.mjs";

export const VERIFY_PROFILE_VERSION = 1;
export const VERIFY_PROFILE_RELATIVE_PATH = join(".cursor", "verify-profile.json");

const WORKFLOW_EXTS = new Set([".yml", ".yaml"]);

/** Command lines that look like verification, not deploy/publish noise. */
const NOISE_RE =
  /\b(?:deploy|publish|upload-artifact|download-artifact|docker\s+push|gh\s+release|kubectl\s+apply|helm\s+(?:upgrade|install)|aws\s+s3|terraform\s+apply|pulumi\s+up|twine\s+upload|npm\s+publish|cargo\s+publish|anvil\s+upload)\b/iu;

const CARGO_CHECK_RE =
  /^\s*(?:cargo\s+(?:fmt(?:\s+--check)?|clippy\b.*|test\b.*|nextest\b.*))\s*$/iu;

const NPM_CHECK_RE =
  /^\s*(?:npm\s+(?:test|run\s+(?:validate|lint|typecheck|test|build))\b.*)\s*$/iu;

const JUST_RECIPE_NAME_RE = /^(?:check|ci|test|lint|validate|fmt|clippy|typecheck)\b/iu;
const MAKE_TARGET_RE = /^(?:check|test|lint|ci)\s*:/u;

/**
 * @param {string} root
 * @returns {{ path: string, kind: "workflow" | "justfile" | "makefile", relative: string }[]}
 */
export function discoverCiSources(root) {
  const sources = [];
  const workflowsDir = join(root, ".github", "workflows");
  if (existsSync(workflowsDir)) {
    let entries = [];
    try {
      entries = readdirSync(workflowsDir, { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      const name = entry.name;
      const lower = name.toLowerCase();
      const dot = lower.lastIndexOf(".");
      const ext = dot >= 0 ? lower.slice(dot) : "";
      if (!WORKFLOW_EXTS.has(ext)) {
        continue;
      }
      const absolute = join(workflowsDir, name);
      sources.push({
        path: absolute,
        kind: "workflow",
        relative: join(".github", "workflows", name),
      });
    }
  }

  for (const name of ["justfile", "Justfile"]) {
    const absolute = join(root, name);
    if (existsSync(absolute)) {
      sources.push({ path: absolute, kind: "justfile", relative: name });
    }
  }

  const makefile = join(root, "Makefile");
  if (existsSync(makefile)) {
    sources.push({ path: makefile, kind: "makefile", relative: "Makefile" });
  }

  return sources;
}

function normalizeCommand(line) {
  return line.replace(/\s+/gu, " ").trim();
}

/**
 * Canonical form for verify-profile cmds and ledger coverage compare.
 * Collapses whitespace, tokenizes (unwrapping `"…"`), strips residual
 * surrounding quotes per token, joins with a single space — so
 * `pytest -k "not slow"` matches ledger `pytest -k not slow` /
 * `pytest -k "not slow"` after both sides normalize. Used by
 * `writeVerifyProfile` and `verifyLedgerProfileCoverage`.
 * @param {string} cmd
 * @returns {string}
 */
export function normalizeVerifyCmd(cmd) {
  if (typeof cmd !== "string") {
    return "";
  }
  const source = normalizeCommand(cmd);
  if (source.length === 0) {
    return "";
  }
  // Lightweight tokenize: honor double-quoted spans, then strip residual
  // matching quotes on each token (covers single-quoted shell forms).
  const tokens = [];
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
    if (source[index] === "'") {
      let value = "";
      index += 1;
      while (index < source.length && source[index] !== "'") {
        value += source[index];
        index += 1;
      }
      if (index < source.length && source[index] === "'") {
        index += 1;
      }
      tokens.push(value);
      continue;
    }
    const start = index;
    while (index < source.length && !/\s/u.test(source[index])) {
      index += 1;
    }
    let token = source.slice(start, index);
    if (
      token.length >= 2 &&
      ((token[0] === '"' && token[token.length - 1] === '"') ||
        (token[0] === "'" && token[token.length - 1] === "'"))
    ) {
      token = token.slice(1, -1);
    }
    tokens.push(token);
  }
  return tokens.join(" ").replace(/\s+/gu, " ").trim();
}

function isNoiseCommand(cmd) {
  return NOISE_RE.test(cmd);
}

function looksLikeCheckCommand(cmd) {
  if (typeof cmd !== "string" || cmd.length < 3) {
    return false;
  }
  if (isNoiseCommand(cmd)) {
    return false;
  }
  const trimmed = cmd.trim();
  if (CARGO_CHECK_RE.test(trimmed) || NPM_CHECK_RE.test(trimmed)) {
    return true;
  }
  // Broader: cargo / npm / just / make verification-shaped starters.
  if (
    /^(?:cargo\s+(?:fmt|clippy|test|nextest)\b)/iu.test(trimmed) ||
    /^(?:npm\s+(?:test|run\s+(?:validate|lint|typecheck|test|build)\b))/iu.test(
      trimmed,
    ) ||
    /^(?:just\s+(?:check|ci|test|lint|validate|fmt|clippy)\b)/iu.test(trimmed) ||
    /^(?:make\s+(?:check|test|lint|ci)\b)/iu.test(trimmed) ||
    /^(?:pnpm|yarn|bun)\s+(?:test|run\s+\S+)/iu.test(trimmed)
  ) {
    return true;
  }
  return false;
}

/**
 * Collect `run:` shell bodies from workflow YAML via line heuristics.
 * @param {string} text
 * @returns {string[]}
 */
function extractWorkflowRunBodies(text) {
  const lines = text.split(/\r?\n/u);
  const bodies = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const runMatch = /^(\s*)(?:-\s*)?run\s*:\s*(.*)$/u.exec(line);
    if (!runMatch) {
      i += 1;
      continue;
    }
    const indent = runMatch[1].length;
    const rest = runMatch[2];
    if (rest === "|" || rest === ">" || rest === "|-" || rest === ">-") {
      i += 1;
      const block = [];
      while (i < lines.length) {
        const blockLine = lines[i];
        if (blockLine.trim() === "") {
          i += 1;
          continue;
        }
        const leading = /^(\s*)/u.exec(blockLine)?.[1].length ?? 0;
        if (leading <= indent) {
          break;
        }
        block.push(blockLine.trim());
        i += 1;
      }
      if (block.length > 0) {
        bodies.push(block.join("\n"));
      }
      continue;
    }
    if (rest.length > 0) {
      bodies.push(rest);
    }
    i += 1;
  }
  return bodies;
}

/**
 * Split a shell body into candidate command lines (ignore comments / blanks).
 * @param {string} body
 * @returns {string[]}
 */
function splitShellBody(body) {
  return body
    .split(/\r?\n/u)
    .map((line) => line.replace(/^\s*-\s*/u, "").trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/**
 * Extract check-shaped commands from a justfile, limited to check/ci/test/lint recipes.
 * @param {string} text
 * @returns {string[]}
 */
function extractJustfileCommands(text) {
  const lines = text.split(/\r?\n/u);
  const commands = [];
  let inTarget = false;
  for (const line of lines) {
    if (/^\S/u.test(line) && line.includes(":")) {
      const name = line.split(":")[0].trim();
      // Skip assignments / settings.
      if (name.includes("=") || name.startsWith("set ") || name.startsWith("#")) {
        inTarget = false;
        continue;
      }
      inTarget = JUST_RECIPE_NAME_RE.test(name);
      continue;
    }
    if (!inTarget) {
      continue;
    }
    if (/^\s+/u.test(line) && line.trim().length > 0 && !line.trim().startsWith("#")) {
      let cmd = normalizeCommand(line);
      if (cmd.startsWith("@")) {
        cmd = normalizeCommand(cmd.slice(1));
      }
      // Recipe body lines inside check-named recipes — keep runnable lines.
      if (cmd.length > 0 && !isNoiseCommand(cmd)) {
        commands.push(cmd);
      }
    }
  }
  return commands;
}

/**
 * Extract make target bodies for check/test/lint/ci.
 * @param {string} text
 * @returns {string[]}
 */
function extractMakefileCommands(text) {
  const lines = text.split(/\r?\n/u);
  const commands = [];
  let inTarget = false;
  for (const line of lines) {
    if (MAKE_TARGET_RE.test(line)) {
      inTarget = true;
      continue;
    }
    if (/^\S/u.test(line)) {
      inTarget = false;
      continue;
    }
    if (!inTarget) {
      continue;
    }
    const trimmed = line.replace(/^\t/u, "").trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }
    const cmd = normalizeCommand(trimmed.replace(/^@/u, ""));
    if (!isNoiseCommand(cmd)) {
      commands.push(cmd);
    }
  }
  return commands;
}

/**
 * Heuristic extract of verification-shaped shell lines.
 * @param {string} text
 * @param {"workflow" | "justfile" | "makefile"} kind
 * @returns {string[]}
 */
export function extractCheckCommands(text, kind) {
  if (typeof text !== "string" || text.length === 0) {
    return [];
  }

  let raw = [];
  if (kind === "workflow") {
    const bodies = extractWorkflowRunBodies(text);
    for (const body of bodies) {
      for (const line of splitShellBody(body)) {
        const cmd = normalizeCommand(line);
        if (looksLikeCheckCommand(cmd)) {
          raw.push(cmd);
        }
      }
    }
  } else if (kind === "justfile") {
    raw = extractJustfileCommands(text)
      .map(normalizeCommand)
      .filter(looksLikeCheckCommand);
  } else if (kind === "makefile") {
    raw = extractMakefileCommands(text)
      .map(normalizeCommand)
      .filter(looksLikeCheckCommand);
  }

  const seen = new Set();
  const out = [];
  for (const cmd of raw) {
    if (!cmd || isNoiseCommand(cmd) || seen.has(cmd)) {
      continue;
    }
    seen.add(cmd);
    out.push(cmd);
  }
  return out;
}

function commandLooksRust(cmd) {
  return /^cargo\s+(?:fmt|clippy|test|nextest)\b/iu.test(cmd);
}

function commandLooksNodeHarness(cmd) {
  return (
    /^npm\s+test\b/iu.test(cmd) ||
    /^npm\s+run\s+(?:validate|test)\b/iu.test(cmd) ||
    /^node\s+(?:\.\/)?scripts\/validate\.mjs\b/u.test(cmd)
  );
}

function hasRustCoverage(commands) {
  const hasFmt = commands.some((c) => /^cargo\s+fmt\b/iu.test(c) && /\s--check\b/u.test(c));
  const hasClippy = commands.some(
    (c) =>
      /^cargo\s+clippy\b/iu.test(c) &&
      /\s--all-targets\b/u.test(c) &&
      (/\s-Dwarnings\b/u.test(c) || /\s-D\s+warnings\b/u.test(c)),
  );
  const hasTest = commands.some((c) =>
    /^cargo\s+(?:test|nextest)\b/iu.test(c),
  );
  return hasFmt && hasClippy && hasTest;
}

function hasNodeHarnessCoverage(commands) {
  const hasValidate = commands.some(
    (c) =>
      /^npm\s+run\s+validate\b/iu.test(c) ||
      /^node\s+(?:\.\/)?scripts\/validate\.mjs\b/u.test(c),
  );
  const hasTest = commands.some(
    (c) => /^npm\s+test\b/iu.test(c) || /^npm\s+run\s+test\b/iu.test(c),
  );
  return hasValidate && hasTest;
}

/**
 * @param {string[]} commands
 * @returns {"rust" | "node-harness" | "custom"}
 */
export function recommendProfile(commands) {
  if (!Array.isArray(commands) || commands.length === 0) {
    return "custom";
  }
  if (hasRustCoverage(commands)) {
    return "rust";
  }
  if (hasNodeHarnessCoverage(commands)) {
    return "node-harness";
  }
  // If everything looks like one stack but incomplete → still custom.
  const allRust = commands.every(commandLooksRust);
  const allNode = commands.every(commandLooksNodeHarness);
  if (allRust && !allNode) {
    return "custom";
  }
  return "custom";
}

/**
 * Human-readable shell lines for record-verify.
 * @param {"rust" | "node-harness" | "custom"} profile
 * @param {string[]} commands
 * @returns {string}
 */
export function formatRecordRecipe(profile, commands) {
  if (!Array.isArray(commands) || commands.length === 0) {
    return "";
  }
  return commands
    .map((cmd) => formatRecordVerifyCommand(profile, cmd))
    .join("\n");
}

export function verifyProfilePath(root) {
  return join(root, VERIFY_PROFILE_RELATIVE_PATH);
}

/**
 * @param {unknown} value
 * @returns {value is { version: number, commands: string[], source?: string }}
 */
export function isValidVerifyProfile(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const profile = /** @type {{ version?: unknown, commands?: unknown }} */ (value);
  if (profile.version !== VERIFY_PROFILE_VERSION) {
    return false;
  }
  if (!Array.isArray(profile.commands) || profile.commands.length === 0) {
    return false;
  }
  return profile.commands.every(
    (cmd) => typeof cmd === "string" && cmd.trim().length > 0,
  );
}

/**
 * @param {string} root
 * @param {{ commands: string[], source?: string }} options
 * @returns {object}
 */
export function writeVerifyProfile(root, { commands, source = "ci-parity" }) {
  if (!Array.isArray(commands) || commands.length === 0) {
    throw new Error("ci-parity: commands required");
  }
  const payload = {
    version: VERIFY_PROFILE_VERSION,
    commands: commands.map((cmd) => normalizeVerifyCmd(String(cmd))),
    source: typeof source === "string" && source.length > 0 ? source : "ci-parity",
  };
  mkdirSync(join(root, ".cursor"), { recursive: true });
  writeFileSync(
    verifyProfilePath(root),
    `${JSON.stringify(payload, null, 2)}\n`,
  );
  return payload;
}

/**
 * @param {string} root
 * @returns {null | object}
 */
export function loadVerifyProfile(root) {
  const path = verifyProfilePath(root);
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
 * Discover sources, extract + dedupe commands, recommend profile.
 * @param {string} root
 * @returns {{ sources: object[], commands: string[], profile: string, recipe: string }}
 */
export function scanCiParity(root) {
  const sources = discoverCiSources(root);
  const seen = new Set();
  const commands = [];
  for (const source of sources) {
    let text = "";
    try {
      text = readFileSync(source.path, "utf8");
    } catch {
      continue;
    }
    for (const cmd of extractCheckCommands(text, source.kind)) {
      if (seen.has(cmd)) {
        continue;
      }
      seen.add(cmd);
      commands.push(cmd);
    }
  }
  const profile = recommendProfile(commands);
  const recipe = formatRecordRecipe(profile, commands);
  return { sources, commands, profile, recipe };
}

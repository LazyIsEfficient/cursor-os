import { lstatSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";

const MAX_INPUT_BYTES = 1024 * 1024;
const STATE_FILENAME = "SESSION-STATE.md";
const KNOWN_TRIGGERS = new Set(["auto", "manual"]);

function response(trigger) {
  if (typeof trigger !== "string") {
    return {};
  }
  return {
    user_message: [
      `Context was compacted (${trigger} trigger). Cursor has no per-prompt context-injection hook,`,
      `so ${STATE_FILENAME} is NOT re-injected automatically after compaction.`,
      `Run /state to re-read ${STATE_FILENAME} before relying on earlier session context.`,
    ].join(" "),
  };
}

function triggerLabel(payload) {
  return KNOWN_TRIGGERS.has(payload.trigger) ? payload.trigger : "unknown";
}

function projectDirectory(payload) {
  const roots = payload.workspace_roots;
  const root = Array.isArray(roots) ? roots[0] : undefined;
  if (typeof root === "string" && root.length > 0) {
    return root;
  }
  const configured = process.env.CURSOR_PROJECT_DIR;
  if (typeof configured === "string" && configured.length > 0) {
    return configured;
  }
  return process.cwd();
}

// Rejects symlinks, FIFOs, directories, and devices, then proves the fully
// resolved target still sits under the resolved project directory. realpathSync
// resolves every path component, so a symlinked parent directory is caught too.
function resolveInsideProject(directory, relativePath) {
  const target = join(directory, relativePath);
  if (!lstatSync(target).isFile()) {
    throw new Error("hook target is not a regular file");
  }
  const root = realpathSync(directory);
  const resolved = realpathSync(target);
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (!resolved.startsWith(prefix)) {
    throw new Error("hook target escapes the project directory");
  }
  return resolved;
}

function hasState(directory) {
  try {
    resolveInsideProject(directory, STATE_FILENAME);
    return true;
  } catch {
    return false;
  }
}

async function readInput() {
  let input = "";
  let bytes = 0;
  let tooLarge = false;

  for await (const chunk of process.stdin) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > MAX_INPUT_BYTES) {
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

async function main() {
  try {
    const payload = JSON.parse(await readInput());
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("invalid hook payload");
    }

    const trigger = hasState(projectDirectory(payload)) ? triggerLabel(payload) : null;
    process.stdout.write(`${JSON.stringify(response(trigger))}\n`);
  } catch {
    process.stdout.write(`${JSON.stringify(response(null))}\n`);
  }
}

await main();

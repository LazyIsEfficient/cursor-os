/**
 * verify-cli-paths.mjs — consumer-facing verify CLI command strings.
 *
 * Consumers run plugin scripts via CURSOR_PLUGIN_ROOT (or the local install
 * path). `npm run verify:*` exists only in the cursor-os harness package.json.
 */

import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_PLUGIN_ROOT = join(
  homedir(),
  ".cursor",
  "plugins",
  "local",
  "cursor-harness",
);

/**
 * Plugin install root for verify scripts.
 * @returns {string}
 */
export function verifyPluginScriptsRoot() {
  const env = process.env.CURSOR_PLUGIN_ROOT;
  if (typeof env === "string" && env.trim().length > 0) {
    return env.trim();
  }
  return DEFAULT_PLUGIN_ROOT;
}

/**
 * Spawn-only record-verify command for consumers.
 * @param {string} profile
 * @param {string} cmd
 * @returns {string}
 */
export function formatRecordVerifyCommand(profile, cmd) {
  const root = verifyPluginScriptsRoot();
  return `node "${root}/scripts/record-verify.mjs" --profile ${profile} --run -- ${cmd}`;
}

/**
 * CI-parity scan command for consumers.
 * @param {boolean} [write=false]
 * @returns {string}
 */
export function formatCiParityCommand(write = false) {
  const root = verifyPluginScriptsRoot();
  return `node "${root}/scripts/ci-parity.mjs"${write ? " --write" : ""}`;
}

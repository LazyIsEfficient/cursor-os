/**
 * verify-ledger-stop-lib.mjs — pure stop-hook logic for verify-before-push.
 *
 * When the session completes with a dirty worktree or commits ahead of
 * upstream, and the verify ledger does not prove impl_verified for HEAD,
 * return a one-shot followup (hooks.json loop_limit: 1) so the agent records
 * verification before the next push/PR attempt.
 *
 * VERIFY_PR_GATE_DISABLED=1 ⇒ no followup (same kill-switch as push/PR gate).
 */

import { spawnSync } from "node:child_process";
import {
  VERIFY_PR_GATE_DISABLED_ENV,
  verifyLedgerIsValidForHead,
  verifyLedgerProjectRoot,
  verifyPrGateDisabled,
} from "./verify-ledger-lib.mjs";

export const VERIFY_LEDGER_STOP_FOLLOWUP_MESSAGE = [
  "Local git is dirty or ahead of upstream, but `.cursor/verify-ledger.json` does not prove `impl_verified` for the current HEAD.",
  "Record verification before push/PR:",
  "`npm run verify:record -- --profile <node-harness|rust|custom> --run -- <cmd>`",
  "(node-harness: validate + test; rust: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, test/nextest; custom: ≥2 verification-shaped commands).",
  "Consumer repos: also run `/verify-ci-parity` when CI floors differ from local.",
  `Emergency only: ${VERIFY_PR_GATE_DISABLED_ENV}=1 skips push, PR, and this stop follow-up.`,
].join(" ");

export function verifyLedgerStopOk() {
  return {};
}

export function verifyLedgerStopFollowup(message = VERIFY_LEDGER_STOP_FOLLOWUP_MESSAGE) {
  return { followup_message: message };
}

/**
 * Dirty working tree: any porcelain status line.
 */
export function gitWorktreeIsDirty(root) {
  const result = spawnSync(
    "git",
    ["-C", root, "status", "--porcelain"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  if (result.status !== 0) {
    return false;
  }
  return result.stdout.trim().length > 0;
}

/**
 * Ahead of upstream: `rev-list --count @{u}..HEAD` > 0 when upstream exists;
 * otherwise `git status -sb` shows `[ahead …]`. Missing upstream without an
 * ahead marker is not treated as ahead (clean local-only branch → ok).
 */
export function gitIsAheadOfUpstream(root) {
  const counted = spawnSync(
    "git",
    ["-C", root, "rev-list", "--count", "@{u}..HEAD"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  if (counted.status === 0) {
    const n = Number.parseInt(counted.stdout.trim(), 10);
    return Number.isFinite(n) && n > 0;
  }

  const short = spawnSync(
    "git",
    ["-C", root, "status", "-sb"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  if (short.status !== 0) {
    return false;
  }
  return /\[ahead\b/u.test(short.stdout);
}

/**
 * True when local state needs a valid verify ledger before push (dirty or ahead).
 */
export function gitNeedsVerifyBeforePush(root) {
  return gitWorktreeIsDirty(root) || gitIsAheadOfUpstream(root);
}

/**
 * @param {object} payload — Cursor stop-hook stdin JSON
 * @returns {{}} | {{ followup_message: string }}
 */
export function verifyLedgerHandleStop(payload) {
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return verifyLedgerStopOk();
  }

  if (payload.status !== "completed") {
    return verifyLedgerStopOk();
  }

  if (verifyPrGateDisabled()) {
    return verifyLedgerStopOk();
  }

  const root = verifyLedgerProjectRoot(payload);
  if (!gitNeedsVerifyBeforePush(root)) {
    return verifyLedgerStopOk();
  }

  const valid = verifyLedgerIsValidForHead(root);
  if (valid.ok) {
    return verifyLedgerStopOk();
  }

  return verifyLedgerStopFollowup();
}

/**
 * beforeReadFile — thin entry (failClosed): research gate + count read once.
 * Always emits {permission:...}; always exits 0.
 * On catch: deny (mirror before-shell-execution), never allow.
 */
import {
  dispatchGateDeny,
  dispatchGateHandleBeforeRead,
  dispatchGateParsePayload,
  dispatchGateReadStdin,
} from "./lib/dispatch-gate-lib.mjs";

function denyInvalid(reason = "invalid-hook-input") {
  return dispatchGateDeny(
    `dispatch-gate: denied (${reason}). Fix the hook payload/config or set DISPATCH_GATE_DISABLED=1.`,
    `dispatch-gate denied: ${reason}`,
  );
}

async function main() {
  try {
    const payload = dispatchGateParsePayload(await dispatchGateReadStdin());
    const result = dispatchGateHandleBeforeRead(payload);
    process.stdout.write(
      `${JSON.stringify(result?.permission ? result : denyInvalid("missing-permission"))}\n`,
    );
  } catch {
    process.stdout.write(`${JSON.stringify(denyInvalid())}\n`);
  }
}

await main();

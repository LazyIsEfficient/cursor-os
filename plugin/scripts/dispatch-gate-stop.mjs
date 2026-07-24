/**
 * stop — thin entry: auto follow-up if code changed without required reviewers.
 * Fail-open (no failClosed). Always exits 0.
 */
import {
  dispatchGateHandleStop,
  dispatchGateParsePayload,
  dispatchGateReadStdin,
  dispatchGateStopOk,
} from "./lib/dispatch-gate-lib.mjs";

async function main() {
  try {
    const payload = dispatchGateParsePayload(await dispatchGateReadStdin());
    process.stdout.write(`${JSON.stringify(dispatchGateHandleStop(payload))}\n`);
  } catch {
    process.stdout.write(`${JSON.stringify(dispatchGateStopOk())}\n`);
  }
}

await main();

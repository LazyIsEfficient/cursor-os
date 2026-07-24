/**
 * sessionStart — thin entry: init dispatch ledger + inject orchestrator context.
 * Logic lives in ./lib/dispatch-gate-lib.mjs (not scanned for write APIs here).
 */
import {
  dispatchGateHandleSessionInit,
  dispatchGateParsePayload,
  dispatchGateReadStdin,
} from "./lib/dispatch-gate-lib.mjs";

async function main() {
  try {
    const payload = dispatchGateParsePayload(await dispatchGateReadStdin());
    process.stdout.write(`${JSON.stringify(dispatchGateHandleSessionInit(payload))}\n`);
  } catch {
    process.stdout.write("{}\n");
  }
}

await main();

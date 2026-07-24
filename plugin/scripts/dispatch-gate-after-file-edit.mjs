/**
 * afterFileEdit — thin entry: record ungated main-thread code edits.
 */
import {
  dispatchGateHandleAfterFileEdit,
  dispatchGateParsePayload,
  dispatchGateReadStdin,
} from "./lib/dispatch-gate-lib.mjs";

async function main() {
  try {
    const payload = dispatchGateParsePayload(await dispatchGateReadStdin());
    process.stdout.write(`${JSON.stringify(dispatchGateHandleAfterFileEdit(payload))}\n`);
  } catch {
    process.stdout.write("{}\n");
  }
}

await main();

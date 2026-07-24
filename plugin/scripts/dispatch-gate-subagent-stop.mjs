/**
 * subagentStop — thin entry: mark impl/reviewer/documenter Tasks completed.
 */
import {
  dispatchGateHandleSubagentStop,
  dispatchGateParsePayload,
  dispatchGateReadStdin,
} from "./lib/dispatch-gate-lib.mjs";

async function main() {
  try {
    const payload = dispatchGateParsePayload(await dispatchGateReadStdin());
    process.stdout.write(`${JSON.stringify(dispatchGateHandleSubagentStop(payload))}\n`);
  } catch {
    process.stdout.write("{}\n");
  }
}

await main();

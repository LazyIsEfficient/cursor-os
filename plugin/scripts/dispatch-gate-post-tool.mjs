/**
 * postToolUse — thin entry: track research / Task / write tools.
 */
import {
  dispatchGateHandlePostTool,
  dispatchGateParsePayload,
  dispatchGateReadStdin,
} from "./lib/dispatch-gate-lib.mjs";

async function main() {
  try {
    const payload = dispatchGateParsePayload(await dispatchGateReadStdin());
    process.stdout.write(`${JSON.stringify(dispatchGateHandlePostTool(payload))}\n`);
  } catch {
    process.stdout.write("{}\n");
  }
}

await main();

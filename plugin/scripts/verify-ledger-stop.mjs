/**
 * stop — thin entry: follow-up when dirty/ahead without a valid verify ledger.
 * Fail-open (no failClosed). Always exits 0.
 */
import {
  verifyLedgerHandleStop,
  verifyLedgerStopOk,
} from "./lib/verify-ledger-stop-lib.mjs";

const MAX_INPUT_BYTES = 1024 * 1024;

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
    process.stdout.write(`${JSON.stringify(verifyLedgerHandleStop(payload))}\n`);
  } catch {
    process.stdout.write(`${JSON.stringify(verifyLedgerStopOk())}\n`);
  }
}

await main();

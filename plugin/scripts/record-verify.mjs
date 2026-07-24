#!/usr/bin/env node
/**
 * record-verify.mjs — append verification command results to `.cursor/verify-ledger.json`.
 *
 * Usage:
 *   node plugin/scripts/record-verify.mjs --cmd 'npm test' --exit 0
 *   node plugin/scripts/record-verify.mjs --run -- npm test
 *   npm run verify:record -- --run -- node scripts/validate.mjs
 */

import { spawnSync } from "node:child_process";
import {
  verifyLedgerAppendCommand,
  verifyLedgerIsValidForHead,
  verifyLedgerPath,
  verifyLedgerProjectRoot,
} from "./lib/verify-ledger-lib.mjs";

function printUsage() {
  process.stderr.write(
    "usage:\n" +
      "  node plugin/scripts/record-verify.mjs --cmd '<command>' --exit <N>\n" +
      "  node plugin/scripts/record-verify.mjs --run -- <command...>\n" +
      "  npm run verify:record -- --run -- <command...>\n",
  );
}

function parseArgs(argv) {
  let cmd = null;
  let exitCode = null;
  let run = false;
  let conversationId = "";
  const runArgs = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }
    if (arg === "--run") {
      run = true;
      continue;
    }
    if (arg === "--") {
      runArgs.push(...argv.slice(index + 1));
      break;
    }
    if (arg === "--cmd") {
      cmd = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--cmd=")) {
      cmd = arg.slice("--cmd=".length);
      continue;
    }
    if (arg === "--exit") {
      exitCode = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith("--exit=")) {
      exitCode = Number(arg.slice("--exit=".length));
      continue;
    }
    if (arg === "--conversation-id") {
      conversationId = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg.startsWith("--conversation-id=")) {
      conversationId = arg.slice("--conversation-id=".length);
      continue;
    }
    if (run) {
      runArgs.push(arg);
      continue;
    }
    return { error: `unknown argument: ${arg}` };
  }

  return { cmd, exitCode, run, runArgs, conversationId };
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printUsage();
    process.exit(0);
  }
  if (parsed.error) {
    process.stderr.write(`${parsed.error}\n`);
    printUsage();
    process.exit(2);
  }

  const root = verifyLedgerProjectRoot({});
  let cmd = parsed.cmd;
  let exitCode = parsed.exitCode;

  if (parsed.run) {
    if (parsed.runArgs.length === 0) {
      process.stderr.write("--run requires a command after --\n");
      printUsage();
      process.exit(2);
    }
    cmd = parsed.runArgs
      .map((part) => (/\s/u.test(part) ? JSON.stringify(part) : part))
      .join(" ");
    const result = spawnSync(parsed.runArgs[0], parsed.runArgs.slice(1), {
      cwd: root,
      stdio: "inherit",
      env: process.env,
      shell: false,
    });
    if (result.error) {
      process.stderr.write(`${result.error.message}\n`);
      exitCode = 127;
    } else {
      exitCode = typeof result.status === "number" ? result.status : 1;
    }
  } else {
    if (typeof cmd !== "string" || cmd.length === 0) {
      process.stderr.write("--cmd is required unless --run is used\n");
      printUsage();
      process.exit(2);
    }
    if (typeof exitCode !== "number" || !Number.isInteger(exitCode)) {
      process.stderr.write("--exit <integer> is required with --cmd\n");
      printUsage();
      process.exit(2);
    }
  }

  const ledger = verifyLedgerAppendCommand(root, {
    cmd,
    exitCode,
    conversationId: parsed.conversationId,
  });

  const path = verifyLedgerPath(root);
  const validity = verifyLedgerIsValidForHead(root);
  process.stdout.write(
    JSON.stringify(
      {
        path,
        impl_verified: ledger.impl_verified,
        head_sha: ledger.head_sha,
        commands: ledger.commands.length,
        valid_for_pr: validity.ok === true,
        last_exit_code: exitCode,
      },
      null,
      2,
    ) + "\n",
  );

  // When --run, propagate the command's exit code so CI/scripts can chain.
  if (parsed.run) {
    process.exit(exitCode === 0 ? 0 : exitCode);
  }
}

main();

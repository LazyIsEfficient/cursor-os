#!/usr/bin/env node
/**
 * record-verify.mjs — spawn a verification command and append the result to
 * `.cursor/verify-ledger.json` (version 2 + stack profile).
 *
 * Usage:
 *   node plugin/scripts/record-verify.mjs --profile node-harness --run -- npm test
 *   npm run verify:record -- --profile node-harness --run -- node scripts/validate.mjs
 *
 * `--cmd` / `--exit` fake recording is removed — only `--run` (spawn) is allowed.
 */

import { spawnSync } from "node:child_process";
import {
  VERIFY_LEDGER_VERSION,
  readHeadSha,
  verifyCommandIsTrivial,
  verifyLedgerAppendCommand,
  verifyLedgerIsValidForHead,
  verifyLedgerLoad,
  verifyLedgerPath,
  verifyLedgerProfileIsKnown,
  verifyLedgerProjectRoot,
} from "./lib/verify-ledger-lib.mjs";

function printUsage() {
  process.stderr.write(
    "usage:\n" +
      "  node plugin/scripts/record-verify.mjs --profile <node-harness|rust|custom> --run -- <command...>\n" +
      "  npm run verify:record -- --profile <node-harness|rust|custom> --run -- <command...>\n" +
      "\n" +
      "Notes:\n" +
      "  --profile is required on first write for a HEAD (omit only when ledger already has matching profile).\n" +
      "  --cmd / --exit are removed; only --run (spawn) records spawned:true.\n",
  );
}

function parseArgs(argv) {
  let run = false;
  let profile = undefined;
  let conversationId = "";
  const runArgs = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }
    if (
      arg === "--cmd" ||
      arg.startsWith("--cmd=") ||
      arg === "--exit" ||
      arg.startsWith("--exit=")
    ) {
      return {
        error:
          "--cmd/--exit removed; use --profile <…> --run -- <command...>",
      };
    }
    if (arg === "--run") {
      run = true;
      continue;
    }
    if (arg === "--") {
      runArgs.push(...argv.slice(index + 1));
      break;
    }
    if (arg === "--profile") {
      profile = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--profile=")) {
      profile = arg.slice("--profile=".length);
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

  return { run, runArgs, profile, conversationId };
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

  if (!parsed.run) {
    process.stderr.write("--run -- <command...> is required\n");
    printUsage();
    process.exit(2);
  }
  if (parsed.runArgs.length === 0) {
    process.stderr.write("--run requires a command after --\n");
    printUsage();
    process.exit(2);
  }

  if (
    parsed.profile !== undefined &&
    parsed.profile !== "" &&
    !verifyLedgerProfileIsKnown(parsed.profile)
  ) {
    process.stderr.write(
      "--profile must be node-harness, rust, or custom\n",
    );
    printUsage();
    process.exit(2);
  }

  const root = verifyLedgerProjectRoot({});
  const cmd = parsed.runArgs
    .map((part) => (/\s/u.test(part) ? JSON.stringify(part) : part))
    .join(" ");

  if (verifyCommandIsTrivial(cmd)) {
    process.stderr.write(`trivial command rejected: ${cmd}\n`);
    process.exit(2);
  }

  const headSha = readHeadSha(root);
  if (!headSha) {
    process.stderr.write("verify-ledger: cannot resolve git HEAD\n");
    process.exit(2);
  }
  const existing = verifyLedgerLoad(root);
  const needsFresh =
    !existing ||
    existing.version !== VERIFY_LEDGER_VERSION ||
    existing.head_sha !== headSha;
  if (needsFresh && !verifyLedgerProfileIsKnown(parsed.profile)) {
    process.stderr.write(
      "verify-ledger: --profile <node-harness|rust|custom> required on first write for this HEAD\n",
    );
    printUsage();
    process.exit(2);
  }
  if (
    !needsFresh &&
    verifyLedgerProfileIsKnown(existing.profile) &&
    parsed.profile !== undefined &&
    parsed.profile !== "" &&
    parsed.profile !== existing.profile
  ) {
    process.stderr.write(
      `verify-ledger: profile mismatch (ledger has ${existing.profile})\n`,
    );
    process.exit(2);
  }

  const result = spawnSync(parsed.runArgs[0], parsed.runArgs.slice(1), {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  let exitCode;
  if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
    exitCode = 127;
  } else {
    exitCode = typeof result.status === "number" ? result.status : 1;
  }

  let ledger;
  try {
    ledger = verifyLedgerAppendCommand(root, {
      cmd,
      exitCode,
      conversationId: parsed.conversationId,
      profile: parsed.profile,
      spawned: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    printUsage();
    process.exit(2);
  }

  const path = verifyLedgerPath(root);
  const validity = verifyLedgerIsValidForHead(root);
  process.stdout.write(
    JSON.stringify(
      {
        path,
        profile: ledger.profile,
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

  process.exit(exitCode === 0 ? 0 : exitCode);
}

main();

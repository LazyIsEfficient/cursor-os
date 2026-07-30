#!/usr/bin/env node
/**
 * ci-parity.mjs — scan consumer CI (workflows / justfile / Makefile) and print
 * verify:record recipe lines. Optionally write `.cursor/verify-profile.json`.
 *
 * Usage:
 *   node plugin/scripts/ci-parity.mjs [--write] [--root <path>]
 *   npm run verify:ci-parity -- [--write] [--root <path>]
 *
 * Exit: 0 success; 1 no check commands; 2 usage error.
 */

import { resolve } from "node:path";
import {
  scanCiParity,
  writeVerifyProfile,
} from "./lib/ci-parity-lib.mjs";

function printUsage() {
  process.stderr.write(
    "usage:\n" +
      "  node plugin/scripts/ci-parity.mjs [--write] [--root <path>]\n" +
      "  npm run verify:ci-parity -- [--write] [--root <path>]\n" +
      "\n" +
      "Default: print verify:record recipe to stdout.\n" +
      "--write: also write .cursor/verify-profile.json\n" +
      "Exit 1 if no check commands found; exit 2 on usage error.\n",
  );
}

function parseArgs(argv) {
  let write = false;
  let root = process.cwd();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }
    if (arg === "--write") {
      write = true;
      continue;
    }
    if (arg === "--root") {
      const value = argv[index + 1];
      if (typeof value !== "string" || value.length === 0) {
        return { error: "--root requires a path" };
      }
      root = resolve(value);
      index += 1;
      continue;
    }
    if (arg.startsWith("--root=")) {
      const value = arg.slice("--root=".length);
      if (value.length === 0) {
        return { error: "--root requires a path" };
      }
      root = resolve(value);
      continue;
    }
    return { error: `unknown argument: ${arg}` };
  }
  return { write, root };
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printUsage();
    process.exit(0);
  }
  if (parsed.error) {
    process.stderr.write(`error: ${parsed.error}\n`);
    printUsage();
    process.exit(2);
  }

  const { write, root } = parsed;
  const { commands, profile, recipe, sources } = scanCiParity(root);

  if (commands.length === 0) {
    process.stderr.write(
      `ci-parity: no check commands found under ${root}` +
        (sources.length === 0
          ? " (no workflows/justfile/Makefile)\n"
          : ` (scanned ${sources.length} source(s))\n`),
    );
    process.exit(1);
  }

  process.stdout.write(`# profile: ${profile}\n`);
  process.stdout.write(`${recipe}\n`);

  if (write) {
    const written = writeVerifyProfile(root, {
      commands,
      source: "ci-parity",
    });
    process.stderr.write(
      `ci-parity: wrote .cursor/verify-profile.json (${written.commands.length} command(s), profile=${profile})\n`,
    );
  }

  process.exit(0);
}

main();

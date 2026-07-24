import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { verifyLedgerPath } from "../../scripts/lib/verify-ledger-lib.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = resolve(repositoryRoot, "plugin/scripts/record-verify.mjs");

function runRecord(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

function ledgerSnapshot() {
  const path = verifyLedgerPath(repositoryRoot);
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path, "utf8");
}

test("rejects empty or non-integer --exit values", () => {
  const before = ledgerSnapshot();

  for (const args of [
    ["--cmd", "npm test", "--exit="],
    ["--cmd", "npm test", "--exit", ""],
    ["--cmd", "npm test", "--exit", "1.5"],
    ["--cmd", "npm test", "--exit", "abc"],
    ["--cmd", "npm test", "--exit"],
  ]) {
    const result = runRecord(args);
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /--exit <integer>/u, args.join(" "));
  }

  assert.equal(ledgerSnapshot(), before);
});

test("accepts integer --exit including zero and nonzero", () => {
  const path = verifyLedgerPath(repositoryRoot);
  const before = ledgerSnapshot();
  try {
    rmSync(path, { force: true });
  } catch {
    /* ignore */
  }

  try {
    const fail = runRecord(["--cmd", "false", "--exit", "1"]);
    assert.equal(fail.status, 0);
    const afterFail = JSON.parse(fail.stdout);
    assert.equal(afterFail.last_exit_code, 1);
    assert.equal(afterFail.impl_verified, false);
    assert.equal(afterFail.valid_for_pr, false);

    const ok = runRecord(["--cmd", "true", "--exit=0"]);
    assert.equal(ok.status, 0);
    const afterOk = JSON.parse(ok.stdout);
    assert.equal(afterOk.last_exit_code, 0);
  } finally {
    // Restore prior ledger so local PR workflows are not disrupted.
    if (before === null) {
      rmSync(path, { force: true });
    } else {
      writeFileSync(path, before);
    }
  }
});

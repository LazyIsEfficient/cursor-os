import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  verifyCommandIsTrivial,
  verifyLedgerPath,
  verifyLedgerProfileCoverage,
  verifyLedgerValidateForHead,
  VERIFY_LEDGER_VERSION,
} from "../../scripts/lib/verify-ledger-lib.mjs";

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

function withRestoredLedger(fn) {
  const path = verifyLedgerPath(repositoryRoot);
  const before = ledgerSnapshot();
  try {
    rmSync(path, { force: true });
  } catch {
    /* ignore */
  }
  try {
    return fn(path);
  } finally {
    if (before === null) {
      rmSync(path, { force: true });
    } else {
      writeFileSync(path, before);
    }
  }
}

test("rejects --cmd/--exit fake recording path", () => {
  const before = ledgerSnapshot();
  for (const args of [
    ["--cmd", "npm test", "--exit", "0"],
    ["--cmd=npm test", "--exit=0"],
    ["--exit", "0", "--cmd", "npm test"],
  ]) {
    const result = runRecord(args);
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /--cmd\/--exit removed/u, args.join(" "));
  }
  assert.equal(ledgerSnapshot(), before);
});

test("requires --run -- <command...>", () => {
  const before = ledgerSnapshot();
  const missingRun = runRecord(["--profile", "node-harness"]);
  assert.equal(missingRun.status, 2);
  assert.match(missingRun.stderr, /--run/u);

  const emptyRun = runRecord(["--profile", "node-harness", "--run", "--"]);
  assert.equal(emptyRun.status, 2);
  assert.match(emptyRun.stderr, /--run requires a command/u);
  assert.equal(ledgerSnapshot(), before);
});

test("rejects trivial commands before spawn", () => {
  withRestoredLedger(() => {
    for (const trivial of ["true", "false", ":", "echo hi", "printf x", "exit", "exit 0", "ab"]) {
      const result = runRecord([
        "--profile",
        "custom",
        "--run",
        "--",
        ...trivial.split(" "),
      ]);
      assert.equal(result.status, 2, trivial);
      assert.match(result.stderr, /trivial command rejected/u, trivial);
    }
  });
});

test("requires --profile on first write for HEAD", () => {
  withRestoredLedger(() => {
    const result = runRecord(["--run", "--", "node", "--version"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /--profile/u);
  });
});

test("records spawned commands and sets impl_verified for node-harness coverage", () => {
  withRestoredLedger((path) => {
    const first = runRecord([
      "--profile",
      "node-harness",
      "--run",
      "--",
      "node",
      "-e",
      "process.exit(0)",
    ]);
    assert.equal(first.status, 0, first.stderr);
    const afterFirst = JSON.parse(first.stdout);
    assert.equal(afterFirst.profile, "node-harness");
    assert.equal(afterFirst.impl_verified, false);
    assert.equal(afterFirst.valid_for_pr, false);

    const ledger1 = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(ledger1.version, VERIFY_LEDGER_VERSION);
    assert.equal(ledger1.profile, "node-harness");
    assert.equal(ledger1.commands[0].spawned, true);
    assert.equal(ledger1.commands[0].cmd, 'node -e process.exit(0)');

    // Second append may omit profile when it already matches.
    const second = runRecord(["--run", "--", "node", "-e", "process.exit(0)"]);
    assert.equal(second.status, 0, second.stderr);
    const ledger2 = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(ledger2.commands.length, 2);
    assert.equal(ledger2.impl_verified, false);

    // Mismatched profile is rejected.
    const mismatch = runRecord([
      "--profile",
      "rust",
      "--run",
      "--",
      "node",
      "-e",
      "process.exit(0)",
    ]);
    assert.equal(mismatch.status, 2);
    assert.match(mismatch.stderr, /profile mismatch/u);
  });
});

test("verifyCommandIsTrivial detects weak commands", () => {
  assert.equal(verifyCommandIsTrivial(""), true);
  assert.equal(verifyCommandIsTrivial("  "), true);
  assert.equal(verifyCommandIsTrivial("ab"), true);
  assert.equal(verifyCommandIsTrivial("true"), true);
  assert.equal(verifyCommandIsTrivial("false"), true);
  assert.equal(verifyCommandIsTrivial("/bin/true"), true);
  assert.equal(verifyCommandIsTrivial("/bin/false"), true);
  assert.equal(verifyCommandIsTrivial("true x"), true);
  assert.equal(verifyCommandIsTrivial("env true"), true);
  assert.equal(verifyCommandIsTrivial(":"), true);
  assert.equal(verifyCommandIsTrivial("echo"), true);
  assert.equal(verifyCommandIsTrivial("echo hello"), true);
  assert.equal(verifyCommandIsTrivial("/bin/echo hi"), true);
  assert.equal(verifyCommandIsTrivial("printf %s x"), true);
  assert.equal(verifyCommandIsTrivial("exit"), true);
  assert.equal(verifyCommandIsTrivial("exit 0"), true);
  assert.equal(verifyCommandIsTrivial("npm test"), false);
  assert.equal(verifyCommandIsTrivial("node scripts/validate.mjs"), false);
  assert.equal(verifyCommandIsTrivial("cargo fmt --check"), false);
});

test("custom profile rejects path-prefixed true/false no-ops", () => {
  const at = new Date().toISOString();
  const spawned = (cmd) => ({ cmd, exit_code: 0, at, spawned: true });
  assert.equal(
    verifyLedgerProfileCoverage("custom", [
      spawned("/bin/true"),
      spawned("/bin/true"),
    ]),
    false,
  );
  assert.equal(
    verifyLedgerValidateForHead(
      {
        version: 2,
        profile: "custom",
        conversation_id: "",
        impl_verified: true,
        verified_at: at,
        head_sha: "abc123",
        commands: [spawned("/bin/true"), spawned("/usr/bin/false")],
      },
      "abc123",
    ).ok,
    false,
  );
});

test("verifyLedgerProfileCoverage matches profile requirements", () => {
  const at = new Date().toISOString();
  const spawned = (cmd) => ({ cmd, exit_code: 0, at, spawned: true });

  assert.equal(
    verifyLedgerProfileCoverage("node-harness", [
      spawned("npm run validate"),
      spawned("npm test"),
    ]),
    true,
  );
  assert.equal(
    verifyLedgerProfileCoverage("node-harness", [
      spawned("node scripts/validate.mjs"),
      spawned("npm run test"),
    ]),
    true,
  );
  assert.equal(
    verifyLedgerProfileCoverage("node-harness", [spawned("npm test")]),
    false,
  );
  // Substring embedding in node -e must not satisfy coverage.
  assert.equal(
    verifyLedgerProfileCoverage("node-harness", [
      spawned(`node -e "console.log('npm run validate')"`),
      spawned(`node -e "console.log('npm test')"`),
    ]),
    false,
  );
  assert.equal(
    verifyLedgerProfileCoverage("node-harness", [
      spawned("npm run validate-foo"),
      spawned("npm test"),
    ]),
    false,
  );

  assert.equal(
    verifyLedgerProfileCoverage("rust", [
      spawned("cargo fmt --check"),
      spawned("cargo clippy --all-targets"),
      spawned("cargo test"),
    ]),
    true,
  );
  assert.equal(
    verifyLedgerProfileCoverage("rust", [
      spawned("cargo fmt --all --check"),
      spawned("cargo clippy"),
      spawned("cargo nextest run"),
    ]),
    true,
  );
  assert.equal(
    verifyLedgerProfileCoverage("rust", [
      spawned("cargo fmt"),
      spawned("cargo clippy"),
      spawned("cargo test"),
    ]),
    false,
  );

  assert.equal(
    verifyLedgerProfileCoverage("custom", [
      spawned("npm test"),
      spawned("node scripts/validate.mjs"),
    ]),
    true,
  );
  assert.equal(
    verifyLedgerProfileCoverage("custom", [spawned("npm test")]),
    false,
  );
});

test("verifyLedgerValidateForHead rejects v1 and unspawned commands", () => {
  const head = "abc123";
  const at = new Date().toISOString();

  assert.equal(
    verifyLedgerValidateForHead(
      {
        version: 1,
        conversation_id: "",
        impl_verified: true,
        verified_at: at,
        head_sha: head,
        commands: [{ cmd: "npm test", exit_code: 0, at }],
      },
      head,
    ).reason,
    "bad-version",
  );

  assert.equal(
    verifyLedgerValidateForHead(
      {
        version: 2,
        profile: "node-harness",
        conversation_id: "",
        impl_verified: true,
        verified_at: at,
        head_sha: head,
        commands: [
          { cmd: "npm test", exit_code: 0, at },
          { cmd: "node scripts/validate.mjs", exit_code: 0, at, spawned: true },
        ],
      },
      head,
    ).reason,
    "unspawned-command",
  );

  assert.equal(
    verifyLedgerValidateForHead(
      {
        version: 2,
        profile: "node-harness",
        conversation_id: "",
        impl_verified: true,
        verified_at: at,
        head_sha: head,
        commands: [
          { cmd: "npm test", exit_code: 0, at, spawned: true },
          {
            cmd: "node scripts/validate.mjs",
            exit_code: 0,
            at,
            spawned: true,
          },
        ],
      },
      head,
    ).ok,
    true,
  );
});

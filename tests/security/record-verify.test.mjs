import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  verifyCommandIsTrivial,
  verifyLedgerAppendCommand,
  verifyLedgerIsValidForHead,
  verifyLedgerLoad,
  verifyLedgerLock,
  verifyLedgerLockPath,
  verifyLedgerPath,
  verifyLedgerProfileCoverage,
  verifyLedgerUnlock,
  verifyLedgerValidateForHead,
  VERIFY_LEDGER_VERSION,
} from "../../scripts/lib/verify-ledger-lib.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = resolve(repositoryRoot, "plugin/scripts/record-verify.mjs");

function runRecord(args, { cwd = repositoryRoot, env } = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    encoding: "utf8",
    // Blank CURSOR_PROJECT_DIR so verifyLedgerProjectRoot({}) honors cwd
    // (mirrors tests/security/context-hooks.test.mjs). Otherwise an ambient
    // CURSOR_PROJECT_DIR would redirect appends to the real repo ledger and
    // reintroduce the cross-file race this helper isolates.
    env: { ...process.env, CURSOR_PROJECT_DIR: "", ...env },
  });
}

function ledgerSnapshot(root = repositoryRoot) {
  const path = verifyLedgerPath(root);
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path, "utf8");
}

// Tests that append to the real ledger use their own throwaway git repo
// instead of repositoryRoot: appending at the real path races with
// tests/security/before-shell-execution.test.mjs, which reads/writes the same
// file concurrently under node:test's default cross-file parallelism
// (observed as intermittent CI failures).
function withTempProjectRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), "record-verify-test-"));
  try {
    const init = spawnSync("git", ["init", "-q"], { cwd: root });
    assert.equal(init.status, 0);
    spawnSync("git", ["-C", root, "config", "user.email", "test@example.com"]);
    spawnSync("git", ["-C", root, "config", "user.name", "Test"]);
    const commit = spawnSync("git", [
      "-C",
      root,
      "commit",
      "-q",
      "-m",
      "init",
      "--allow-empty",
    ]);
    assert.equal(commit.status, 0);
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("rejects --cmd/--exit fake recording path", () => {
  withTempProjectRoot((root) => {
    const before = ledgerSnapshot(root);
    for (const args of [
      ["--cmd", "npm test", "--exit", "0"],
      ["--cmd=npm test", "--exit=0"],
      ["--exit", "0", "--cmd", "npm test"],
    ]) {
      const result = runRecord(args, { cwd: root });
      assert.equal(result.status, 2, args.join(" "));
      assert.match(result.stderr, /--cmd\/--exit removed/u, args.join(" "));
    }
    assert.equal(ledgerSnapshot(root), before);
  });
});

test("requires --run -- <command...>", () => {
  withTempProjectRoot((root) => {
    const before = ledgerSnapshot(root);
    const missingRun = runRecord(["--profile", "node-harness"], { cwd: root });
    assert.equal(missingRun.status, 2);
    assert.match(missingRun.stderr, /--run/u);

    const emptyRun = runRecord(["--profile", "node-harness", "--run", "--"], {
      cwd: root,
    });
    assert.equal(emptyRun.status, 2);
    assert.match(emptyRun.stderr, /--run requires a command/u);
    assert.equal(ledgerSnapshot(root), before);
  });
});

test("rejects trivial commands before spawn", () => {
  withTempProjectRoot((root) => {
    for (const trivial of ["true", "false", ":", "echo hi", "printf x", "exit", "exit 0", "ab"]) {
      const result = runRecord(
        ["--profile", "custom", "--run", "--", ...trivial.split(" ")],
        { cwd: root },
      );
      assert.equal(result.status, 2, trivial);
      assert.match(result.stderr, /trivial command rejected/u, trivial);
    }
  });
});

test("requires --profile on first write for HEAD", () => {
  withTempProjectRoot((root) => {
    const result = runRecord(["--run", "--", "node", "-e", "process.exit(0)"], {
      cwd: root,
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /--profile/u);
  });
});

test("records spawned commands and sets impl_verified for node-harness coverage", () => {
  withTempProjectRoot((root) => {
    const path = verifyLedgerPath(root);
    const first = runRecord(
      ["--profile", "node-harness", "--run", "--", "node", "-e", "process.exit(0)"],
      { cwd: root },
    );
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

    // Second append may omit profile when it already matches. A distinct cmd
    // appends; an identical cmd would supersede (tested separately below).
    const second = runRecord(["--run", "--", "node", "-e", "console.log(1)"], {
      cwd: root,
    });
    assert.equal(second.status, 0, second.stderr);
    const ledger2 = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(ledger2.commands.length, 2);
    assert.equal(ledger2.impl_verified, false);

    // Mismatched profile is rejected.
    const mismatch = runRecord(
      ["--profile", "rust", "--run", "--", "node", "-e", "process.exit(0)"],
      { cwd: root },
    );
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
  assert.equal(verifyCommandIsTrivial("busybox true"), true);
  assert.equal(verifyCommandIsTrivial("nice true"), true);
  assert.equal(verifyCommandIsTrivial("sh -c true"), true);
  assert.equal(verifyCommandIsTrivial("bash -c true"), true);
  assert.equal(verifyCommandIsTrivial("bash -c ':'"), true);
  assert.equal(verifyCommandIsTrivial('bash -c ":"'), true);
  assert.equal(verifyCommandIsTrivial("bash -c :"), true);
  assert.equal(verifyCommandIsTrivial("pwd"), true);
  assert.equal(verifyCommandIsTrivial("date"), true);
  assert.equal(verifyCommandIsTrivial("whoami"), true);
  assert.equal(verifyCommandIsTrivial("node --version"), true);
  assert.equal(verifyCommandIsTrivial("git status"), true);
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
  assert.equal(verifyCommandIsTrivial("bash -c 'npm test'"), false);
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

test("custom profile rejects inert spawned commands (pwd/date bypass)", () => {
  const at = new Date().toISOString();
  const spawned = (cmd) => ({ cmd, exit_code: 0, at, spawned: true });
  // Tier 1 finding: ≥2 non-trivial alone was gameable with pwd + date.
  assert.equal(
    verifyLedgerProfileCoverage("custom", [spawned("pwd"), spawned("date")]),
    false,
  );
  assert.equal(
    verifyLedgerProfileCoverage("custom", [
      spawned("whoami"),
      spawned("uname"),
    ]),
    false,
  );
  assert.equal(
    verifyLedgerProfileCoverage("custom", [
      spawned("nice true"),
      spawned("timeout 1 true"),
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
        commands: [spawned("pwd"), spawned("date")],
      },
      "abc123",
    ).ok,
    false,
  );
  // Verification-shaped pair still satisfies custom.
  assert.equal(
    verifyLedgerProfileCoverage("custom", [
      spawned("make test"),
      spawned("pytest"),
    ]),
    true,
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
    verifyLedgerProfileCoverage("node-harness", [
      spawned("node ./scripts/validate.mjs"),
      spawned("npm test"),
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
  // Help / usage flags must not satisfy coverage (Tier 1).
  assert.equal(
    verifyLedgerProfileCoverage("node-harness", [
      spawned("npm run validate --help"),
      spawned("npm test --help"),
    ]),
    false,
  );
  assert.equal(
    verifyLedgerProfileCoverage("node-harness", [
      spawned("npm run validate -h"),
      spawned("npm test"),
    ]),
    false,
  );
  assert.equal(
    verifyLedgerProfileCoverage("node-harness", [
      spawned("npm run validate"),
      spawned("npm test -h"),
    ]),
    false,
  );
  // Absolute paths ending in scripts/validate.mjs must not count.
  assert.equal(
    verifyLedgerProfileCoverage("node-harness", [
      spawned("node /tmp/x/scripts/validate.mjs"),
      spawned("npm test"),
    ]),
    false,
  );
  assert.equal(
    verifyLedgerProfileCoverage("node-harness", [
      spawned("node /Users/me/repo/scripts/validate.mjs"),
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
    verifyLedgerProfileCoverage("rust", [
      spawned("cargo fmt --check --help"),
      spawned("cargo clippy -h"),
      spawned("cargo test --help"),
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
  assert.equal(
    verifyLedgerProfileCoverage("custom", [
      spawned("busybox true"),
      spawned("sh -c true"),
    ]),
    false,
  );
  assert.equal(
    verifyLedgerProfileCoverage("custom", [
      spawned("bash -c ':'"),
      spawned("env true"),
    ]),
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

test("custom profile rejects inert go/cmake/make/ninja invocations (Tier 1)", () => {
  const at = new Date().toISOString();
  const spawned = (cmd) => ({ cmd, exit_code: 0, at, spawned: true });
  // Reproduced bypass: bare binaries with inert subcommands satisfied coverage.
  assert.equal(
    verifyLedgerProfileCoverage("custom", [
      spawned("go version"),
      spawned("go env"),
    ]),
    false,
  );
  assert.equal(
    verifyLedgerProfileCoverage("custom", [
      spawned("make"),
      spawned("ninja"),
    ]),
    false,
  );
  assert.equal(
    verifyLedgerProfileCoverage("custom", [
      spawned("make -j4"),
      spawned("make help"),
    ]),
    false,
  );
  assert.equal(
    verifyLedgerProfileCoverage("custom", [
      spawned("cmake -B build"),
      spawned("cmake --help"),
    ]),
    false,
  );
  assert.equal(
    verifyLedgerProfileCoverage("custom", [
      spawned("go help test"),
      spawned("ninja -t targets"),
    ]),
    false,
  );
  // Meaningful subcommands / explicit targets still count.
  assert.equal(
    verifyLedgerProfileCoverage("custom", [
      spawned("go test ./..."),
      spawned("go vet ./..."),
    ]),
    true,
  );
  assert.equal(
    verifyLedgerProfileCoverage("custom", [
      spawned("go build ./..."),
      spawned("go test"),
    ]),
    true,
  );
  assert.equal(
    verifyLedgerProfileCoverage("custom", [
      spawned("make test"),
      spawned("ninja check"),
    ]),
    true,
  );
  assert.equal(
    verifyLedgerProfileCoverage("custom", [
      spawned("cmake --build build"),
      spawned("make -j4 check"),
    ]),
    true,
  );
});

test("stale verify-ledger lock is broken and re-acquired", () => {
  withTempProjectRoot((root) => {
    mkdirSync(join(root, ".cursor"), { recursive: true });
    const lock = verifyLedgerLockPath(root);
    mkdirSync(lock);
    const past = new Date(Date.now() - 60_000);
    utimesSync(lock, past, past);
    // Killed-hook leftover (mtime > 30s) must not permanently deny verifies.
    verifyLedgerLock(root);
    verifyLedgerUnlock(root);
  });
});

test("fresh verify-ledger lock is not broken (lock timeout)", () => {
  withTempProjectRoot((root) => {
    mkdirSync(join(root, ".cursor"), { recursive: true });
    mkdirSync(verifyLedgerLockPath(root));
    assert.throws(() => verifyLedgerLock(root), /lock timeout/u);
  });
});

test("re-record supersedes identical cmd — flaky failure cannot block HEAD", () => {
  withTempProjectRoot((root) => {
    verifyLedgerAppendCommand(root, {
      cmd: "npm run validate",
      exitCode: 0,
      profile: "node-harness",
      spawned: true,
    });
    verifyLedgerAppendCommand(root, {
      cmd: "npm test",
      exitCode: 1,
      spawned: true,
    });
    assert.equal(verifyLedgerIsValidForHead(root).ok, false);

    // Latest wins: re-run passes, superseding the failure entry in place.
    verifyLedgerAppendCommand(root, {
      cmd: "npm test",
      exitCode: 0,
      spawned: true,
    });
    const ledger = verifyLedgerLoad(root);
    assert.equal(
      ledger.commands.filter((entry) => entry.cmd === "npm test").length,
      1,
    );
    assert.equal(ledger.impl_verified, true);
    assert.equal(verifyLedgerIsValidForHead(root).ok, true);
  });
});

test("failing validate superseded by passing validate becomes valid", () => {
  withTempProjectRoot((root) => {
    verifyLedgerAppendCommand(root, {
      cmd: "npm test",
      exitCode: 0,
      profile: "node-harness",
      spawned: true,
    });
    verifyLedgerAppendCommand(root, {
      cmd: "npm run validate",
      exitCode: 1,
      spawned: true,
    });
    assert.equal(verifyLedgerIsValidForHead(root).ok, false);
    verifyLedgerAppendCommand(root, {
      cmd: "npm run validate",
      exitCode: 0,
      spawned: true,
    });
    assert.equal(verifyLedgerIsValidForHead(root).ok, true);
  });
});

test("failure with no superseding pass keeps HEAD invalid", () => {
  withTempProjectRoot((root) => {
    verifyLedgerAppendCommand(root, {
      cmd: "npm run validate",
      exitCode: 0,
      profile: "node-harness",
      spawned: true,
    });
    verifyLedgerAppendCommand(root, {
      cmd: "npm test",
      exitCode: 1,
      spawned: true,
    });
    const result = verifyLedgerIsValidForHead(root);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "impl-not-verified");
    // A different cmd does NOT supersede the failure.
    verifyLedgerAppendCommand(root, {
      cmd: "npm run test",
      exitCode: 0,
      spawned: true,
    });
    assert.equal(verifyLedgerIsValidForHead(root).ok, false);
  });
});

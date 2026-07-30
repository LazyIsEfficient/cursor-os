import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  VERIFY_PR_GATE_DISABLED_ENV,
  verifyLedgerPath,
} from "../../scripts/lib/verify-ledger-lib.mjs";
import {
  VERIFY_LEDGER_STOP_FOLLOWUP_MESSAGE,
  gitIsAheadOfUpstream,
  gitNeedsVerifyBeforePush,
  gitWorktreeIsDirty,
  verifyLedgerHandleStop,
} from "../../plugin/scripts/lib/verify-ledger-stop-lib.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = resolve(
  repositoryRoot,
  "plugin/scripts/verify-ledger-stop.mjs",
);

function runStopHook(payload, { cwd = repositoryRoot, env } = {}) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd,
    encoding: "utf8",
    env: env ? { ...process.env, ...env } : process.env,
    input: `${JSON.stringify(payload)}\n`,
    timeout: 5_000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
}

function gitHeadSha(root) {
  const result = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  return result.stdout.trim();
}

function writeValidVerifyLedger(root, headSha) {
  mkdirSync(join(root, ".cursor"), { recursive: true });
  const at = new Date().toISOString();
  writeFileSync(
    verifyLedgerPath(root),
    `${JSON.stringify(
      {
        version: 2,
        profile: "node-harness",
        conversation_id: "test",
        impl_verified: true,
        verified_at: at,
        head_sha: headSha,
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
      null,
      2,
    )}\n`,
  );
}

function withTempRepo(fn) {
  const root = mkdtempSync(join(tmpdir(), "verify-ledger-stop-test-"));
  try {
    assert.equal(spawnSync("git", ["init", "-q"], { cwd: root }).status, 0);
    spawnSync("git", ["-C", root, "config", "user.email", "test@example.com"]);
    spawnSync("git", ["-C", root, "config", "user.name", "Test"]);
    // Avoid "master"/"main" surprise; name the branch explicitly.
    spawnSync("git", ["-C", root, "checkout", "-q", "-b", "main"]);
    writeFileSync(join(root, ".gitkeep"), "");
    spawnSync("git", ["-C", root, "add", "-A"]);
    assert.equal(
      spawnSync("git", ["-C", root, "commit", "-q", "-m", "init"], {
        cwd: root,
      }).status,
      0,
    );
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Bare repo + clone so @{u} exists and we can create ahead state. */
function withUpstreamClone(fn) {
  const parent = mkdtempSync(join(tmpdir(), "verify-ledger-stop-up-"));
  const bare = join(parent, "bare.git");
  const clone = join(parent, "work");
  try {
    assert.equal(
      spawnSync("git", ["init", "--bare", "-q", bare]).status,
      0,
    );
    assert.equal(
      spawnSync("git", ["clone", "-q", bare, clone]).status,
      0,
    );
    spawnSync("git", ["-C", clone, "config", "user.email", "test@example.com"]);
    spawnSync("git", ["-C", clone, "config", "user.name", "Test"]);
    writeFileSync(join(clone, ".gitkeep"), "");
    spawnSync("git", ["-C", clone, "add", "-A"]);
    assert.equal(
      spawnSync("git", ["-C", clone, "commit", "-q", "-m", "init"]).status,
      0,
    );
    assert.equal(
      spawnSync("git", ["-C", clone, "push", "-q", "-u", "origin", "HEAD"]).status,
      0,
    );
    return fn(clone);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

test("non-completed status returns empty object", () => {
  assert.deepEqual(verifyLedgerHandleStop({ status: "aborted" }), {});
  assert.deepEqual(verifyLedgerHandleStop({ status: "error" }), {});
  assert.deepEqual(runStopHook({ status: "aborted" }), {});
});

test("VERIFY_PR_GATE_DISABLED=1 skips follow-up", () => {
  withTempRepo((root) => {
    writeFileSync(join(root, "dirty.txt"), "x");
    assert.equal(gitWorktreeIsDirty(root), true);
    const prev = process.env[VERIFY_PR_GATE_DISABLED_ENV];
    process.env[VERIFY_PR_GATE_DISABLED_ENV] = "1";
    try {
      assert.deepEqual(
        verifyLedgerHandleStop({ status: "completed", cwd: root }),
        {},
      );
    } finally {
      if (prev === undefined) {
        delete process.env[VERIFY_PR_GATE_DISABLED_ENV];
      } else {
        process.env[VERIFY_PR_GATE_DISABLED_ENV] = prev;
      }
    }
  });
});

test("clean worktree with no upstream does not follow up", () => {
  withTempRepo((root) => {
    assert.equal(gitWorktreeIsDirty(root), false);
    assert.equal(gitIsAheadOfUpstream(root), false);
    assert.equal(gitNeedsVerifyBeforePush(root), false);
    assert.deepEqual(
      verifyLedgerHandleStop({ status: "completed", cwd: root }),
      {},
    );
  });
});

test("dirty worktree without ledger follows up", () => {
  withTempRepo((root) => {
    writeFileSync(join(root, "dirty.txt"), "x");
    assert.equal(gitNeedsVerifyBeforePush(root), true);
    const result = verifyLedgerHandleStop({ status: "completed", cwd: root });
    assert.equal(result.followup_message, VERIFY_LEDGER_STOP_FOLLOWUP_MESSAGE);
    assert.match(result.followup_message, /verify:record/u);
  });
});

test("dirty worktree with valid ledger is ok", () => {
  withTempRepo((root) => {
    writeFileSync(join(root, "dirty.txt"), "x");
    writeValidVerifyLedger(root, gitHeadSha(root));
    assert.deepEqual(
      verifyLedgerHandleStop({ status: "completed", cwd: root }),
      {},
    );
  });
});

test("ahead of upstream without ledger follows up", () => {
  withUpstreamClone((root) => {
    writeFileSync(join(root, "ahead.txt"), "y");
    assert.equal(
      spawnSync("git", ["-C", root, "add", "-A"]).status,
      0,
    );
    assert.equal(
      spawnSync("git", ["-C", root, "commit", "-q", "-m", "ahead"]).status,
      0,
    );
    assert.equal(gitWorktreeIsDirty(root), false);
    assert.equal(gitIsAheadOfUpstream(root), true);
    assert.equal(gitNeedsVerifyBeforePush(root), true);
    const result = verifyLedgerHandleStop({ status: "completed", cwd: root });
    assert.equal(result.followup_message, VERIFY_LEDGER_STOP_FOLLOWUP_MESSAGE);
  });
});

test("ahead of upstream with valid ledger is ok", () => {
  withUpstreamClone((root) => {
    writeFileSync(join(root, "ahead.txt"), "y");
    assert.equal(
      spawnSync("git", ["-C", root, "add", "-A"]).status,
      0,
    );
    assert.equal(
      spawnSync("git", ["-C", root, "commit", "-q", "-m", "ahead"]).status,
      0,
    );
    writeValidVerifyLedger(root, gitHeadSha(root));
    assert.deepEqual(
      verifyLedgerHandleStop({ status: "completed", cwd: root }),
      {},
    );
  });
});

test("entry fail-open on invalid JSON", () => {
  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    input: "not-json\n",
    timeout: 5_000,
  });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), {});
});

test("clean synced clone does not follow up", () => {
  withUpstreamClone((root) => {
    assert.equal(gitNeedsVerifyBeforePush(root), false);
    assert.deepEqual(
      verifyLedgerHandleStop({ status: "completed", cwd: root }),
      {},
    );
  });
});

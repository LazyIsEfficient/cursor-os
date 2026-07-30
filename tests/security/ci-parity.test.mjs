import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  discoverCiSources,
  extractCheckCommands,
  formatRecordRecipe,
  loadVerifyProfile,
  normalizeVerifyCmd,
  recommendProfile,
  scanCiParity,
  writeVerifyProfile,
} from "../../plugin/scripts/lib/ci-parity-lib.mjs";
import { verifyLedgerProfileCoverage } from "../../scripts/lib/verify-ledger-lib.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cliPath = resolve(repositoryRoot, "plugin/scripts/ci-parity.mjs");

function withTempRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), "ci-parity-test-"));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writeWorkflow(root, name, body) {
  const dir = join(root, ".github", "workflows");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), body);
}

const RUST_WORKFLOW = `name: ci
on: push
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Format
        run: cargo fmt --check
      - name: Clippy
        run: cargo clippy --all-targets -- -D warnings
      - name: Test
        run: cargo test
`;

const NODE_WORKFLOW = `name: ci
on: push
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
      - run: npm run validate
`;

const MIXED_WORKFLOW = `name: ci
on: push
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - run: cargo test
      - run: npm run lint
      - run: make check
`;

const NOISE_WORKFLOW = `name: release
on: push
jobs:
  ship:
    runs-on: ubuntu-latest
    steps:
      - run: cargo fmt --check
      - run: npm publish
      - run: docker push ghcr.io/example/app:latest
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
      - run: cargo test
`;

test("rust workflow extracts fmt/clippy/test and recommends rust", () => {
  withTempRoot((root) => {
    writeWorkflow(root, "ci.yml", RUST_WORKFLOW);
    const sources = discoverCiSources(root);
    assert.equal(sources.length, 1);
    assert.equal(sources[0].kind, "workflow");

    const cmds = extractCheckCommands(RUST_WORKFLOW, "workflow");
    assert.deepEqual(cmds, [
      "cargo fmt --check",
      "cargo clippy --all-targets -- -D warnings",
      "cargo test",
    ]);
    assert.equal(recommendProfile(cmds), "rust");

    const scanned = scanCiParity(root);
    assert.equal(scanned.profile, "rust");
    assert.equal(scanned.commands.length, 3);
    const recipe = formatRecordRecipe(scanned.profile, scanned.commands);
    assert.match(recipe, /record-verify\.mjs/u);
    assert.match(recipe, /--profile rust --run -- cargo fmt --check/u);
    assert.match(
      recipe,
      /--profile rust --run -- cargo clippy --all-targets -- -D warnings/u,
    );
    assert.match(recipe, /--profile rust --run -- cargo test/u);
    for (const line of recipe.split("\n")) {
      assert.match(line, /^node "/u);
      assert.doesNotMatch(line, /npm run verify:record/u);
    }
  });
});

test("formatRecordRecipe uses plugin record-verify.mjs not harness npm", () => {
  const recipe = formatRecordRecipe("custom", ["pytest -q", "ruff check ."]);
  assert.match(recipe, /record-verify\.mjs/u);
  assert.doesNotMatch(recipe.split("\n")[0], /npm run verify:record/u);
  assert.match(
    recipe,
    /node ".*\/scripts\/record-verify\.mjs" --profile custom --run -- pytest -q/u,
  );
});
test("npm test + validate recommends node-harness", () => {
  withTempRoot((root) => {
    writeWorkflow(root, "ci.yml", NODE_WORKFLOW);
    const cmds = extractCheckCommands(NODE_WORKFLOW, "workflow");
    assert.deepEqual(cmds, ["npm test", "npm run validate"]);
    assert.equal(recommendProfile(cmds), "node-harness");
    assert.equal(scanCiParity(root).profile, "node-harness");
  });
});

test("mixed / exotic recommends custom and writeVerifyProfile persists sidecar", () => {
  withTempRoot((root) => {
    writeWorkflow(root, "ci.yml", MIXED_WORKFLOW);
    const scanned = scanCiParity(root);
    assert.equal(scanned.profile, "custom");
    assert.ok(scanned.commands.includes("cargo test"));
    assert.ok(scanned.commands.includes("npm run lint"));

    const written = writeVerifyProfile(root, {
      commands: scanned.commands,
      source: "ci-parity",
    });
    assert.equal(written.version, 1);
    assert.equal(written.source, "ci-parity");
    assert.deepEqual(written.commands, scanned.commands);

    const loaded = loadVerifyProfile(root);
    assert.deepEqual(loaded, written);
    const onDisk = JSON.parse(
      readFileSync(join(root, ".cursor", "verify-profile.json"), "utf8"),
    );
    assert.equal(onDisk.version, 1);
    assert.ok(Array.isArray(onDisk.commands) && onDisk.commands.length >= 2);
  });
});

test("noise filtering ignores deploy/publish/upload steps", () => {
  const cmds = extractCheckCommands(NOISE_WORKFLOW, "workflow");
  assert.deepEqual(cmds, ["cargo fmt --check", "cargo test"]);
  assert.ok(!cmds.some((c) => /publish|docker push|upload/iu.test(c)));
});

test("custom coverage with verify-profile.json requires exact cmds", () => {
  withTempRoot((root) => {
    writeVerifyProfile(root, {
      commands: ["pytest -q", "ruff check ."],
      source: "ci-parity",
    });
    const at = new Date().toISOString();
    const spawned = (cmd, exit = 0) => ({
      cmd,
      exit_code: exit,
      at,
      spawned: true,
    });

    assert.equal(
      verifyLedgerProfileCoverage(
        "custom",
        [spawned("pytest -q"), spawned("ruff check .")],
        root,
      ),
      true,
    );
    // Missing one required cmd.
    assert.equal(
      verifyLedgerProfileCoverage("custom", [spawned("pytest -q")], root),
      false,
    );
    // Wrong string (not exact).
    assert.equal(
      verifyLedgerProfileCoverage(
        "custom",
        [spawned("pytest"), spawned("ruff check .")],
        root,
      ),
      false,
    );
    // Nonzero exit on a required cmd.
    assert.equal(
      verifyLedgerProfileCoverage(
        "custom",
        [spawned("pytest -q", 1), spawned("ruff check .")],
        root,
      ),
      false,
    );
    // Single-command profile — do not force a fake second.
    writeVerifyProfile(root, {
      commands: ["tox -e py"],
      source: "ci-parity",
    });
    assert.equal(
      verifyLedgerProfileCoverage("custom", [spawned("tox -e py")], root),
      true,
    );
    // No sidecar → existing ≥2 verification-shaped behavior.
    rmSync(join(root, ".cursor", "verify-profile.json"));
    assert.equal(
      verifyLedgerProfileCoverage(
        "custom",
        [spawned("npm test"), spawned("npm run lint")],
        root,
      ),
      true,
    );
    assert.equal(
      verifyLedgerProfileCoverage("custom", [spawned("npm test")], root),
      false,
    );
  });
});

test("ci-parity CLI prints recipe; --write persists profile; exit 1 when empty", () => {
  withTempRoot((root) => {
    writeWorkflow(root, "ci.yml", RUST_WORKFLOW);
    const ok = spawnSync(process.execPath, [cliPath, "--root", root], {
      encoding: "utf8",
    });
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /# profile: rust/u);
    assert.match(ok.stdout, /cargo fmt --check/u);
    assert.match(ok.stdout, /cargo clippy --all-targets -- -D warnings/u);
    assert.match(ok.stdout, /cargo test/u);

    const write = spawnSync(
      process.execPath,
      [cliPath, "--write", "--root", root],
      { encoding: "utf8" },
    );
    assert.equal(write.status, 0);
    const profile = loadVerifyProfile(root);
    assert.equal(profile.version, 1);
    assert.equal(profile.commands.length, 3);

    const emptyRoot = mkdtempSync(join(tmpdir(), "ci-parity-empty-"));
    try {
      const empty = spawnSync(
        process.execPath,
        [cliPath, "--root", emptyRoot],
        { encoding: "utf8" },
      );
      assert.equal(empty.status, 1);
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true });
    }

    const usage = spawnSync(
      process.execPath,
      [cliPath, "--nope"],
      { encoding: "utf8" },
    );
    assert.equal(usage.status, 2);
  });
});

test("justfile and Makefile discovery", () => {
  withTempRoot((root) => {
    writeFileSync(
      join(root, "justfile"),
      `check:\n    cargo fmt --check\n    cargo clippy --all-targets -- -D warnings\n\ntest:\n    cargo test\n`,
    );
    writeFileSync(
      join(root, "Makefile"),
      `check:\n\tcargo fmt --check\n\nlint:\n\tnpm run lint\n`,
    );
    const sources = discoverCiSources(root);
    assert.ok(sources.some((s) => s.kind === "justfile"));
    assert.ok(sources.some((s) => s.kind === "makefile"));
    const scanned = scanCiParity(root);
    assert.ok(scanned.commands.includes("cargo fmt --check"));
    assert.ok(scanned.commands.includes("cargo test"));
    assert.ok(scanned.commands.includes("npm run lint"));
    assert.equal(scanned.profile, "rust");
  });
});

test("justfile/Makefile apply looksLikeCheckCommand (echo preparing filtered)", () => {
  const justfile = `check:\n    echo preparing\n    cargo test\n`;
  const makefile = `check:\n\techo preparing\n\tnpm test\n`;
  assert.deepEqual(extractCheckCommands(justfile, "justfile"), ["cargo test"]);
  assert.deepEqual(extractCheckCommands(makefile, "makefile"), ["npm test"]);
  assert.ok(!extractCheckCommands(justfile, "justfile").includes("echo preparing"));
  assert.ok(!extractCheckCommands(makefile, "makefile").includes("echo preparing"));
});

test("normalizeVerifyCmd collapses quotes/whitespace for profile coverage", () => {
  assert.equal(
    normalizeVerifyCmd(`pytest  -k  "not slow"`),
    "pytest -k not slow",
  );
  assert.equal(
    normalizeVerifyCmd("pytest -k not slow"),
    "pytest -k not slow",
  );
  assert.equal(
    normalizeVerifyCmd(`pytest -k 'not slow'`),
    "pytest -k not slow",
  );

  withTempRoot((root) => {
    writeVerifyProfile(root, {
      commands: [`pytest  -k  "not slow"`],
      source: "ci-parity",
    });
    const loaded = loadVerifyProfile(root);
    assert.deepEqual(loaded.commands, ["pytest -k not slow"]);

    const at = new Date().toISOString();
    const spawned = (cmd) => ({
      cmd,
      exit_code: 0,
      at,
      spawned: true,
    });
    // Ledger form as record-verify emits (JSON-quoted multi-word arg).
    assert.equal(
      verifyLedgerProfileCoverage(
        "custom",
        [spawned(`pytest -k "not slow"`)],
        root,
      ),
      true,
    );
    assert.equal(
      verifyLedgerProfileCoverage(
        "custom",
        [spawned("pytest -k not slow")],
        root,
      ),
      true,
    );
  });
});

test("sidecar listing go version alone does not satisfy custom coverage", () => {
  withTempRoot((root) => {
    writeVerifyProfile(root, {
      commands: ["go version"],
      source: "ci-parity",
    });
    const at = new Date().toISOString();
    const spawned = (cmd) => ({
      cmd,
      exit_code: 0,
      at,
      spawned: true,
    });
    assert.equal(
      verifyLedgerProfileCoverage("custom", [spawned("go version")], root),
      false,
    );
  });
});

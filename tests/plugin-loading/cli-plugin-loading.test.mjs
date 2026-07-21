import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertStreamProvesLoading,
  buildInvocationArguments,
  CLEANUP_SIGNALS,
  componentNamePattern,
  installSignalCleanup,
  matchComponentsInStream,
  parseArguments,
  PROMPT,
} from "../../scripts/verify-cli-plugin-loading.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const script = join(root, "scripts/verify-cli-plugin-loading.mjs");
// Hand-written and format-illustrative. See fixtures/README.md: this is not
// captured evidence and proves nothing about live plugin loading.
const syntheticStreamPath = join(root, "tests/plugin-loading/fixtures/SYNTHETIC-stream-json.ndjson");

const completedProcess = { timedOut: false, exitCode: 0, stderr: "" };

test("argument parsing requires an absolute protected config template", () => {
  assert.throws(() => parseArguments([]), /--cursor-config-template is required/u);
  assert.throws(
    () => parseArguments(["--cursor-config-template", "relative/template"]),
    /--cursor-config-template must be an absolute path/u,
  );
  assert.throws(() => parseArguments(["--cursor-config-template"]), /requires a value/u);
});

test("argument parsing refuses credential-shaped options", () => {
  for (const name of ["--api-key", "--api_key", "--token", "--cursor-secret", "--password"]) {
    assert.throws(
      () => parseArguments([name, "value", "--cursor-config-template", "/protected/template"]),
      /is refused: authenticated runs require a protected config template/u,
      `${name} must be refused`,
    );
  }
});

test("argument parsing validates optional numeric and path options", () => {
  assert.throws(
    () => parseArguments(["--cursor-config-template", "/protected/template", "--timeout-ms", "0"]),
    /--timeout-ms must be a positive integer/u,
  );
  assert.throws(
    () => parseArguments(["--cursor-config-template", "/protected/template", "--plugin-dir", "plugin"]),
    /--plugin-dir must be an absolute path/u,
  );
  assert.throws(
    () => parseArguments(["--cursor-config-template", "/protected/template", "--unknown", "x"]),
    /unknown option --unknown/u,
  );

  const options = parseArguments([
    "--cursor-config-template",
    "/protected/template",
    "--agent-bin",
    "agent",
    "--timeout-ms",
    "60000",
  ]);
  assert.equal(options.timeoutMs, 60_000);
  assert.equal(options.pluginDir, join(root, "plugin"));
});

test("component matching ignores the prompt echo in user events", () => {
  const analysis = matchComponentsInStream(
    [
      '{"type":"user","message":{"content":"orchestrator-first factual-correctness"}}',
      '{"type":"result","subtype":"success"}',
    ].join("\n"),
    [{ id: "orchestrator-first", kind: "rule" }, { id: "factual-correctness", kind: "rule" }],
  );

  assert.equal(analysis.allRequiredObserved, false);
  assert.deepEqual(analysis.missingRequired, ["factual-correctness", "orchestrator-first"]);
});

test("a longer component name does not satisfy a shorter one", () => {
  const analysis = matchComponentsInStream(
    ['{"type":"assistant","message":{"content":"rust-engineer\\ngodot-engineer"}}', '{"type":"result","subtype":"success"}'].join("\n"),
    [
      { id: "engineer", kind: "agent" },
      { id: "rust-engineer", kind: "agent" },
    ],
  );

  assert.deepEqual(analysis.missingRequired, ["engineer"]);
  assert.equal(analysis.observations.find((entry) => entry.id === "rust-engineer").observed, true);
});

test("component name matching tolerates surrounding punctuation and quoting", () => {
  assert.equal(componentNamePattern("engineer").test('"agents":["engineer","code-reviewer"]'), true);
  assert.equal(componentNamePattern("engineer").test('"agents":["rust-engineer"]'), false);
  assert.equal(componentNamePattern("engineer").test("- engineer\n"), true);
});

test("an underscore is an identifier boundary, not a separator", () => {
  // No inventory id collides today, but `_` must bound the match for the same
  // reason `-` does: my_engineer is a different component from engineer.
  assert.equal(componentNamePattern("engineer").test("my_engineer"), false);
  assert.equal(componentNamePattern("engineer").test("engineer_v2"), false);
  assert.equal(componentNamePattern("engineer").test("engineer"), true);

  const analysis = matchComponentsInStream(
    [
      JSON.stringify({ type: "assistant", message: { content: "my_engineer\nengineer_v2" } }),
      '{"type":"result","subtype":"success"}',
    ].join("\n"),
    [{ id: "engineer", kind: "agent" }],
  );
  assert.deepEqual(analysis.missingRequired, ["engineer"]);
});

test("a name on its own line in a newline-escaped event still matches", () => {
  const analysis = matchComponentsInStream(
    [
      JSON.stringify({ type: "assistant", message: { content: "code-reviewer\nengineer\nsecurity-reviewer" } }),
      '{"type":"result","subtype":"success"}',
    ].join("\n"),
    [{ id: "engineer", kind: "agent" }],
  );

  assert.deepEqual(analysis.missingRequired, []);
});

test("component matching records parse errors instead of skipping them silently", () => {
  const analysis = matchComponentsInStream(
    ['{"type":"assistant","message":{"content":"engineer"}}', "not json", '{"type":"result","subtype":"success"}'].join("\n"),
    [{ id: "engineer", kind: "agent" }],
  );

  assert.equal(analysis.allRequiredObserved, true);
  assert.equal(analysis.parseErrors.length, 1);
  assert.equal(analysis.parseErrors[0].line, 2);
});

test("only the model's own output counts; system-event names are not evidence", async () => {
  // The synthetic stream's system init event names capability-probe,
  // code-reviewer, and factual-correctness. Its assistant message names
  // orchestrator-first and engineer. Only the latter pair may be observed.
  const analysis = matchComponentsInStream(await readFile(syntheticStreamPath, "utf8"), [
    { id: "capability-probe", kind: "agent" },
    { id: "code-reviewer", kind: "agent" },
    { id: "engineer", kind: "agent" },
    { id: "factual-correctness", kind: "rule" },
    { id: "orchestrator-first", kind: "rule" },
  ]);

  assert.equal(analysis.hasTerminalResult, true);
  assert.deepEqual(analysis.missingRequired, [
    "capability-probe",
    "code-reviewer",
    "factual-correctness",
  ]);
  assert.deepEqual(analysis.byKind.agent, { expected: 3, observed: 1 });
  assert.deepEqual(analysis.byKind.rule, { expected: 2, observed: 1 });
  // Excluded from matching, but still parsed and reported.
  assert.deepEqual(analysis.eventTypes, ["system", "user", "assistant", "result"]);
});

// Regression: a CLI that lists loaded config files in its init event named every
// component as a filesystem path, and componentNamePattern treats `/` and `.` as
// boundaries, so every required component matched while the model said nothing.
// That produced allRequiredObserved: true and an artifact claiming
// cliPluginLoading: "observed" with zero model participation.
test("a system event listing loaded plugin files cannot by itself prove loading", () => {
  const components = [
    { id: "engineer", kind: "agent" },
    { id: "code-reviewer", kind: "agent" },
    { id: "factual-correctness", kind: "rule" },
  ];
  const stream = [
    JSON.stringify({
      type: "system",
      subtype: "init",
      loadedFiles: [
        "/repo/plugin/agents/engineer.md",
        "/repo/plugin/agents/code-reviewer.md",
        "/repo/plugin/rules/factual-correctness.md",
      ],
    }),
    JSON.stringify({ type: "assistant", message: { content: "I cannot list anything." } }),
    JSON.stringify({ type: "result", subtype: "success" }),
  ].join("\n");

  const analysis = matchComponentsInStream(stream, components);

  assert.equal(analysis.allRequiredObserved, false);
  assert.deepEqual(analysis.missingRequired, ["code-reviewer", "engineer", "factual-correctness"]);
  assert.throws(
    () => assertStreamProvesLoading(analysis, completedProcess),
    /the stream never named these plugin components/u,
  );
});

test("the same components named by the model in the same stream do prove loading", () => {
  const components = [
    { id: "engineer", kind: "agent" },
    { id: "code-reviewer", kind: "agent" },
    { id: "factual-correctness", kind: "rule" },
  ];
  const stream = [
    JSON.stringify({ type: "system", subtype: "init", loadedFiles: [] }),
    JSON.stringify({
      type: "assistant",
      message: { content: "engineer\ncode-reviewer\nfactual-correctness" },
    }),
    JSON.stringify({ type: "result", subtype: "success" }),
  ].join("\n");

  const analysis = matchComponentsInStream(stream, components);

  assert.equal(analysis.allRequiredObserved, true);
  assert.deepEqual(analysis.missingRequired, []);
  assert.doesNotThrow(() => assertStreamProvesLoading(analysis, completedProcess));
});

test("the probe invocation is sandboxed and loads the requested plugin directory", () => {
  const argv = buildInvocationArguments("/absolute/plugin");

  // Prompt text asking the model not to touch anything is instruction, not
  // enforcement. Removing --sandbox must fail this test.
  const sandboxIndex = argv.indexOf("--sandbox");
  assert.notEqual(sandboxIndex, -1, "--sandbox must be passed to every authenticated invocation");
  assert.equal(argv[sandboxIndex + 1], "enabled");

  assert.deepEqual(argv.slice(0, 7), [
    "--print",
    "--output-format",
    "stream-json",
    "--sandbox",
    "enabled",
    "--plugin-dir",
    "/absolute/plugin",
  ]);
  assert.equal(argv.at(-1), PROMPT);
});

test("interrupt cleanup handlers are installed for every terminating signal and released", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "cursor-harness-signal-test-"));
  try {
    const before = new Map(CLEANUP_SIGNALS.map((signal) => [signal, process.listenerCount(signal)]));
    const release = installSignalCleanup(temporaryRoot);
    for (const signal of CLEANUP_SIGNALS) {
      assert.equal(
        process.listenerCount(signal),
        before.get(signal) + 1,
        `${signal} must be handled so an interrupt does not leave credentials on disk`,
      );
    }
    release();
    for (const signal of CLEANUP_SIGNALS) {
      assert.equal(process.listenerCount(signal), before.get(signal), `${signal} handler must be released`);
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("an interrupted run removes the copied credentials and exits from the signal", () => {
  // `finally` does not unwind on a default-disposition signal, so this is
  // verified against a real process receiving a real SIGINT.
  const harness = `
    import { mkdtemp, writeFile } from "node:fs/promises";
    import { tmpdir } from "node:os";
    import { join } from "node:path";
    import { installSignalCleanup } from ${JSON.stringify(script)};
    const root = await mkdtemp(join(tmpdir(), "cursor-harness-sigint-"));
    await writeFile(join(root, "credentials.json"), "SECRET");
    installSignalCleanup(root);
    process.stdout.write(root + "\\n");
    setTimeout(() => {}, 30000);
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", harness], {
    stdio: ["ignore", "pipe", "ignore"],
  });

  return new Promise((resolveTest, rejectTest) => {
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (!stdout.includes("\n")) return;
      const temporaryRoot = stdout.trim();
      assert.equal(existsSync(join(temporaryRoot, "credentials.json")), true);
      child.kill("SIGINT");
      child.on("exit", (code, signal) => {
        try {
          assert.equal(
            existsSync(temporaryRoot),
            false,
            "SIGINT must not leave a credential copy on disk",
          );
          // Re-raised with the default disposition rather than exiting 0.
          assert.ok(signal === "SIGINT" || code === 130, `expected SIGINT termination, got ${signal}/${code}`);
          resolveTest();
        } catch (error) {
          rejectTest(error);
        }
      });
    });
    child.on("error", rejectTest);
  });
});

test("a stream with no required components is never a pass", () => {
  const analysis = matchComponentsInStream('{"type":"result","subtype":"success"}', [
    { id: "engineer", kind: "agent" },
  ]);

  assert.equal(analysis.allRequiredObserved, false);
  assert.throws(
    () => assertStreamProvesLoading(analysis, completedProcess),
    /the stream never named these plugin components: engineer/u,
  );
});

test("an inventory with no required components cannot vacuously pass", () => {
  const analysis = matchComponentsInStream('{"type":"result","subtype":"success"}', [
    { id: "some-skill", kind: "skill" },
  ]);
  assert.equal(analysis.allRequiredObserved, false);
});

test("assertions fail closed on timeout, nonzero exit, missing result, and error result", () => {
  const passing = matchComponentsInStream(
    ['{"type":"assistant","message":{"content":"engineer"}}', '{"type":"result","subtype":"success"}'].join("\n"),
    [{ id: "engineer", kind: "agent" }],
  );
  assert.doesNotThrow(() => assertStreamProvesLoading(passing, completedProcess));

  assert.throws(
    () => assertStreamProvesLoading(passing, { ...completedProcess, timedOut: true }),
    /timed out/u,
  );
  assert.throws(
    () => assertStreamProvesLoading(passing, { ...completedProcess, exitCode: 3, stderr: "boom" }),
    /Cursor CLI exited 3: boom/u,
  );
  assert.throws(
    () => assertStreamProvesLoading(
      matchComponentsInStream('{"type":"assistant","message":{"content":"engineer"}}', [{ id: "engineer", kind: "agent" }]),
      completedProcess,
    ),
    /ended without a documented result event/u,
  );
  assert.throws(
    () => assertStreamProvesLoading(
      matchComponentsInStream(
        ['{"type":"assistant","message":{"content":"engineer"}}', '{"type":"result","subtype":"error"}'].join("\n"),
        [{ id: "engineer", kind: "agent" }],
      ),
      completedProcess,
    ),
    /terminal result reported subtype=error/u,
  );
  assert.throws(
    () => assertStreamProvesLoading(
      matchComponentsInStream(
        ["oops", '{"type":"assistant","message":{"content":"engineer"}}', '{"type":"result","subtype":"success"}'].join("\n"),
        [{ id: "engineer", kind: "agent" }],
      ),
      completedProcess,
    ),
    /unparsable line/u,
  );
});

test("the script exits nonzero without a config template and never reads an API key from the environment", () => {
  const result = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { ...process.env, CURSOR_API_KEY: "must-not-be-used" },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /--cursor-config-template is required/u);
  assert.equal(result.stdout, "");
});

test("the synthetic fixture is labelled as illustrative, not captured evidence", async () => {
  const readme = await readFile(join(root, "tests/plugin-loading/fixtures/README.md"), "utf8");
  assert.match(readme, /not captured evidence/u);
});

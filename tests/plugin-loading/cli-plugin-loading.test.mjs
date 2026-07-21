import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertStreamProvesLoading,
  componentNamePattern,
  matchComponentsInStream,
  parseArguments,
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

test("component matching reads system and assistant events from the synthetic stream", async () => {
  const analysis = matchComponentsInStream(await readFile(syntheticStreamPath, "utf8"), [
    { id: "capability-probe", kind: "agent" },
    { id: "engineer", kind: "agent" },
    { id: "factual-correctness", kind: "rule" },
    { id: "orchestrator-first", kind: "rule" },
    { id: "missing-agent", kind: "agent" },
  ]);

  assert.equal(analysis.hasTerminalResult, true);
  assert.deepEqual(analysis.missingRequired, ["missing-agent"]);
  assert.deepEqual(analysis.byKind.rule, { expected: 2, observed: 2 });
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

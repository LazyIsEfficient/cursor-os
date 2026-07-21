import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  parseCliHelp,
  parseFrontmatter,
  probeBlockingContract,
  probeCursorCli,
  validatePlatformLayout,
} from "../scripts/lib/platform-contract.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("single-plugin marketplace resolves its manifest and every agent", () => {
  const result = validatePlatformLayout(repositoryRoot);
  const expectedAgentPaths = readdirSync(resolve(repositoryRoot, "plugin", "agents"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && /\.(?:md|mdc|markdown)$/.test(entry.name))
    .map((entry) => `agents/${entry.name}`)
    .sort();

  assert.equal(result.marketplace, ".cursor-plugin/marketplace.json");
  assert.equal(result.pluginManifest, "plugin/.cursor-plugin/plugin.json");
  assert.equal(result.pluginSource, "plugin");
  assert.deepEqual(
    result.agents.map((agent) => agent.path),
    expectedAgentPaths,
  );
  assert.equal(new Set(result.agents.map((agent) => agent.name)).size, result.agents.length);
  for (const agent of result.agents) {
    assert.match(agent.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  }
});

test("custom agents require closed frontmatter", () => {
  assert.throws(
    () => parseFrontmatter("---\nname: broken\n", "broken.md"),
    /close YAML frontmatter/,
  );
});

test("hook fixture proves both documented denial contracts", () => {
  const result = probeBlockingContract(repositoryRoot);

  assert.deepEqual(result.jsonDenial, { exitCode: 0, permission: "deny" });
  assert.deepEqual(result.exitCodeDenial, { exitCode: 2 });
});

test("CLI help parser detects documented stream-json flags", () => {
  const result = parseCliHelp(`
    -p, --print
    --output-format <format> text | json | stream-json
    --stream-partial-output
    --plugin-dir <path>
    --sandbox <mode>
  `);

  assert.deepEqual(result, {
    print: true,
    streamJson: true,
    streamPartialOutput: true,
    pluginDir: true,
    sandbox: true,
  });
});

test("missing Cursor CLI is reported without mutating or failing", () => {
  const result = probeCursorCli("cursor-harness-command-that-does-not-exist");

  assert.equal(result.installed, false);
  assert.equal(result.capabilities.streamJson, false);
});

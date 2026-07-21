import { resolve } from "node:path";

import { createCursorCliAdapter, createProjectOverlayAdapter } from "./lib/adapters.mjs";
import { runCursorAuthenticationPreflight } from "./lib/auth-preflight.mjs";
import { runBenchmark } from "./lib/engine.mjs";
import { readBenchmarkManifest } from "./lib/manifest.mjs";
import { probeCursorCli } from "../scripts/lib/platform-contract.mjs";

function parseArguments(argv) {
  const options = { fixtures: [], adapter: "project-overlay" };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      positional.push(argument);
      continue;
    }
    const value = argv[++index];
    if (value === undefined) throw new Error(`${argument} requires a value`);
    if (argument === "--fixture") options.fixtures.push(value);
    else if (argument === "--run-id") options.runId = value;
    else if (argument === "--agent-bin") options.agentBin = value;
    else if (argument === "--adapter") options.adapter = value;
    else if (argument === "--plugin-root") options.pluginRoot = value;
    else if (argument === "--output-root") options.outputRoot = value;
    else if (argument === "--cursor-config-template") options.cursorConfigTemplatePath = value;
    else throw new Error(`unknown option ${argument}`);
  }
  if (positional.length !== 1) throw new Error("usage: npm run benchmark:run -- <benchmark-manifest.json> [options]");
  return { manifestPath: positional[0], ...options };
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (!options.cursorConfigTemplatePath) {
    throw new Error("authenticated benchmark requires --cursor-config-template");
  }
  const loadedManifest = await readBenchmarkManifest(options.manifestPath, {
    fixtureIds: options.fixtures.length === 0 ? undefined : options.fixtures,
  });
  const cli = probeCursorCli(options.agentBin);
  if (!cli.installed) throw new Error(`Cursor CLI is not installed: ${cli.binary}`);
  await runCursorAuthenticationPreflight({
    binary: cli.binary,
    cursorConfigTemplatePath: options.cursorConfigTemplatePath,
  });
  const cursorAdapter = createCursorCliAdapter({
    binary: cli.binary,
    capabilities: cli.capabilities,
  });
  const pluginRoot = resolve(options.pluginRoot ?? "plugin");
  let agentAdapter;
  if (options.adapter === "project-overlay") {
    agentAdapter = createProjectOverlayAdapter({ pluginRoot, agentAdapter: cursorAdapter });
  } else if (options.adapter === "live-plugin") {
    if (!cli.capabilities.pluginDir) {
      throw new Error("live-plugin adapter is unavailable because this local CLI does not expose --plugin-dir; use project-overlay");
    }
    agentAdapter = {
      adapterKind: "live-plugin",
      run(context) {
        return cursorAdapter.run({
          ...context,
          livePluginRoot: context.harnessEnabled ? pluginRoot : undefined,
        });
      },
    };
  } else {
    throw new Error(`unsupported adapter ${options.adapter}`);
  }

  const result = await runBenchmark({
    loadedManifest,
    agentAdapter,
    runId: options.runId,
    outputRoot: options.outputRoot ? resolve(options.outputRoot) : undefined,
    cursorConfigTemplatePath: options.cursorConfigTemplatePath,
  });
  process.stdout.write(`${JSON.stringify({
    runId: result.runId,
    pairs: result.results.length,
    records: result.recordPath,
    adapter: agentAdapter.adapterKind,
  })}\n`);
} catch (error) {
  process.stderr.write(`Benchmark run failed: ${error.message}\n`);
  process.exitCode = 1;
}

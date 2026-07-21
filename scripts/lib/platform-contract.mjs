import { readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const MARKETPLACE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLUGIN_NAME = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const AGENT_EXTENSIONS = new Set([".md", ".mdc", ".markdown"]);

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function extension(path) {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index);
}

function assertSafeRelativePath(path, label) {
  invariant(typeof path === "string" && path.length > 0, `${label} must be a non-empty string`);
  invariant(!isAbsolute(path), `${label} must be relative`);
  invariant(
    !path.split(/[\\/]/).includes(".."),
    `${label} must not traverse outside the repository`,
  );
}

function assertInside(parent, child, label) {
  const rel = relative(resolve(parent), resolve(child));
  invariant(rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `${label} escapes its root`);
}

export function parseFrontmatter(markdown, path = "<agent>") {
  const lines = markdown.split(/\r?\n/);
  invariant(lines[0] === "---", `${path} must begin with YAML frontmatter`);
  const end = lines.indexOf("---", 1);
  invariant(end > 1, `${path} must close YAML frontmatter`);

  const fields = {};
  for (const line of lines.slice(1, end)) {
    if (!line.trim()) continue;
    const separator = line.indexOf(":");
    invariant(separator > 0, `${path} has unsupported frontmatter syntax: ${line}`);
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    invariant(value.length > 0, `${path} frontmatter field ${key} must not be empty`);
    fields[key] = value;
  }

  return fields;
}

export function discoverAgents(pluginDirectory, manifest) {
  // Cursor's documented plugin fallback scans agents/ when no explicit agents path exists:
  // https://cursor.com/docs/reference/plugins#component-discovery
  const configured = manifest.agents;
  const paths = configured === undefined
    ? [join(pluginDirectory, "agents")]
    : (Array.isArray(configured) ? configured : [configured]).map((path) => {
        assertSafeRelativePath(path, "plugin agents path");
        return join(pluginDirectory, path);
      });

  const agents = [];
  for (const path of paths) {
    assertInside(pluginDirectory, path, "agent discovery path");
    let entries;
    try {
      entries = statSync(path).isDirectory() ? readdirSync(path).map((name) => join(path, name)) : [path];
    } catch (error) {
      if (error?.code === "ENOENT" && configured === undefined) continue;
      throw error;
    }

    for (const candidate of entries.sort()) {
      if (!statSync(candidate).isFile() || !AGENT_EXTENSIONS.has(extension(candidate))) continue;
      const frontmatter = parseFrontmatter(readFileSync(candidate, "utf8"), candidate);
      invariant(
        typeof frontmatter.name === "string" && MARKETPLACE_NAME.test(frontmatter.name),
        `${candidate} must have a lowercase kebab-case name`,
      );
      invariant(
        typeof frontmatter.description === "string",
        `${candidate} must have a description`,
      );
      agents.push({
        path: relative(pluginDirectory, candidate),
        name: frontmatter.name,
      });
    }
  }

  return agents;
}

export function validatePlatformLayout(repositoryRoot) {
  // Manifest locations and merge/discovery behavior follow the current official reference:
  // https://cursor.com/docs/reference/plugins#multi-plugin-repositories
  const marketplacePath = join(repositoryRoot, ".cursor-plugin", "marketplace.json");
  const marketplace = readJson(marketplacePath);

  invariant(MARKETPLACE_NAME.test(marketplace.name), "marketplace name must be kebab-case");
  invariant(
    marketplace.owner && typeof marketplace.owner.name === "string",
    "marketplace owner.name is required",
  );
  invariant(Array.isArray(marketplace.plugins), "marketplace plugins must be an array");
  invariant(marketplace.plugins.length === 1, "this repository must contain exactly one plugin");

  const entry = marketplace.plugins[0];
  invariant(MARKETPLACE_NAME.test(entry.name), "marketplace plugin name must be kebab-case");
  invariant(typeof entry.source === "string", "single plugin source must be a path string");
  assertSafeRelativePath(entry.source, "plugin source");

  const pluginDirectory = join(repositoryRoot, entry.source);
  assertInside(repositoryRoot, pluginDirectory, "plugin source");
  const pluginManifestPath = join(pluginDirectory, ".cursor-plugin", "plugin.json");
  const manifest = readJson(pluginManifestPath);

  invariant(PLUGIN_NAME.test(manifest.name), "plugin manifest name is invalid");
  invariant(manifest.name === entry.name, "marketplace and plugin manifest names must match");

  const agents = discoverAgents(pluginDirectory, manifest);
  invariant(agents.length > 0, "default custom-agent discovery found no agent files");

  return {
    marketplace: relative(repositoryRoot, marketplacePath),
    pluginManifest: relative(repositoryRoot, pluginManifestPath),
    pluginSource: entry.source,
    agents,
  };
}

export function validateHookConfig(config) {
  // Configuration and blocking fields follow:
  // https://cursor.com/docs/hooks#configuration
  invariant(config && typeof config === "object", "hook config must be an object");
  invariant(config.version === 1, "hook config version must be 1");
  invariant(config.hooks && typeof config.hooks === "object", "hooks must be an object");

  const definitions = config.hooks.beforeShellExecution;
  invariant(Array.isArray(definitions) && definitions.length > 0, "beforeShellExecution must be configured");

  for (const definition of definitions) {
    invariant(
      definition && typeof definition.command === "string" && definition.command.length > 0,
      "hook command is required",
    );
    invariant(
      definition.type === undefined || definition.type === "command",
      "probe hooks must be command-based",
    );
    invariant(definition.failClosed === true, "blocking probe hook must be fail-closed");
    invariant(
      definition.matcher === undefined ||
        typeof definition.matcher === "string" ||
        (definition.matcher && typeof definition.matcher === "object"),
      "hook matcher must be a string or object",
    );
  }

  return definitions;
}

export function runHookCommand(repositoryRoot, command, input) {
  const [program, ...args] = command.trim().split(/\s+/);
  invariant(program === "node", "probe runner only executes dependency-free Node hooks");

  const result = spawnSync(process.execPath, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    input: `${JSON.stringify(input)}\n`,
    env: {
      ...process.env,
      CURSOR_PROJECT_DIR: repositoryRoot,
    },
    timeout: 5_000,
  });

  invariant(!result.error, `hook failed to start: ${result.error?.message}`);
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

export function probeBlockingContract(repositoryRoot) {
  const configPath = join(repositoryRoot, "test", "fixtures", "hooks", "hooks.json");
  const config = readJson(configPath);
  const [definition] = validateHookConfig(config);
  const matcher = new RegExp(definition.matcher);
  invariant(matcher.test("probe:deny"), "hook matcher must select the JSON denial case");
  invariant(matcher.test("probe:exit-2"), "hook matcher must select the exit-code denial case");

  const denied = runHookCommand(repositoryRoot, definition.command, {
    hook_event_name: "beforeShellExecution",
    command: "probe:deny",
    cwd: repositoryRoot,
    sandbox: true,
  });
  invariant(denied.status === 0, "JSON denial hook must exit zero");
  const response = JSON.parse(denied.stdout);
  invariant(response.permission === "deny", "JSON denial hook must return permission=deny");

  const exitTwo = runHookCommand(repositoryRoot, definition.command, {
    hook_event_name: "beforeShellExecution",
    command: "probe:exit-2",
    cwd: repositoryRoot,
    sandbox: true,
  });
  invariant(exitTwo.status === 2, "exit-code denial hook must exit 2");

  return {
    config: relative(repositoryRoot, configPath),
    jsonDenial: { exitCode: denied.status, permission: response.permission },
    exitCodeDenial: { exitCode: exitTwo.status },
  };
}

export function parseCliHelp(helpText) {
  return {
    print: /(?:^|\s)(?:-p,\s*)?--print(?:\s|$)/m.test(helpText),
    streamJson: /stream-json/.test(helpText) && /--output-format/.test(helpText),
    streamPartialOutput: /--stream-partial-output/.test(helpText),
    pluginDir: /--plugin-dir/.test(helpText),
    sandbox: /--sandbox(?:\s|$)/m.test(helpText),
  };
}

export function probeCursorCli(binary = process.env.CURSOR_AGENT_BIN || "agent") {
  const help = spawnSync(binary, ["--help"], {
    encoding: "utf8",
    env: process.env,
    timeout: 5_000,
  });

  if (help.error?.code === "ENOENT") {
    return {
      binary,
      installed: false,
      capabilities: {
        print: false,
        streamJson: false,
        streamPartialOutput: false,
        pluginDir: false,
        sandbox: false,
      },
    };
  }
  invariant(!help.error, `Cursor CLI help probe failed: ${help.error?.message}`);
  invariant(help.status === 0, `Cursor CLI help exited ${help.status}: ${help.stderr.trim()}`);

  const version = spawnSync(binary, ["--version"], {
    encoding: "utf8",
    env: process.env,
    timeout: 5_000,
  });
  invariant(!version.error && version.status === 0, "Cursor CLI version probe failed");

  return {
    binary,
    installed: true,
    version: version.stdout.trim(),
    capabilities: parseCliHelp(`${help.stdout}\n${help.stderr}`),
  };
}

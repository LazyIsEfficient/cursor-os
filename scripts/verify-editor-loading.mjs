// Operator-run, strictly read-only inspection of an existing Cursor Editor
// installation. This script never creates, writes, or removes anything under
// the Cursor home directory (README.md:81); it only reads paths and emits
// evidence to an operator-chosen path outside that directory.
import { lstat, mkdir, readFile, readlink, realpath, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { assertSafeRelativePath, hashTree, sha256 } from "../benchmark/lib/util.mjs";

export const SCHEMA_VERSION = "1.0.0";
export const ARTIFACT_KIND = "editor-plugin-loading-evidence";
// Components a Cursor Editor install is expected to expose. Hooks, scripts and
// reference files are packaged but are not independently loadable components.
export const LOADABLE_KINDS = ["agent", "command", "rule", "skill"];
export const SENTINEL = "cursor-harness-agent-discovered";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inventoryPath = join(repositoryRoot, "plugin/.cursor-plugin/inventory.json");
const pluginRoot = join(repositoryRoot, "plugin");

const USAGE = [
  "usage: npm run plugin:editor:verify -- [options]",
  "  --cursor-home <absolute path>  Cursor home to read (default: ~/.cursor)",
  "  --transcript <absolute path>   saved Editor transcript to scan for the capability-probe sentinel",
  "  --evidence <absolute path>     write the JSON evidence artifact here",
].join("\n");

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

export function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    invariant(name.startsWith("--"), `${USAGE}\nunexpected argument ${name}`);
    const value = argv[index + 1];
    invariant(value !== undefined && !value.startsWith("--"), `${name} requires a value`);
    index += 1;
    invariant(isAbsolute(value), `${name} must be an absolute path`);
    if (name === "--cursor-home") options.cursorHomePath = value;
    else if (name === "--transcript") options.transcriptPath = value;
    else if (name === "--evidence") options.evidencePath = value;
    else throw new Error(`${USAGE}\nunknown option ${name}`);
  }
  return options;
}

// resolve() is lexical: it collapses "..", but it does not follow symbolic
// links. A guard built on resolve() alone is bypassed by pointing --evidence at
// a symlink that lands back inside the Cursor home. Every other path check in
// this repository resolves symlinks first (benchmark/lib/workspace.mjs,
// benchmark/lib/util.mjs), and so must this one.
//
// The path being checked may not exist yet (the evidence leaf never does, and
// the Cursor home may be absent), so resolve the nearest existing ancestor and
// re-append the not-yet-existing remainder lexically.
export async function realpathAllowingMissingLeaf(path) {
  let current = resolve(path);
  const missingSegments = [];
  for (;;) {
    try {
      return join(await realpath(current), ...missingSegments);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = dirname(current);
      // The filesystem root always exists; this guards against an infinite loop
      // if it somehow does not.
      invariant(parent !== current, `cannot resolve any existing ancestor of ${path}`);
      missingSegments.unshift(basename(current));
      current = parent;
    }
  }
}

async function statOrNull(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function readJsonIfPresent(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error.message}`, { cause: error });
  }
}

// Resolution mirrors the two documented install shapes: a managed registry
// entry in plugins.json, and the local-development symlink under plugins/local.
export function resolveInstallCandidates({ cursorHomePath, pluginId, registry }) {
  const candidates = [];
  const registered = registry?.plugins?.[pluginId];
  if (registered && typeof registered.path === "string" && !isAbsolute(registered.path)) {
    candidates.push({ source: "plugins.json", path: join(cursorHomePath, registered.path) });
  }
  candidates.push({ source: "local-symlink", path: join(cursorHomePath, "plugins/local", pluginId) });
  candidates.push({ source: "managed-directory", path: join(cursorHomePath, "plugins", pluginId) });
  return candidates;
}

export async function inspectComponent(installedRoot, component) {
  invariant(
    component.path.startsWith("plugin/"),
    `inventory component ${component.id} is not inside plugin/`,
  );
  const relativePath = component.path.slice("plugin/".length);
  // The inventory is repo-controlled, but this script reads a user directory:
  // never let a component path walk out of the installed plugin root.
  assertSafeRelativePath(relativePath, `inventory path for ${component.id}`);
  try {
    const bytes = await readFile(join(installedRoot, relativePath));
    const actualSha256 = sha256(bytes);
    return {
      id: component.id,
      kind: component.kind,
      relativePath,
      state: actualSha256 === component.sha256 ? "present-matching" : "present-modified",
      expectedSha256: component.sha256,
      actualSha256,
    };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return {
      id: component.id,
      kind: component.kind,
      relativePath,
      state: "missing",
      expectedSha256: component.sha256,
      actualSha256: null,
    };
  }
}

export function summarizeComponents(components) {
  const byKind = {};
  for (const component of components) {
    const bucket = byKind[component.kind] ?? { expected: 0, presentMatching: 0 };
    bucket.expected += 1;
    if (component.state === "present-matching") bucket.presentMatching += 1;
    byKind[component.kind] = bucket;
  }
  return {
    byKind,
    allPresentMatching: components.length > 0 &&
      components.every((component) => component.state === "present-matching"),
    unmatched: components
      .filter((component) => component.state !== "present-matching")
      .map((component) => ({ id: component.id, state: component.state })),
  };
}

export function evaluateTranscript(text) {
  return {
    sentinel: SENTINEL,
    observed: text.includes(SENTINEL),
    transcriptSha256: sha256(text),
  };
}

export async function collectEditorEvidence(options = {}) {
  const cursorHomePath = options.cursorHomePath ?? join(homedir(), ".cursor");
  const inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
  const pluginId = inventory.plugin.id;

  if (options.evidencePath) {
    const realCursorHome = await realpathAllowingMissingLeaf(cursorHomePath);
    const realEvidencePath = await realpathAllowingMissingLeaf(options.evidencePath);
    invariant(
      !isInside(realCursorHome, realEvidencePath),
      `--evidence must not point inside the Cursor home; this script never writes there. ` +
        `${options.evidencePath} resolves to ${realEvidencePath}, which is inside ${realCursorHome}.`,
    );
  }

  const homeMetadata = await statOrNull(cursorHomePath);
  invariant(
    homeMetadata !== null && homeMetadata.isDirectory(),
    `no Cursor home at ${cursorHomePath}. Install the plugin in Cursor first (Settings -> Customize -> Plugins), or pass --cursor-home.`,
  );

  const registry = await readJsonIfPresent(join(cursorHomePath, "plugins.json"));
  const candidates = resolveInstallCandidates({ cursorHomePath, pluginId, registry });
  let installation = null;
  for (const candidate of candidates) {
    const metadata = await statOrNull(candidate.path);
    if (metadata === null) continue;
    const manifest = await readJsonIfPresent(join(candidate.path, ".cursor-plugin/plugin.json"));
    if (manifest?.name !== pluginId) continue;
    installation = {
      source: candidate.source,
      path: candidate.path,
      isSymbolicLink: metadata.isSymbolicLink(),
      linkTarget: metadata.isSymbolicLink() ? await readlink(candidate.path) : null,
      realPath: await realpath(candidate.path),
      manifestVersion: typeof manifest.version === "string" ? manifest.version : null,
      registeredInPluginsJson: registry?.plugins?.[pluginId] !== undefined,
    };
    break;
  }
  invariant(
    installation !== null,
    `${pluginId} is not installed under ${cursorHomePath}. Checked: ${candidates.map((candidate) => candidate.path).join(", ")}. ` +
      "Install it through Cursor Settings -> Customize -> Plugins, or create the documented local-development symlink yourself (README.md:73-81). This script never creates it.",
  );

  const expected = inventory.components.filter((component) => LOADABLE_KINDS.includes(component.kind));
  invariant(expected.length > 0, "inventory lists no loadable components");
  const components = [];
  for (const component of expected) {
    components.push(await inspectComponent(installation.path, component));
  }
  components.sort((left, right) => left.id.localeCompare(right.id));
  const summary = summarizeComponents(components);
  invariant(
    summary.allPresentMatching,
    `installed components do not match the inventory: ${JSON.stringify(summary.unmatched)}. Reinstall the plugin in Cursor, then re-run.`,
  );

  const transcript = options.transcriptPath
    ? evaluateTranscript(await readFile(options.transcriptPath, "utf8"))
    : null;

  return {
    schemaVersion: SCHEMA_VERSION,
    artifact: ARTIFACT_KIND,
    capturedAt: new Date().toISOString(),
    command: "npm run plugin:editor:verify",
    readOnly: true,
    // Binds this artifact to the exact plugin bytes present at capture time so a
    // consumer can reject evidence describing a different plugin revision.
    pluginSourceSha256: await hashTree(pluginRoot),
    inventorySha256: sha256(await readFile(inventoryPath)),
    plugin: { id: pluginId, version: inventory.plugin.version },
    cursorHomePath,
    installation,
    components,
    summary,
    transcript,
    claims: {
      componentsInstalledOnDisk: {
        status: "observed",
        source: "read-only filesystem inspection of the Cursor home",
      },
      // On-disk presence is not loading. Nothing readable from the filesystem
      // proves the Editor parsed, listed, or invoked a component.
      editorComponentLoading: {
        status: transcript?.observed ? "operator-attested" : "not-proven",
        reason: transcript?.observed
          ? "An operator-supplied Editor transcript contains the capability-probe sentinel. This is an operator attestation, not an automated capture."
          : "Filesystem state cannot prove the Editor loaded or invoked a component. Invoke the capability-probe agent in Cursor, save the transcript, and re-run with --transcript.",
      },
    },
  };
}

async function main(argv) {
  const options = parseArguments(argv);
  const evidence = await collectEditorEvidence(options);
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  if (options.evidencePath) {
    await mkdir(dirname(options.evidencePath), { recursive: true });
    await writeFile(options.evidencePath, serialized, { mode: 0o600 });
  }
  process.stdout.write(serialized);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`Editor plugin loading verification failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

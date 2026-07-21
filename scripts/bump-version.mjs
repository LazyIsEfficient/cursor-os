import { realpathSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generatePluginInventory } from "./lib/repository-validator.mjs";

// Mirrors the SEMVER pattern enforced by scripts/lib/repository-validator.mjs.
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/u;

const PACKAGE_JSON = "package.json";
const PACKAGE_LOCK = "package-lock.json";
const PLUGIN_MANIFEST = "plugin/.cursor-plugin/plugin.json";
const MARKETPLACE = ".cursor-plugin/marketplace.json";
const INVENTORY = "plugin/.cursor-plugin/inventory.json";

// The authoritative field list is readVersionMetadata() in
// scripts/lib/release-package.mjs; labels match its mismatch messages so a
// failed bump names the same field the release parity check would name.
const VERSION_FIELDS = [
  {
    label: "package.json",
    file: PACKAGE_JSON,
    read: (document) => document.version,
    write: (document, version) => {
      document.version = version;
    },
  },
  {
    label: "package-lock.json",
    file: PACKAGE_LOCK,
    read: (document) => document.version,
    write: (document, version) => {
      document.version = version;
    },
  },
  {
    label: "package-lock.json root package",
    file: PACKAGE_LOCK,
    read: (document) => document.packages?.[""]?.version,
    write: (document, version) => {
      document.packages[""].version = version;
    },
  },
  {
    label: "plugin manifest",
    file: PLUGIN_MANIFEST,
    read: (document) => document.version,
    write: (document, version) => {
      document.version = version;
    },
  },
  {
    label: "marketplace metadata",
    file: MARKETPLACE,
    read: (document) => document.metadata?.version,
    write: (document, version) => {
      document.metadata.version = version;
    },
  },
  {
    label: "marketplace plugin",
    file: MARKETPLACE,
    read: (document, { pluginName }) => findMarketplacePlugin(document, pluginName)?.version,
    write: (document, version, { pluginName }) => {
      findMarketplacePlugin(document, pluginName).version = version;
    },
  },
  {
    label: "plugin inventory",
    file: INVENTORY,
    generated: true,
    read: (document) => document.plugin?.version,
  },
];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function findMarketplacePlugin(document, pluginName) {
  return document.plugins?.find(({ name }) => name === pluginName);
}

export function parseVersion(version, label) {
  const match = SEMVER.exec(typeof version === "string" ? version : "");
  invariant(
    match,
    `${label} must be semantic (major.minor.patch[-prerelease]), received ${version ?? "nothing"}`,
  );
  const [, major, minor, patch, prerelease] = match;
  return {
    release: [Number(major), Number(minor), Number(patch)],
    prerelease: prerelease === undefined ? null : prerelease.split("."),
  };
}

function comparePrereleaseIdentifiers(left, right) {
  const leftNumeric = /^\d+$/u.test(left);
  const rightNumeric = /^\d+$/u.test(right);
  if (leftNumeric && rightNumeric) return Number(left) - Number(right);
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return left < right ? -1 : (left > right ? 1 : 0);
}

export function compareVersions(left, right) {
  const first = parseVersion(left, "version");
  const second = parseVersion(right, "version");
  for (let index = 0; index < 3; index += 1) {
    const difference = first.release[index] - second.release[index];
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  if (first.prerelease === null && second.prerelease === null) return 0;
  if (first.prerelease === null) return 1;
  if (second.prerelease === null) return -1;
  const length = Math.max(first.prerelease.length, second.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = first.prerelease[index];
    const rightIdentifier = second.prerelease[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    const difference = comparePrereleaseIdentifiers(leftIdentifier, rightIdentifier);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}

async function readJsonDocument(repositoryRoot, file) {
  const path = join(repositoryRoot, file);
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`cannot read ${file}: ${error.message}`, { cause: error });
  }
  let document;
  try {
    document = JSON.parse(source);
  } catch (error) {
    throw new Error(`cannot parse ${file}: ${error.message}`, { cause: error });
  }
  // Refuse to rewrite anything whose on-disk bytes are not the canonical
  // two-space serialization: re-serializing would silently reformat the file,
  // and a reformatted package-lock.json is an unreviewable diff.
  invariant(
    `${JSON.stringify(document, null, 2)}\n` === source,
    `${file} is not canonically formatted (2-space indent, trailing newline); normalize it before bumping`,
  );
  return { path, source, document };
}

/**
 * Rewrites every version field the release parity check inspects, then
 * regenerates the plugin inventory. Restores every touched file if any step
 * fails, so a failed bump never leaves a half-bumped tree.
 */
export async function bumpVersion({ repositoryRoot, version, force = false }) {
  const root = resolve(repositoryRoot);
  parseVersion(version, "target version");

  const files = new Map();
  const writableFiles = [...new Set(
    VERSION_FIELDS.filter(({ generated }) => !generated).map(({ file }) => file),
  )];
  for (const file of writableFiles) files.set(file, await readJsonDocument(root, file));
  files.set(INVENTORY, await readJsonDocument(root, INVENTORY));

  const pluginName = files.get(PLUGIN_MANIFEST).document.name;
  invariant(
    typeof pluginName === "string" && pluginName.length > 0,
    "plugin manifest name is required to locate the marketplace plugin entry",
  );
  invariant(
    findMarketplacePlugin(files.get(MARKETPLACE).document, pluginName) !== undefined,
    `marketplace manifest has no plugin entry named ${pluginName}`,
  );

  const context = { pluginName };
  const currentVersion = files.get(PLUGIN_MANIFEST).document.version;
  parseVersion(currentVersion, "current plugin manifest version");
  const drifted = VERSION_FIELDS
    .map(({ label, file, read }) => ({ label, version: read(files.get(file).document, context) }))
    .filter(({ version: found }) => found !== currentVersion);

  const ordering = compareVersions(version, currentVersion);
  if (!force) {
    invariant(
      ordering !== 0,
      `version ${version} is already the current version; pass --force to rewrite it`,
    );
    invariant(
      ordering > 0,
      `version ${version} is lower than the current version ${currentVersion}; pass --force to downgrade`,
    );
  }

  const written = [];
  try {
    for (const field of VERSION_FIELDS) {
      if (field.generated) continue;
      field.write(files.get(field.file).document, version, context);
    }
    for (const file of writableFiles) {
      const target = files.get(file);
      await writeFile(target.path, `${JSON.stringify(target.document, null, 2)}\n`);
      written.push(target);
    }
    written.push(files.get(INVENTORY));
    await generatePluginInventory(root, { write: true });

    for (const field of VERSION_FIELDS) {
      const { document } = await readJsonDocument(root, field.file);
      const actual = field.read(document, context);
      invariant(
        actual === version,
        `bump did not apply to ${field.label}: found ${actual ?? "missing"}, expected ${version}`,
      );
    }
    return {
      previousVersion: currentVersion,
      version,
      fields: VERSION_FIELDS.map(({ label }) => label),
      drifted: drifted.map(({ label, version: found }) => ({ label, version: found ?? null })),
    };
  } catch (error) {
    await Promise.all(written.map(({ path, source }) => writeFile(path, source)));
    throw error;
  }
}

function parseArguments(argv) {
  let version;
  let force = false;
  for (const argument of argv) {
    if (argument === "--force") force = true;
    else if (argument.startsWith("-")) throw new Error(`unknown option ${argument}`);
    else if (version === undefined) version = argument;
    else throw new Error(`unexpected argument ${argument}`);
  }
  invariant(version !== undefined, "Usage: node scripts/bump-version.mjs <version> [--force]");
  return { version, force };
}

const modulePath = fileURLToPath(import.meta.url);

// import.meta.url is symlink-resolved but process.argv[1] is not, so both sides
// need realpath or the CLI silently no-ops behind a symlinked path.
function isDirectInvocation() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(modulePath);
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  const repositoryRoot = resolve(dirname(modulePath), "..");
  try {
    const result = await bumpVersion({ repositoryRoot, ...parseArguments(process.argv.slice(2)) });
    for (const { label, version: found } of result.drifted) {
      process.stderr.write(`Repaired version drift: ${label} was ${found ?? "missing"}\n`);
    }
    process.stdout.write(`${JSON.stringify({
      previousVersion: result.previousVersion,
      version: result.version,
      fields: result.fields,
    })}\n`);
  } catch (error) {
    process.stderr.write(`Version bump failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

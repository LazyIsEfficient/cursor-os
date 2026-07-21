import { createHash, randomUUID } from "node:crypto";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";

const STATE_DIRECTORY = ".cursor-harness-installs";
const CONFIG_FILE = "plugins.json";
const SHA256 = /^[a-f0-9]{64}$/u;
const PLUGIN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function normalizedExistingPath(path) {
  try {
    return await realpath(path);
  } catch (error) {
    if (error?.code === "ENOENT") return resolve(path);
    throw error;
  }
}

async function assertSafeCursorRoot(cursorRoot) {
  invariant(typeof cursorRoot === "string" && cursorRoot.length > 0, "cursorRoot must be explicit");
  const lexicalCandidate = resolve(cursorRoot);
  const lexicalActual = resolve(homedir(), ".cursor");
  const [candidate, actual] = await Promise.all([
    normalizedExistingPath(cursorRoot),
    normalizedExistingPath(lexicalActual),
  ]);
  const isWithin = (parent, child) => {
    const path = relative(parent, child);
    return path === "" || (path !== ".." && !path.startsWith(`..${sep}`));
  };
  invariant(
    !isWithin(lexicalActual, lexicalCandidate) && !isWithin(actual, candidate),
    "local install adapter refuses to mutate the actual user Cursor directory",
  );
}

function assertInside(parent, child, label) {
  const path = relative(resolve(parent), resolve(child));
  invariant(
    path === "" || (path !== ".." && !path.startsWith(`..${sep}`)),
    `${label} escapes the explicit Cursor root`,
  );
}

async function readManifest(sourcePlugin) {
  const path = join(sourcePlugin, ".cursor-plugin", "plugin.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`cannot read source plugin manifest: ${error.message}`, { cause: error });
  }
  invariant(
    manifest && typeof manifest.name === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(manifest.name),
    "source plugin manifest requires a kebab-case name",
  );
  invariant(typeof manifest.version === "string" && manifest.version.length > 0, "source plugin version is required");
  return manifest;
}

async function digestDirectory(directory) {
  const hash = createHash("sha256");
  async function visit(path) {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const candidate = join(path, entry.name);
      const relativePath = relative(directory, candidate).split(sep).join("/");
      invariant(!entry.isSymbolicLink(), `source plugin contains unsupported symbolic link ${relativePath}`);
      if (entry.isDirectory()) {
        hash.update(`directory:${relativePath}\0`);
        await visit(candidate);
      } else if (entry.isFile()) {
        hash.update(`file:${relativePath}\0`);
        hash.update(await readFile(candidate));
        hash.update("\0");
      }
    }
  }
  await visit(directory);
  return hash.digest("hex");
}

async function readState(path) {
  if (!(await pathExists(path))) return undefined;
  const state = JSON.parse(await readFile(path, "utf8"));
  invariant(
    state && typeof state === "object" && !Array.isArray(state),
    `local install state at ${path} must contain an object`,
  );
  invariant(
    state.schemaVersion === 1 || state.schemaVersion === 2,
    `unsupported local install state at ${path}`,
  );
  invariant(
    typeof state.pluginId === "string" && PLUGIN_ID.test(state.pluginId),
    "local install state pluginId must be kebab-case",
  );
  invariant(
    typeof state.originalDestinationExisted === "boolean",
    "local install state originalDestinationExisted must be boolean",
  );
  invariant(
    typeof state.originalConfigExisted === "boolean",
    "local install state originalConfigExisted must be boolean",
  );
  invariant(
    state.originalConfigExisted
      ? typeof state.originalConfigBase64 === "string"
      : state.originalConfigBase64 === null,
    "local install state originalConfigBase64 does not match originalConfigExisted",
  );
  invariant(
    state.sourceDigest === null || SHA256.test(state.sourceDigest),
    "local install state sourceDigest must be a SHA-256 digest or null",
  );
  invariant(
    state.installedVersion === undefined ||
      (typeof state.installedVersion === "string" && state.installedVersion.length > 0),
    "local install state installedVersion must be a non-empty string when present",
  );
  if (state.schemaVersion === 1) {
    invariant(
      state.managedConfigSha256 === null || SHA256.test(state.managedConfigSha256),
      "schema 1 managedConfigSha256 must be a SHA-256 digest or null",
    );
  } else {
    invariant(
      !Object.hasOwn(state, "managedConfigSha256"),
      "schema 2 local install state must not contain managedConfigSha256",
    );
  }
  return state;
}

function parseConfig(bytes, label = CONFIG_FILE) {
  let config;
  try {
    config = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`cannot parse ${label}: ${error.message}`, { cause: error });
  }
  invariant(
    config && typeof config === "object" && !Array.isArray(config),
    `${label} must contain an object`,
  );
  if (config.plugins !== undefined) {
    invariant(
      config.plugins && typeof config.plugins === "object" && !Array.isArray(config.plugins),
      `${label}.plugins must contain an object`,
    );
  }
  return config;
}

function configWithoutManagedRegistration(config, pluginId) {
  const unrelated = {
    ...config,
    plugins: { ...(config.plugins ?? {}) },
  };
  delete unrelated.plugins[pluginId];
  return unrelated;
}

function isExactRegistration(registration, destinationRelative, version) {
  return Boolean(
    registration &&
    typeof registration === "object" &&
    !Array.isArray(registration) &&
    Object.keys(registration).length === 2 &&
    registration.path === destinationRelative.split(sep).join("/") &&
    registration.version === version
  );
}

async function writeManagedConfig(configPath, manifest, destinationRelative) {
  let config = { version: 1, plugins: {} };
  if (await pathExists(configPath)) {
    config = parseConfig(await readFile(configPath));
    config.plugins ??= {};
  }
  config.plugins[manifest.name] = {
    path: destinationRelative.split(sep).join("/"),
    version: manifest.version,
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

async function hasExactManagedRegistration(configPath, manifest, destinationRelative) {
  if (!(await pathExists(configPath))) return false;
  let config;
  try {
    config = JSON.parse(await readFile(configPath, "utf8"));
  } catch {
    return false;
  }
  return isExactRegistration(
    config?.plugins?.[manifest.name],
    destinationRelative,
    manifest.version,
  );
}

export async function installLocalPlugin({ cursorRoot, sourcePlugin }) {
  await assertSafeCursorRoot(cursorRoot);
  invariant(typeof sourcePlugin === "string" && sourcePlugin.length > 0, "sourcePlugin must be explicit");
  const root = resolve(cursorRoot);
  const source = resolve(sourcePlugin);
  const sourceInfo = await stat(source);
  invariant(sourceInfo.isDirectory(), "sourcePlugin must be a directory");
  const manifest = await readManifest(source);
  const digest = await digestDirectory(source);

  const pluginsRoot = join(root, "plugins");
  const destination = join(pluginsRoot, manifest.name);
  const stateRoot = join(root, STATE_DIRECTORY, manifest.name);
  const statePath = join(stateRoot, "state.json");
  const backupPath = join(stateRoot, "original-plugin");
  const configPath = join(root, CONFIG_FILE);
  for (const path of [pluginsRoot, destination, stateRoot, backupPath, configPath]) {
    assertInside(root, path, basename(path));
  }

  await mkdir(root, { recursive: true });
  const existingState = await readState(statePath);
  let destinationDigest = null;
  if (await pathExists(destination)) {
    try {
      destinationDigest = await digestDirectory(destination);
    } catch (error) {
      if (!/unsupported symbolic link/u.test(error.message)) throw error;
    }
  }
  const destinationRelative = relative(root, destination);
  const registrationIsExact = await hasExactManagedRegistration(
    configPath,
    manifest,
    destinationRelative,
  );
  if (
    existingState?.sourceDigest === digest &&
    destinationDigest === digest &&
    registrationIsExact
  ) {
    return { pluginId: manifest.name, status: "unchanged", destination };
  }
  const repairing = existingState?.sourceDigest === digest;

  if (!existingState) {
    await mkdir(stateRoot, { recursive: true });
    const originalDestinationExisted = await pathExists(destination);
    if (originalDestinationExisted) await cp(destination, backupPath, { recursive: true });
    const originalConfigExisted = await pathExists(configPath);
    const originalConfig = originalConfigExisted ? await readFile(configPath) : undefined;
    await writeFile(statePath, `${JSON.stringify({
      schemaVersion: 2,
      pluginId: manifest.name,
      originalDestinationExisted,
      originalConfigExisted,
      originalConfigBase64: originalConfig?.toString("base64") ?? null,
      sourceDigest: null,
    }, null, 2)}\n`);
  } else {
    invariant(existingState.pluginId === manifest.name, "local install state plugin identity mismatch");
  }

  await mkdir(pluginsRoot, { recursive: true });
  const staging = join(pluginsRoot, `.${manifest.name}-stage-${randomUUID()}`);
  assertInside(root, staging, "install staging directory");
  try {
    await cp(source, staging, { recursive: true, errorOnExist: true });
    await rm(destination, { recursive: true, force: true });
    await rename(staging, destination);
    await writeManagedConfig(configPath, manifest, destinationRelative);
    const state = await readState(statePath);
    state.schemaVersion = 2;
    state.sourceDigest = digest;
    state.installedVersion = manifest.version;
    delete state.managedConfigSha256;
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }

  return {
    pluginId: manifest.name,
    status: repairing ? "repaired" : (existingState ? "upgraded" : "installed"),
    destination,
  };
}

export async function uninstallLocalPlugin({ cursorRoot, pluginId }) {
  await assertSafeCursorRoot(cursorRoot);
  invariant(
    typeof pluginId === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(pluginId),
    "pluginId must be kebab-case",
  );
  const root = resolve(cursorRoot);
  const stateRoot = join(root, STATE_DIRECTORY, pluginId);
  const statePath = join(stateRoot, "state.json");
  const state = await readState(statePath);
  if (!state) return { pluginId, status: "absent" };
  invariant(state.pluginId === pluginId, "local install state plugin identity mismatch");

  const destination = join(root, "plugins", pluginId);
  const backupPath = join(stateRoot, "original-plugin");
  const configPath = join(root, CONFIG_FILE);
  for (const path of [destination, backupPath, configPath]) assertInside(root, path, basename(path));

  const currentConfigExisted = await pathExists(configPath);
  const currentConfigBytes = currentConfigExisted ? await readFile(configPath) : null;
  invariant(
    !state.originalConfigExisted || typeof state.originalConfigBase64 === "string",
    "original plugin config backup is missing",
  );
  const originalConfigBytes = state.originalConfigExisted
    ? Buffer.from(state.originalConfigBase64, "base64")
    : null;
  const currentConfig = currentConfigBytes === null
    ? null
    : parseConfig(currentConfigBytes);
  const originalConfig = originalConfigBytes === null
    ? { version: 1, plugins: {} }
    : parseConfig(originalConfigBytes, `original ${CONFIG_FILE}`);
  const destinationRelative = relative(root, destination);
  const managedRegistrationIsExact = currentConfig !== null &&
    typeof state.installedVersion === "string" &&
    isExactRegistration(
      currentConfig.plugins?.[pluginId],
      destinationRelative,
      state.installedVersion,
    );
  const unrelatedConfigIsOriginal = currentConfig !== null &&
    isDeepStrictEqual(
      configWithoutManagedRegistration(currentConfig, pluginId),
      configWithoutManagedRegistration(originalConfig, pluginId),
    );
  const restoreOriginalConfigBytes = managedRegistrationIsExact && unrelatedConfigIsOriginal;
  let mergedConfigBytes;
  if (!restoreOriginalConfigBytes && currentConfig !== null) {
    currentConfig.plugins ??= {};
    const originalRegistration = originalConfig.plugins?.[pluginId];
    if (originalRegistration === undefined) delete currentConfig.plugins[pluginId];
    else currentConfig.plugins[pluginId] = originalRegistration;
    mergedConfigBytes = Buffer.from(`${JSON.stringify(currentConfig, null, 2)}\n`);
  }

  await rm(destination, { recursive: true, force: true });
  if (state.originalDestinationExisted) {
    invariant(await pathExists(backupPath), "original plugin backup is missing");
    await cp(backupPath, destination, { recursive: true });
  }

  if (restoreOriginalConfigBytes && originalConfigBytes !== null) {
    await writeFile(configPath, originalConfigBytes);
  } else if (restoreOriginalConfigBytes) {
    await rm(configPath, { force: true });
  } else if (mergedConfigBytes !== undefined) {
    await writeFile(configPath, mergedConfigBytes);
  } else if (originalConfigBytes !== null) {
    await writeFile(configPath, originalConfigBytes);
  }

  await rm(stateRoot, { recursive: true, force: true });
  const stateParent = join(root, STATE_DIRECTORY);
  if ((await readdir(stateParent)).length === 0) await rm(stateParent, { recursive: true });
  return { pluginId, status: "uninstalled" };
}

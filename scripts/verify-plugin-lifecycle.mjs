import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  installLocalPlugin,
  uninstallLocalPlugin,
} from "./lib/local-install-adapter.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePlugin = join(repositoryRoot, "plugin");

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

async function digestDirectory(directory) {
  const hash = createHash("sha256");
  async function visit(path) {
    for (const entry of (await readdir(path, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const candidate = join(path, entry.name);
      const relativePath = relative(directory, candidate).split(sep).join("/");
      invariant(!entry.isSymbolicLink(), `plugin source contains symbolic link ${relativePath}`);
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

function parseArguments(argv) {
  if (argv.length === 0) return {};
  invariant(argv.length === 2 && argv[0] === "--evidence", "usage: npm run plugin:lifecycle:verify -- [--evidence <path>]");
  return { evidencePath: resolve(argv[1]) };
}

const options = parseArguments(process.argv.slice(2));
const temporaryRoot = await mkdtemp(join(tmpdir(), "cursor-harness-lifecycle-"));
try {
  const cursorRoot = join(temporaryRoot, "cursor");
  await mkdir(cursorRoot);
  const installed = await installLocalPlugin({ cursorRoot, sourcePlugin });
  const unchanged = await installLocalPlugin({ cursorRoot, sourcePlugin });

  const configPath = join(cursorRoot, "plugins.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.plugins.concurrent = {
    path: "plugins/concurrent",
    version: "7.0.0",
  };
  delete config.plugins["cursor-harness"];
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const repaired = await installLocalPlugin({ cursorRoot, sourcePlugin });
  const removed = await uninstallLocalPlugin({ cursorRoot, pluginId: "cursor-harness" });

  invariant(!(await pathExists(join(cursorRoot, "plugins/cursor-harness"))), "managed plugin directory remains after removal");
  const remainingConfig = JSON.parse(await readFile(configPath, "utf8"));
  invariant(
    remainingConfig.plugins?.["cursor-harness"] === undefined,
    "managed plugin registry remains after removal",
  );
  invariant(
    remainingConfig.plugins?.concurrent?.path === "plugins/concurrent" &&
      remainingConfig.plugins.concurrent.version === "7.0.0",
    "unrelated plugin registry was lost during repair and removal",
  );
  invariant(!(await pathExists(join(cursorRoot, ".cursor-harness-installs"))), "local install state remains after removal");

  const evidence = {
    schemaVersion: "1.0.0",
    command: "npm run plugin:lifecycle:verify",
    temporaryCursorRoot: true,
    pluginSourceSha256: await digestDirectory(sourcePlugin),
    lifecycleStatuses: [
      installed.status,
      unchanged.status,
      repaired.status,
      removed.status,
    ],
    removalVerified: true,
    unrelatedRegistrationPreserved: true,
  };
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  if (options.evidencePath) {
    await mkdir(dirname(options.evidencePath), { recursive: true });
    await writeFile(options.evidencePath, serialized);
  }
  process.stdout.write(serialized);
} catch (error) {
  process.stderr.write(`Plugin lifecycle verification failed: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

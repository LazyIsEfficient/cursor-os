import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildRelease } from "./lib/release-package.mjs";

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== "--output-dir") throw new Error(`unknown option ${argument}`);
    const value = argv[++index];
    if (!value) throw new Error("--output-dir requires a path");
    options.outputDirectory = resolve(value);
  }
  return options;
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const result = await buildRelease({
    repositoryRoot,
    ...parseArguments(process.argv.slice(2)),
  });
  process.stdout.write(`${JSON.stringify({
    archive: result.archivePath,
    sha256: result.manifest.artifacts.archive.sha256,
    checksum: result.checksumPath,
    manifest: result.manifestPath,
  })}\n`);
} catch (error) {
  process.stderr.write(`Release packaging failed: ${error.message}\n`);
  process.exitCode = 1;
}

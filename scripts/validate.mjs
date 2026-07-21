import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateRepository } from "./lib/repository-validator.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const result = await validateRepository(repositoryRoot);
  process.stdout.write(
    `Validated ${result.plugin}: ${result.components.length} components; ${result.checks.length} deterministic checks passed.\n`,
  );
} catch (error) {
  process.stderr.write(`Validation failed: ${error.message}\n`);
  process.exitCode = 1;
}

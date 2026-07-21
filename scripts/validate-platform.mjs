import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  probeBlockingContract,
  validatePlatformLayout,
} from "./lib/platform-contract.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const layout = validatePlatformLayout(repositoryRoot);
const hooks = probeBlockingContract(repositoryRoot);

process.stdout.write(
  `Validated ${layout.pluginManifest}, ${layout.agents.length} agent, and hook blocking contracts (${hooks.jsonDenial.permission}/exit-${hooks.exitCodeDenial.exitCode}).\n`,
);

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  probeBlockingContract,
  probeCursorCli,
  validatePlatformLayout,
} from "./lib/platform-contract.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");

const report = {
  generatedAt: new Date().toISOString(),
  networkUsed: false,
  userConfigurationMutated: false,
  pluginDiscovery: validatePlatformLayout(repositoryRoot),
  hookBlocking: probeBlockingContract(repositoryRoot),
  cursorCli: probeCursorCli(),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

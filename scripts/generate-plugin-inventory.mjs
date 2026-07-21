import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generatePluginInventory } from "./lib/repository-validator.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inventory = await generatePluginInventory(repositoryRoot, { write: true });

process.stdout.write(`Generated inventory for ${inventory.components.length} plugin components.\n`);

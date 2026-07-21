import { resolve } from "node:path";

import {
  installLocalPlugin,
  uninstallLocalPlugin,
} from "./lib/local-install-adapter.mjs";

const [operation, cursorRoot, sourceOrPlugin = "cursor-harness"] = process.argv.slice(2);

if (!["install", "uninstall"].includes(operation) || !cursorRoot) {
  process.stderr.write(
    "Usage: node scripts/local-install.mjs <install|uninstall> <explicit-cursor-root> [source-plugin|plugin-id]\n",
  );
  process.exitCode = 2;
} else {
  const result = operation === "install"
    ? await installLocalPlugin({
        cursorRoot: resolve(cursorRoot),
        sourcePlugin: resolve(sourceOrPlugin === "cursor-harness" ? "plugin" : sourceOrPlugin),
      })
    : await uninstallLocalPlugin({
        cursorRoot: resolve(cursorRoot),
        pluginId: sourceOrPlugin,
      });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

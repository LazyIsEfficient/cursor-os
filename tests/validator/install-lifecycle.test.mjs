import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  installLocalPlugin,
  uninstallLocalPlugin,
} from "../../scripts/lib/local-install-adapter.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePlugin = join(root, "plugin");

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function withCursorRoot(run) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "cursor-harness-install-"));
  const cursorRoot = join(temporaryRoot, "cursor");
  await mkdir(cursorRoot);
  try {
    await run({ temporaryRoot, cursorRoot });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

test("clean install and uninstall only touch the explicit temporary Cursor root", async () => {
  await withCursorRoot(async ({ cursorRoot }) => {
    const installed = await installLocalPlugin({ cursorRoot, sourcePlugin });

    assert.equal(installed.status, "installed");
    assert.equal(
      JSON.parse(await readFile(join(cursorRoot, "plugins.json"), "utf8")).plugins["cursor-harness"].path,
      "plugins/cursor-harness",
    );
    assert.equal(
      JSON.parse(await readFile(join(cursorRoot, "plugins/cursor-harness/.cursor-plugin/plugin.json"), "utf8")).name,
      "cursor-harness",
    );

    const removed = await uninstallLocalPlugin({ cursorRoot, pluginId: "cursor-harness" });
    assert.equal(removed.status, "uninstalled");
    assert.equal(await exists(join(cursorRoot, "plugins/cursor-harness")), false);
    assert.equal(await exists(join(cursorRoot, "plugins.json")), false);
  });
});

test("reinstalling an unchanged plugin is idempotent", async () => {
  await withCursorRoot(async ({ cursorRoot }) => {
    await installLocalPlugin({ cursorRoot, sourcePlugin });
    const before = await readFile(join(cursorRoot, "plugins/cursor-harness/agents/engineer.md"), "utf8");

    const reinstalled = await installLocalPlugin({ cursorRoot, sourcePlugin });

    assert.equal(reinstalled.status, "unchanged");
    assert.equal(
      await readFile(join(cursorRoot, "plugins/cursor-harness/agents/engineer.md"), "utf8"),
      before,
    );
  });
});

test("reinstall repairs removed managed registration and preserves unrelated entries", async () => {
  await withCursorRoot(async ({ cursorRoot }) => {
    const originalConfig = '{"version":1,"plugins":{"user":{"path":"user-plugin","version":"9"}}}\n';
    await writeFile(join(cursorRoot, "plugins.json"), originalConfig);
    await installLocalPlugin({ cursorRoot, sourcePlugin });
    const configPath = join(cursorRoot, "plugins.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    delete config.plugins["cursor-harness"];
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const repaired = await installLocalPlugin({ cursorRoot, sourcePlugin });
    const repairedConfig = JSON.parse(await readFile(configPath, "utf8"));

    assert.equal(repaired.status, "repaired");
    assert.deepEqual(repairedConfig.plugins.user, { path: "user-plugin", version: "9" });
    assert.deepEqual(repairedConfig.plugins["cursor-harness"], {
      path: "plugins/cursor-harness",
      version: "0.1.0",
    });
    await uninstallLocalPlugin({ cursorRoot, pluginId: "cursor-harness" });
    assert.equal(await readFile(configPath, "utf8"), originalConfig);
  });
});

test("uninstall preserves an unrelated registration added before managed registration repair", async () => {
  await withCursorRoot(async ({ cursorRoot }) => {
    const configPath = join(cursorRoot, "plugins.json");
    await installLocalPlugin({ cursorRoot, sourcePlugin });
    const concurrent = JSON.parse(await readFile(configPath, "utf8"));
    concurrent.plugins.concurrent = {
      path: "plugins/concurrent",
      version: "7.0.0",
    };
    delete concurrent.plugins["cursor-harness"];
    await writeFile(configPath, `${JSON.stringify(concurrent, null, 2)}\n`);

    const repaired = await installLocalPlugin({ cursorRoot, sourcePlugin });
    assert.equal(repaired.status, "repaired");
    await uninstallLocalPlugin({ cursorRoot, pluginId: "cursor-harness" });

    assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")), {
      version: 1,
      plugins: {
        concurrent: {
          path: "plugins/concurrent",
          version: "7.0.0",
        },
      },
    });
  });
});

test("uninstall restores an original managed registration after repair without losing unrelated entries", async () => {
  await withCursorRoot(async ({ cursorRoot }) => {
    const configPath = join(cursorRoot, "plugins.json");
    const originalManaged = { path: "plugins/original-harness", version: "0.0.1" };
    await writeFile(configPath, `${JSON.stringify({
      version: 1,
      plugins: { "cursor-harness": originalManaged },
    }, null, 2)}\n`);
    await installLocalPlugin({ cursorRoot, sourcePlugin });
    const concurrent = JSON.parse(await readFile(configPath, "utf8"));
    concurrent.plugins.concurrent = { path: "plugins/concurrent", version: "7.0.0" };
    concurrent.plugins["cursor-harness"] = { path: "plugins/forged", version: "999.0.0" };
    await writeFile(configPath, `${JSON.stringify(concurrent, null, 2)}\n`);

    const repaired = await installLocalPlugin({ cursorRoot, sourcePlugin });
    assert.equal(repaired.status, "repaired");
    await uninstallLocalPlugin({ cursorRoot, pluginId: "cursor-harness" });

    assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")).plugins, {
      "cursor-harness": originalManaged,
      concurrent: { path: "plugins/concurrent", version: "7.0.0" },
    });
  });
});

test("reinstall repairs wrong managed registration path and version", async () => {
  await withCursorRoot(async ({ cursorRoot }) => {
    await installLocalPlugin({ cursorRoot, sourcePlugin });
    const configPath = join(cursorRoot, "plugins.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.plugins["cursor-harness"] = {
      path: "plugins/forged",
      version: "999.0.0",
    };
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const repaired = await installLocalPlugin({ cursorRoot, sourcePlugin });

    assert.equal(repaired.status, "repaired");
    assert.deepEqual(
      JSON.parse(await readFile(configPath, "utf8")).plugins["cursor-harness"],
      { path: "plugins/cursor-harness", version: "0.1.0" },
    );
  });
});

test("reinstall repairs a tampered destination and preserves original restoration", async () => {
  await withCursorRoot(async ({ cursorRoot }) => {
    const destination = join(cursorRoot, "plugins/cursor-harness");
    await mkdir(destination, { recursive: true });
    await writeFile(join(destination, "original.txt"), "restore me\n");
    const originalConfig = '{"version":1,"plugins":{"user":{"path":"user-plugin"}}}\n';
    await writeFile(join(cursorRoot, "plugins.json"), originalConfig);
    await installLocalPlugin({ cursorRoot, sourcePlugin });

    const installedEngineer = join(destination, "agents/engineer.md");
    await writeFile(installedEngineer, "tampered\n");
    await writeFile(join(destination, "injected.txt"), "untrusted\n");
    const repaired = await installLocalPlugin({ cursorRoot, sourcePlugin });

    assert.equal(repaired.status, "repaired");
    assert.equal(
      await readFile(installedEngineer, "utf8"),
      await readFile(join(sourcePlugin, "agents/engineer.md"), "utf8"),
    );
    assert.equal(await exists(join(destination, "injected.txt")), false);

    await uninstallLocalPlugin({ cursorRoot, pluginId: "cursor-harness" });
    assert.equal(await readFile(join(destination, "original.txt"), "utf8"), "restore me\n");
    assert.equal(await readFile(join(cursorRoot, "plugins.json"), "utf8"), originalConfig);
  });
});

test("upgrade replaces the managed plugin tree", async () => {
  await withCursorRoot(async ({ temporaryRoot, cursorRoot }) => {
    const upgradedSource = join(temporaryRoot, "upgraded-plugin");
    await cp(sourcePlugin, upgradedSource, { recursive: true });
    await installLocalPlugin({ cursorRoot, sourcePlugin: upgradedSource });
    await writeFile(join(cursorRoot, "plugins/cursor-harness/stale.txt"), "stale");

    const manifestPath = join(upgradedSource, ".cursor-plugin/plugin.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.version = "0.2.0";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(join(upgradedSource, "replacement.txt"), "replacement");
    const upgraded = await installLocalPlugin({ cursorRoot, sourcePlugin: upgradedSource });

    assert.equal(upgraded.status, "upgraded");
    assert.equal(await exists(join(cursorRoot, "plugins/cursor-harness/stale.txt")), false);
    assert.equal(await readFile(join(cursorRoot, "plugins/cursor-harness/replacement.txt"), "utf8"), "replacement");
  });
});

test("uninstall after upgrade and repair preserves unrelated entries when no managed entry originally existed", async () => {
  await withCursorRoot(async ({ temporaryRoot, cursorRoot }) => {
    const upgradedSource = join(temporaryRoot, "upgraded-plugin");
    await cp(sourcePlugin, upgradedSource, { recursive: true });
    const configPath = join(cursorRoot, "plugins.json");
    await installLocalPlugin({ cursorRoot, sourcePlugin: upgradedSource });
    const concurrent = JSON.parse(await readFile(configPath, "utf8"));
    concurrent.plugins.concurrent = { path: "plugins/concurrent", version: "7.0.0" };
    await writeFile(configPath, `${JSON.stringify(concurrent, null, 2)}\n`);

    const manifestPath = join(upgradedSource, ".cursor-plugin/plugin.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.version = "0.2.0";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.equal(
      (await installLocalPlugin({ cursorRoot, sourcePlugin: upgradedSource })).status,
      "upgraded",
    );
    await writeFile(join(cursorRoot, "plugins/cursor-harness/agents/engineer.md"), "tampered\n");
    assert.equal(
      (await installLocalPlugin({ cursorRoot, sourcePlugin: upgradedSource })).status,
      "repaired",
    );

    await uninstallLocalPlugin({ cursorRoot, pluginId: "cursor-harness" });
    assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")).plugins, {
      concurrent: { path: "plugins/concurrent", version: "7.0.0" },
    });
  });
});

test("uninstall after upgrade and repair restores an original managed entry and preserves unrelated entries", async () => {
  await withCursorRoot(async ({ temporaryRoot, cursorRoot }) => {
    const upgradedSource = join(temporaryRoot, "upgraded-plugin");
    await cp(sourcePlugin, upgradedSource, { recursive: true });
    const configPath = join(cursorRoot, "plugins.json");
    const originalManaged = { path: "plugins/original-harness", version: "0.0.1" };
    await writeFile(configPath, `${JSON.stringify({
      version: 1,
      plugins: { "cursor-harness": originalManaged },
    }, null, 2)}\n`);
    await installLocalPlugin({ cursorRoot, sourcePlugin: upgradedSource });
    const concurrent = JSON.parse(await readFile(configPath, "utf8"));
    concurrent.plugins.concurrent = { path: "plugins/concurrent", version: "7.0.0" };
    await writeFile(configPath, `${JSON.stringify(concurrent, null, 2)}\n`);

    const manifestPath = join(upgradedSource, ".cursor-plugin/plugin.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.version = "0.2.0";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.equal(
      (await installLocalPlugin({ cursorRoot, sourcePlugin: upgradedSource })).status,
      "upgraded",
    );
    const repairedConfig = JSON.parse(await readFile(configPath, "utf8"));
    delete repairedConfig.plugins["cursor-harness"];
    await writeFile(configPath, `${JSON.stringify(repairedConfig, null, 2)}\n`);
    assert.equal(
      (await installLocalPlugin({ cursorRoot, sourcePlugin: upgradedSource })).status,
      "repaired",
    );

    await uninstallLocalPlugin({ cursorRoot, pluginId: "cursor-harness" });
    assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")).plugins, {
      "cursor-harness": originalManaged,
      concurrent: { path: "plugins/concurrent", version: "7.0.0" },
    });
  });
});

test("uninstall restores pre-existing plugin content and config byte-for-byte", async () => {
  await withCursorRoot(async ({ cursorRoot }) => {
    const destination = join(cursorRoot, "plugins/cursor-harness");
    await mkdir(destination, { recursive: true });
    await writeFile(join(destination, "user-content.txt"), "keep me\n");
    const originalConfig = '{\n  "version": 7,\n  "plugins": {"other": {"path": "elsewhere"}},\n  "userSetting": true\n}\n';
    await writeFile(join(cursorRoot, "plugins.json"), originalConfig);

    await installLocalPlugin({ cursorRoot, sourcePlugin });
    assert.equal(await exists(join(destination, "user-content.txt")), false);
    await uninstallLocalPlugin({ cursorRoot, pluginId: "cursor-harness" });

    assert.equal(await readFile(join(destination, "user-content.txt"), "utf8"), "keep me\n");
    assert.equal(await readFile(join(cursorRoot, "plugins.json"), "utf8"), originalConfig);
  });
});

test("uninstall preserves concurrent unrelated registrations while removing its managed entry", async () => {
  await withCursorRoot(async ({ cursorRoot }) => {
    const configPath = join(cursorRoot, "plugins.json");
    await installLocalPlugin({ cursorRoot, sourcePlugin });
    const concurrent = JSON.parse(await readFile(configPath, "utf8"));
    concurrent.plugins.concurrent = {
      path: "plugins/concurrent",
      version: "7.0.0",
    };
    concurrent.concurrentSetting = true;
    await writeFile(configPath, `${JSON.stringify(concurrent, null, 2)}\n`);

    await uninstallLocalPlugin({ cursorRoot, pluginId: "cursor-harness" });

    assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")), {
      version: 1,
      plugins: {
        concurrent: {
          path: "plugins/concurrent",
          version: "7.0.0",
        },
      },
      concurrentSetting: true,
    });
  });
});

test("uninstall restores the original managed registration without losing concurrent entries", async () => {
  await withCursorRoot(async ({ cursorRoot }) => {
    const configPath = join(cursorRoot, "plugins.json");
    const originalManaged = { path: "plugins/original-harness", version: "0.0.1" };
    await writeFile(configPath, `${JSON.stringify({
      version: 1,
      plugins: { "cursor-harness": originalManaged },
    }, null, 2)}\n`);
    await installLocalPlugin({ cursorRoot, sourcePlugin });
    const concurrent = JSON.parse(await readFile(configPath, "utf8"));
    concurrent.plugins.concurrent = { path: "plugins/concurrent", version: "2.0.0" };
    await writeFile(configPath, `${JSON.stringify(concurrent, null, 2)}\n`);

    await uninstallLocalPlugin({ cursorRoot, pluginId: "cursor-harness" });
    const restored = JSON.parse(await readFile(configPath, "utf8"));

    assert.deepEqual(restored.plugins["cursor-harness"], originalManaged);
    assert.deepEqual(restored.plugins.concurrent, {
      path: "plugins/concurrent",
      version: "2.0.0",
    });
  });
});

test("local install state uses schema 2 without a whole-config digest", async () => {
  await withCursorRoot(async ({ cursorRoot }) => {
    await installLocalPlugin({ cursorRoot, sourcePlugin });
    const state = JSON.parse(await readFile(
      join(cursorRoot, ".cursor-harness-installs/cursor-harness/state.json"),
      "utf8",
    ));

    assert.equal(state.schemaVersion, 2);
    assert.equal("managedConfigSha256" in state, false);
  });
});

test("uninstall accepts validated schema 1 state", async () => {
  await withCursorRoot(async ({ cursorRoot }) => {
    await installLocalPlugin({ cursorRoot, sourcePlugin });
    const statePath = join(cursorRoot, ".cursor-harness-installs/cursor-harness/state.json");
    const state = JSON.parse(await readFile(statePath, "utf8"));
    state.schemaVersion = 1;
    state.managedConfigSha256 = "0".repeat(64);
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);

    const removed = await uninstallLocalPlugin({ cursorRoot, pluginId: "cursor-harness" });

    assert.equal(removed.status, "uninstalled");
    assert.equal(await exists(join(cursorRoot, "plugins.json")), false);
  });
});

test("schema 1 state rejects an invalid legacy whole-config digest", async () => {
  await withCursorRoot(async ({ cursorRoot }) => {
    await installLocalPlugin({ cursorRoot, sourcePlugin });
    const statePath = join(cursorRoot, ".cursor-harness-installs/cursor-harness/state.json");
    const state = JSON.parse(await readFile(statePath, "utf8"));
    state.schemaVersion = 1;
    state.managedConfigSha256 = "invalid";
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);

    await assert.rejects(
      uninstallLocalPlugin({ cursorRoot, pluginId: "cursor-harness" }),
      /schema 1 managedConfigSha256 must be a SHA-256 digest or null/u,
    );
  });
});

test("lifecycle verifier exercises clean install repair and removal with deterministic evidence", () => {
  const first = spawnSync(process.execPath, [
    join(root, "scripts/verify-plugin-lifecycle.mjs"),
  ], { cwd: root, encoding: "utf8" });
  const second = spawnSync(process.execPath, [
    join(root, "scripts/verify-plugin-lifecycle.mjs"),
  ], { cwd: root, encoding: "utf8" });

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  const firstEvidence = JSON.parse(first.stdout);
  const secondEvidence = JSON.parse(second.stdout);
  assert.deepEqual(firstEvidence, secondEvidence);
  assert.deepEqual(firstEvidence.lifecycleStatuses, [
    "installed",
    "unchanged",
    "repaired",
    "uninstalled",
  ]);
  assert.equal(firstEvidence.command, "npm run plugin:lifecycle:verify");
  assert.equal(firstEvidence.temporaryCursorRoot, true);
  assert.match(firstEvidence.pluginSourceSha256, /^[a-f0-9]{64}$/u);
  assert.equal(firstEvidence.unrelatedRegistrationPreserved, true);
});

test("adapter refuses the actual user Cursor directory and its descendants", async () => {
  for (const cursorRoot of [
    resolve(homedir(), ".cursor"),
    resolve(homedir(), ".cursor", "temporary-test"),
  ]) {
    await assert.rejects(
      installLocalPlugin({ cursorRoot, sourcePlugin }),
      /refuses to mutate the actual user Cursor directory/iu,
    );
  }
});

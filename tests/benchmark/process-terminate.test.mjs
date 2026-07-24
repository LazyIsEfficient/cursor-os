import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, chmod, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import test from "node:test";

import {
  spawnCaptured,
  terminateActiveCapturedChildrenSync,
} from "../../benchmark/lib/process.mjs";

async function makeHangBinary(root) {
  const path = join(root, "hang.mjs");
  await writeFile(
    path,
    "#!/usr/bin/env node\nsetInterval(() => {}, 1000);\n",
    { mode: 0o700 },
  );
  await chmod(path, 0o700);
  return path;
}

test("terminateActiveCapturedChildrenSync kills an in-flight detached spawnCaptured child", async () => {
  const root = await mkdtemp(join(tmpdir(), "captured-terminate-"));
  try {
    const binary = await makeHangBinary(root);
    const cwd = join(root, "cwd");
    await mkdir(cwd);

    const runPromise = spawnCaptured({
      executable: binary,
      arguments: [],
      cwd,
      env: process.env,
      timeoutMs: 60_000,
      stdoutPath: join(root, "stdout.log"),
      stderrPath: join(root, "stderr.log"),
    });
    // Allow spawn + tracking to land before we terminate.
    await setTimeout(150);
    terminateActiveCapturedChildrenSync();
    const result = await runPromise;
    assert.equal(result.signal, "SIGKILL");
    assert.equal(result.exitCode, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

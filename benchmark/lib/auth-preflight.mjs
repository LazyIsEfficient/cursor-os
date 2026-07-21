import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { buildCursorChildEnvironment } from "./adapters.mjs";
import { spawnCaptured } from "./process.mjs";
import { copyTree } from "./util.mjs";
import { validateCursorConfigTemplate } from "./workspace.mjs";

export async function runCursorAuthenticationPreflight({
  binary = "agent",
  cursorConfigTemplatePath,
  timeoutMs = 30_000,
  prefixArguments = [],
}) {
  const template = await validateCursorConfigTemplate(cursorConfigTemplatePath);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "cursor-benchmark-preflight-"));
  const cursorHomePath = join(temporaryRoot, "cursor-home");
  try {
    await mkdir(cursorHomePath);
    await copyTree(template.realPath, cursorHomePath);
    const result = await spawnCaptured({
      executable: binary,
      arguments: [...prefixArguments, "status"],
      cwd: dirname(cursorHomePath),
      env: buildCursorChildEnvironment({ cursorHomePath }),
      timeoutMs,
      stdoutPath: join(temporaryRoot, "status.stdout.log"),
      stderrPath: join(temporaryRoot, "status.stderr.log"),
    });
    if (result.timedOut) throw new Error("Cursor CLI authentication preflight timed out");
    if (result.exitCode !== 0) {
      throw new Error("Cursor CLI authentication preflight failed; refresh the protected config template");
    }
    return { status: "authenticated", templatePath: template.path };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

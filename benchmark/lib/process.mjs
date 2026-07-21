import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { dirname } from "node:path";

import { invariant } from "./util.mjs";

const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;

export async function spawnCaptured({
  executable,
  arguments: argv,
  cwd,
  env,
  timeoutMs,
  stdoutPath,
  stderrPath,
  stdoutMirrorPath,
}) {
  invariant(typeof executable === "string" && executable.length > 0, "executable is required");
  invariant(Array.isArray(argv) && argv.every((value) => typeof value === "string"), "arguments must be strings");
  invariant(Number.isInteger(timeoutMs) && timeoutMs > 0, "timeoutMs must be positive");
  await Promise.all([
    mkdir(dirname(stdoutPath), { recursive: true }),
    mkdir(dirname(stderrPath), { recursive: true }),
    ...(stdoutMirrorPath ? [mkdir(dirname(stdoutMirrorPath), { recursive: true })] : []),
  ]);

  const stdoutFile = createWriteStream(stdoutPath, { flags: "a", mode: 0o600 });
  const stderrFile = createWriteStream(stderrPath, { flags: "a", mode: 0o600 });
  const stdoutMirror = stdoutMirrorPath
    ? createWriteStream(stdoutMirrorPath, { flags: "a", mode: 0o600 })
    : null;
  const stdout = [];
  const stderr = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let timedOut = false;
  const startedAt = performance.now();

  return await new Promise((resolve, reject) => {
    let childError = null;
    const detached = process.platform !== "win32";
    const child = spawn(executable, argv, {
      cwd,
      env,
      shell: false,
      detached,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const terminate = (signal) => {
      try {
        if (detached && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch (error) {
        if (error?.code !== "ESRCH") throw error;
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      terminate("SIGTERM");
      setTimeout(() => terminate("SIGKILL"), 250).unref();
    }, timeoutMs);
    timer.unref();

    const capture = (chunks, currentBytes, chunk) => {
      const remaining = MAX_CAPTURE_BYTES - currentBytes;
      if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
      return currentBytes + chunk.length;
    };
    child.stdout.on("data", (chunk) => {
      stdoutFile.write(chunk);
      stdoutMirror?.write(chunk);
      stdoutBytes = capture(stdout, stdoutBytes, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderrFile.write(chunk);
      stderrBytes = capture(stderr, stderrBytes, chunk);
    });
    child.once("error", (error) => {
      childError = error;
    });
    child.once("close", async (exitCode, signal) => {
      clearTimeout(timer);
      await Promise.all([
        new Promise((done) => stdoutFile.end(done)),
        new Promise((done) => stderrFile.end(done)),
        ...(stdoutMirror ? [new Promise((done) => stdoutMirror.end(done))] : []),
      ]);
      if (childError) {
        reject(childError);
        return;
      }
      resolve({
        exitCode,
        signal,
        timedOut,
        durationMs: performance.now() - startedAt,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        stdoutTruncated: stdoutBytes > MAX_CAPTURE_BYTES,
        stderrTruncated: stderrBytes > MAX_CAPTURE_BYTES,
      });
    });
  });
}

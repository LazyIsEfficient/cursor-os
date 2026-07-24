import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { dirname } from "node:path";

import { invariant } from "./util.mjs";

const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;

// Live spawnCaptured children. Signal handlers that must rm credential copies cannot leave a
// detached CLI holding cwd/open files under that tree — on some runners that races rmSync and
// leaves the probe/trial root behind after the parent dies of the re-raised signal.
const activeCapturedChildren = new Map();

function trackCapturedChild(child, { detached }) {
  if (!child?.pid) return () => {};
  activeCapturedChildren.set(child.pid, { detached: Boolean(detached) });
  return () => {
    activeCapturedChildren.delete(child.pid);
  };
}

/**
 * Synchronously SIGKILL every in-flight spawnCaptured child (process group when detached).
 * Intended for credential signal handlers that must unwind copies before re-raising.
 */
export function terminateActiveCapturedChildrenSync() {
  for (const [pid, { detached }] of activeCapturedChildren) {
    try {
      if (detached) process.kill(-pid, "SIGKILL");
      else process.kill(pid, "SIGKILL");
    } catch (error) {
      if (error?.code === "ESRCH") continue;
      try {
        process.kill(pid, "SIGKILL");
      } catch (fallbackError) {
        if (fallbackError?.code !== "ESRCH") {
          process.stderr.write(`failed to terminate captured child ${pid}: ${fallbackError.message}\n`);
        }
      }
    }
  }
  activeCapturedChildren.clear();
}

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
    const untrack = trackCapturedChild(child, { detached });
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
      untrack();
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

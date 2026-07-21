import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const workspace = process.argv[2];
const { readDocument } = await import(pathToFileURL(`${workspace}/src/file-store.mjs`));
const sandbox = await mkdtemp(join(tmpdir(), "file-store-security-"));
const root = join(sandbox, "root");
const outside = join(sandbox, "protected-value.txt");

async function mustReject(path, label) {
  let rejected = false;
  try {
    await readDocument(root, path);
  } catch {
    rejected = true;
  }
  assert.ok(rejected, `${label} remained exploitable`);
}

try {
  await mkdir(root);
  await writeFile(join(root, "allowed.txt"), "allowed");
  await writeFile(outside, "security-canary-value");
  await symlink(outside, join(root, "linked.txt"));

  assert.equal(await readDocument(root, "allowed.txt"), "allowed");
  await mustReject(join("..", basename(outside)), "parent traversal");
  await mustReject(outside, "absolute-path escape");
  await mustReject(join(root, "linked.txt"), "symlink escape");
  assert.equal(dirname(outside), sandbox);
} finally {
  await rm(sandbox, { recursive: true, force: true });
}

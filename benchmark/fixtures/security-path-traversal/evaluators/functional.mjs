import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const workspace = process.argv[2];
const { readDocument } = await import(pathToFileURL(`${workspace}/src/file-store.mjs`));
const root = await mkdtemp(join(tmpdir(), "file-store-functional-"));

try {
  await mkdir(join(root, "nested"));
  await writeFile(join(root, "nested", "document.txt"), "expected document");
  assert.equal(await readDocument(root, "nested/document.txt"), "expected document");
} finally {
  await rm(root, { recursive: true, force: true });
}

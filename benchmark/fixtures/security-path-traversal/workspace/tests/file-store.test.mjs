import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readDocument } from "../src/file-store.mjs";

test("reads a document below the configured root", async () => {
  const root = await mkdtemp(join(tmpdir(), "file-store-public-"));
  try {
    await mkdir(join(root, "docs"));
    await writeFile(join(root, "docs", "welcome.txt"), "welcome");
    assert.equal(await readDocument(root, "docs/welcome.txt"), "welcome");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

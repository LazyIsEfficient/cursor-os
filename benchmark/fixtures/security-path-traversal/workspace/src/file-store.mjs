import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function readDocument(rootDirectory, userPath) {
  return readFile(join(rootDirectory, userPath), "utf8");
}

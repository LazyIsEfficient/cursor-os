import { readFile } from "node:fs/promises";
import { join } from "node:path";

const workspace = process.argv[2];
const expected = process.argv[3] ?? "correct";
const actual = (await readFile(join(workspace, "answer.txt"), "utf8")).trim();
process.stdout.write(`${JSON.stringify({ expected, actual })}\n`);
if (actual !== expected) process.exitCode = 1;

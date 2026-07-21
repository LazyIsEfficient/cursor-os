import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const workspace = process.argv[2];
const failures = [];

if (!workspace) {
  console.error("workspace argument is required");
  process.exit(2);
}
async function load(path) {
  try {
    return await import(pathToFileURL(join(workspace, path)).href);
  } catch (error) {
    failures.push(`${path}: ${error.message}`);
    return {};
  }
}

function check(label, assertion) {
  try {
    assertion();
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
  }
}

const slug = await load("src/slugify.mjs");
const title = await load("src/title-case.mjs");
const words = await load("src/word-count.mjs");
check("slugify basic", () => assert.equal(slug.slugify("  Hello, WORLD!  "), "hello-world"));
check("slugify runs", () => assert.equal(slug.slugify("A___B / C"), "a-b-c"));
check("slugify empty", () => assert.equal(slug.slugify("---"), ""));
check("titleCase basic", () => assert.equal(title.titleCase("  hELLo   wORLD "), "Hello World"));
check("titleCase punctuation", () => assert.equal(title.titleCase("api-FIRST"), "Api-first"));
check("titleCase empty", () => assert.equal(title.titleCase("  "), ""));
check("wordCount whitespace", () => assert.equal(words.wordCount(" one\ttwo\nthree "), 3));
check("wordCount empty", () => assert.equal(words.wordCount("   "), 0));

if (failures.length > 0) {
  console.error("acceptance failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("acceptance passed");

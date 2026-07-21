import { createHash } from "node:crypto";
import { appendFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function assertSafeRelativePath(path, label = "path") {
  invariant(typeof path === "string" && path.length > 0, `${label} must be a non-empty relative path`);
  invariant(!isAbsolute(path), `${label} must be relative`);
  invariant(!path.includes("\\"), `${label} must use forward slashes`);
  invariant(!path.split("/").includes(".."), `${label} must not contain ..`);
  invariant(!path.split("/").includes("."), `${label} must not contain . segments`);
  invariant(!path.includes("\0"), `${label} must not contain NUL`);
}

export function resolveInside(root, path, label = "path") {
  assertSafeRelativePath(path, label);
  const target = resolve(root, path);
  const rel = relative(resolve(root), target);
  invariant(rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)), `${label} escapes root`);
  return target;
}

export async function assertRealPathInside(root, target, label = "path") {
  const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(target)]);
  const rel = relative(realRoot, realTarget);
  invariant(
    rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)),
    `${label} escapes root through a symbolic link`,
  );
}

export async function readJson(path, label = path) {
  const bytes = await readFile(path, "utf8");
  try {
    return JSON.parse(bytes);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`, { cause: error });
  }
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function hashFile(path) {
  return sha256(await readFile(path));
}

export async function listFiles(root) {
  const rootMetadata = await lstat(root);
  invariant(rootMetadata.isDirectory() && !rootMetadata.isSymbolicLink(), `file tree root must be a real directory: ${root}`);
  const result = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      const metadata = await lstat(path);
      invariant(!metadata.isSymbolicLink(), `symbolic links are not allowed: ${path}`);
      if (metadata.isDirectory()) await visit(path);
      else if (metadata.isFile()) result.push(path);
    }
  }
  await visit(root);
  return result;
}

export async function hashTree(root) {
  const entries = [];
  for (const path of await listFiles(root)) {
    const bytes = await readFile(path);
    entries.push(`${relative(root, path).split(sep).join("/")}\0${bytes.length}\0${sha256(bytes)}\n`);
  }
  return sha256(entries.join(""));
}

// Defaults to owner-only because the credential-copying callers are the ones that must not
// get this wrong; callers copying non-sensitive trees pass their own mode explicitly.
export async function copyTree(source, destination, { mode = 0o600 } = {}) {
  await mkdir(destination, { recursive: true });
  for (const sourcePath of await listFiles(source)) {
    const relativePath = relative(source, sourcePath);
    const destinationPath = join(destination, relativePath);
    await mkdir(dirname(destinationPath), { recursive: true });
    await writeFile(destinationPath, await readFile(sourcePath), { flag: "wx", mode });
  }
}

export function globPatternToRegExp(pattern) {
  assertSafeRelativePath(pattern, "path pattern");
  invariant(!pattern.includes("***"), "path pattern must not contain ***");
  let expression = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character !== "*") {
      expression += /[.+^${}()|[\]\\]/u.test(character) ? `\\${character}` : character;
      continue;
    }
    if (pattern[index + 1] !== "*") {
      expression += "[^/]*";
      continue;
    }
    index += 1;
    if (pattern[index + 1] === "/") {
      expression += "(?:.*/)?";
      index += 1;
    } else {
      expression += ".*";
    }
  }
  return new RegExp(`^${expression}$`, "u");
}

export async function matchingFiles(root, patterns) {
  const matchers = patterns.map(globPatternToRegExp);
  const files = await listFiles(root);
  return files.filter((path) => matchers.some((matcher) => matcher.test(relative(root, path).split(sep).join("/"))));
}

export async function appendJsonLine(path, record) {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`, { encoding: "utf8", flag: "a", mode: 0o600 });
}

export async function writeNewFile(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
}

export function unavailable(reason) {
  return { status: "unavailable", reason };
}

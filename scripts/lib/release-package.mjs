import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";

import { validateRepository } from "./repository-validator.mjs";

const BLOCK_SIZE = 512;
const FIXED_FILE_MODE = 0o644;
const FIXED_DIRECTORY_MODE = 0o755;
const RELEASE_SCHEMA_VERSION = "1.0.0";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`cannot read ${label}: ${error.message}`, { cause: error });
  }
}

function normalizePath(path) {
  return path.split(sep).join("/");
}

function compareText(left, right) {
  return left < right ? -1 : (left > right ? 1 : 0);
}

function assertArchivePath(path, label) {
  invariant(typeof path === "string" && path.length > 0, `${label} is required`);
  invariant(!isAbsolute(path), `${label} must be relative`);
  invariant(!path.split("/").includes(".."), `${label} must not traverse`);
  invariant(!path.includes("\0"), `${label} must not contain NUL`);
}

async function listRegularFiles(root) {
  const absoluteRoot = resolve(root);
  const realRoot = await realpath(absoluteRoot);
  const files = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => compareText(left.name, right.name))) {
      const path = join(directory, entry.name);
      const info = await lstat(path);
      const relativePath = normalizePath(relative(absoluteRoot, path));
      invariant(!info.isSymbolicLink(), `consumer payload contains unsupported symbolic link ${relativePath}`);
      const realPath = await realpath(path);
      const containment = relative(realRoot, realPath);
      invariant(
        containment === "" || (containment !== ".." && !containment.startsWith(`..${sep}`) && !isAbsolute(containment)),
        `consumer payload path escapes plugin root: ${relativePath}`,
      );
      if (info.isDirectory()) await visit(path);
      else {
        invariant(info.isFile(), `consumer payload contains unsupported entry ${relativePath}`);
        files.push({ sourcePath: path, destination: relativePath });
      }
    }
  }

  await visit(absoluteRoot);
  return files;
}

function writeString(buffer, offset, length, value, label) {
  const bytes = Buffer.from(value, "utf8");
  invariant(bytes.length <= length, `${label} exceeds tar field capacity`);
  bytes.copy(buffer, offset);
}

function writeOctal(buffer, offset, length, value, label) {
  invariant(Number.isSafeInteger(value) && value >= 0, `${label} must be a non-negative integer`);
  const digits = value.toString(8);
  invariant(digits.length <= length - 1, `${label} exceeds tar field capacity`);
  writeString(buffer, offset, length, `${digits.padStart(length - 1, "0")}\0`, label);
}

function splitTarPath(path) {
  const bytes = Buffer.byteLength(path);
  if (bytes <= 100) return { name: path, prefix: "" };
  for (let index = path.lastIndexOf("/"); index > 0; index = path.lastIndexOf("/", index - 1)) {
    const prefix = path.slice(0, index);
    const name = path.slice(index + 1);
    if (Buffer.byteLength(name) <= 100 && Buffer.byteLength(prefix) <= 155) return { name, prefix };
  }
  throw new Error(`archive path exceeds ustar capacity: ${path}`);
}

function createTarHeader({ path, mode, size, type }) {
  assertArchivePath(path, "archive entry path");
  const header = Buffer.alloc(BLOCK_SIZE);
  const { name, prefix } = splitTarPath(path);
  writeString(header, 0, 100, name, "tar name");
  writeOctal(header, 100, 8, mode, "tar mode");
  writeOctal(header, 108, 8, 0, "tar uid");
  writeOctal(header, 116, 8, 0, "tar gid");
  writeOctal(header, 124, 12, size, "tar size");
  writeOctal(header, 136, 12, 0, "tar mtime");
  header.fill(0x20, 148, 156);
  header[156] = type.charCodeAt(0);
  writeString(header, 257, 6, "ustar\0", "tar magic");
  writeString(header, 263, 2, "00", "tar version");
  writeString(header, 265, 32, "root", "tar owner");
  writeString(header, 297, 32, "root", "tar group");
  writeString(header, 345, 155, prefix, "tar prefix");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  const checksumDigits = checksum.toString(8);
  invariant(checksumDigits.length <= 6, "tar checksum exceeds field capacity");
  writeString(header, 148, 8, `${checksumDigits.padStart(6, "0")}\0 `, "tar checksum");
  return header;
}

function padToBlock(bytes) {
  const remainder = bytes.length % BLOCK_SIZE;
  return remainder === 0 ? Buffer.alloc(0) : Buffer.alloc(BLOCK_SIZE - remainder);
}

function buildTar(entries) {
  const chunks = [];
  for (const entry of entries) {
    chunks.push(createTarHeader(entry));
    if (entry.type === "0") {
      chunks.push(entry.bytes, padToBlock(entry.bytes));
    }
  }
  chunks.push(Buffer.alloc(BLOCK_SIZE * 2));
  return Buffer.concat(chunks);
}

function deterministicGzip(bytes) {
  const compressed = gzipSync(bytes, { level: 9, mtime: 0 });
  compressed.fill(0, 4, 8);
  compressed[9] = 0xff;
  return compressed;
}

function directoriesFor(paths) {
  const directories = new Set();
  for (const path of paths) {
    const parts = path.split("/");
    for (let length = 1; length < parts.length; length += 1) {
      directories.add(parts.slice(0, length).join("/"));
    }
  }
  return [...directories].sort();
}

async function readVersionMetadata(repositoryRoot) {
  const [packageJson, packageLock, pluginManifest, marketplace, inventory] = await Promise.all([
    readJson(join(repositoryRoot, "package.json"), "package.json"),
    readJson(join(repositoryRoot, "package-lock.json"), "package-lock.json"),
    readJson(join(repositoryRoot, "plugin/.cursor-plugin/plugin.json"), "plugin manifest"),
    readJson(join(repositoryRoot, ".cursor-plugin/marketplace.json"), "marketplace manifest"),
    readJson(join(repositoryRoot, "plugin/.cursor-plugin/inventory.json"), "plugin inventory"),
  ]);
  const marketplacePlugin = marketplace.plugins?.find(({ name }) => name === pluginManifest.name);
  const versions = {
    "package.json": packageJson.version,
    "package-lock.json": packageLock.version,
    "package-lock.json root package": packageLock.packages?.[""]?.version,
    "plugin manifest": pluginManifest.version,
    "marketplace metadata": marketplace.metadata?.version,
    "marketplace plugin": marketplacePlugin?.version,
    "plugin inventory": inventory.plugin?.version,
  };
  const expected = pluginManifest.version;
  for (const [source, version] of Object.entries(versions)) {
    invariant(version === expected, `release version mismatch: ${source}=${version ?? "missing"}; expected ${expected}`);
  }
  invariant(packageJson.name === pluginManifest.name, "release package and plugin names must match");
  invariant(packageJson.license === "MIT" && pluginManifest.license === "MIT", "release license metadata must be MIT");
  invariant(
    packageJson.author === "Cursor Harness contributors" &&
      pluginManifest.author?.name === "Cursor Harness contributors" &&
      marketplace.owner?.name === "Cursor Harness contributors",
    "release attribution must be Cursor Harness contributors",
  );
  invariant(
    packageJson.repository?.url === "https://github.com/LazyIsEfficient/cursor-os" &&
      pluginManifest.repository === "https://github.com/LazyIsEfficient/cursor-os",
    "release repository metadata must identify https://github.com/LazyIsEfficient/cursor-os",
  );
  return { name: pluginManifest.name, version: expected };
}

async function consumerFiles(repositoryRoot) {
  const pluginRoot = join(repositoryRoot, "plugin");
  const files = await listRegularFiles(pluginRoot);
  files.push({ sourcePath: join(repositoryRoot, "LICENSE"), destination: "LICENSE" });
  const destinations = new Set();
  for (const file of files) {
    assertArchivePath(file.destination, "consumer destination");
    invariant(!destinations.has(file.destination), `duplicate consumer destination ${file.destination}`);
    destinations.add(file.destination);
  }
  return files.sort((left, right) => compareText(left.destination, right.destination));
}

export async function buildRelease({
  repositoryRoot,
  outputDirectory = join(repositoryRoot, "dist"),
} = {}) {
  const root = resolve(repositoryRoot);
  await validateRepository(root);
  const { name, version } = await readVersionMetadata(root);
  const archiveRoot = `${name}-${version}`;
  const sources = await consumerFiles(root);
  const files = await Promise.all(sources.map(async ({ sourcePath, destination }) => {
    const bytes = await readFile(sourcePath);
    return {
      path: destination,
      archivePath: `${archiveRoot}/${destination}`,
      bytes,
      size: bytes.length,
      sha256: sha256(bytes),
      mode: FIXED_FILE_MODE,
    };
  }));
  const tarEntries = [
    ...directoriesFor(files.map(({ archivePath }) => archivePath)).map((path) => ({
      path: `${path}/`,
      mode: FIXED_DIRECTORY_MODE,
      size: 0,
      type: "5",
    })),
    ...files.map(({ archivePath, bytes, mode, size }) => ({
      path: archivePath,
      mode,
      size,
      type: "0",
      bytes,
    })),
  ].sort((left, right) => compareText(left.path, right.path));
  const archiveBytes = deterministicGzip(buildTar(tarEntries));
  const archiveName = `${archiveRoot}.tar.gz`;
  const checksum = sha256(archiveBytes);
  const checksumName = `${archiveName}.sha256`;
  const manifestName = `${archiveRoot}.release.json`;
  const manifest = {
    schemaVersion: RELEASE_SCHEMA_VERSION,
    name,
    version,
    archiveRoot,
    artifacts: {
      archive: {
        file: archiveName,
        bytes: archiveBytes.length,
        sha256: checksum,
      },
      checksum: {
        file: checksumName,
        algorithm: "sha256",
      },
    },
    files: files.map(({ path, size, sha256: fileSha256, mode }) => ({
      path,
      bytes: size,
      sha256: fileSha256,
      mode: mode.toString(8).padStart(4, "0"),
    })),
  };

  const output = resolve(outputDirectory);
  await mkdir(output, { recursive: true });
  const archivePath = join(output, archiveName);
  const checksumPath = join(output, checksumName);
  const manifestPath = join(output, manifestName);
  await Promise.all([
    writeFile(archivePath, archiveBytes, { mode: FIXED_FILE_MODE }),
    writeFile(checksumPath, `${checksum}  ${archiveName}\n`, { mode: FIXED_FILE_MODE }),
    writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: FIXED_FILE_MODE }),
  ]);
  return { archivePath, checksumPath, manifestPath, manifest };
}

function readTarString(buffer, offset, length) {
  const field = buffer.subarray(offset, offset + length);
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString("utf8");
}

function readTarOctal(buffer, offset, length, label) {
  const source = readTarString(buffer, offset, length).trim();
  invariant(/^[0-7]+$/u.test(source), `invalid ${label} in tar header`);
  return Number.parseInt(source, 8);
}

export function readReleaseArchive(archiveBytes) {
  const tar = gunzipSync(archiveBytes);
  const entries = [];
  for (let offset = 0; offset + BLOCK_SIZE <= tar.length;) {
    const header = tar.subarray(offset, offset + BLOCK_SIZE);
    if (header.every((byte) => byte === 0)) break;
    const name = readTarString(header, 0, 100);
    const prefix = readTarString(header, 345, 155);
    const path = prefix ? `${prefix}/${name}` : name;
    const size = readTarOctal(header, 124, 12, "size");
    const type = String.fromCharCode(header[156] || 0x30);
    const mode = readTarOctal(header, 100, 8, "mode");
    const mtime = readTarOctal(header, 136, 12, "mtime");
    assertArchivePath(path.replace(/\/$/u, ""), "tar entry path");
    const dataOffset = offset + BLOCK_SIZE;
    invariant(dataOffset + size <= tar.length, `truncated tar entry ${path}`);
    entries.push({ path, type, mode, mtime, bytes: tar.subarray(dataOffset, dataOffset + size) });
    offset = dataOffset + Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
  }
  return entries;
}

export async function extractReleaseArchive({ archivePath, destination }) {
  const root = resolve(destination);
  await mkdir(root, { recursive: true });
  for (const entry of readReleaseArchive(await readFile(archivePath))) {
    const outputPath = resolve(root, entry.path);
    const containment = relative(root, outputPath);
    invariant(
      containment !== ".." && !containment.startsWith(`..${sep}`) && !isAbsolute(containment),
      `tar entry escapes extraction root: ${entry.path}`,
    );
    if (entry.type === "5") await mkdir(outputPath, { recursive: true, mode: entry.mode });
    else {
      invariant(entry.type === "0", `unsupported tar entry type ${entry.type}`);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, entry.bytes, { mode: entry.mode });
    }
  }
}

import { createHash } from "node:crypto";
import {
  access,
  readFile,
  readdir,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const INVENTORY_PATH = "plugin/.cursor-plugin/inventory.json";
const COMPONENT_EXTENSIONS = new Set([".md", ".mdc", ".markdown"]);
const MANIFEST_COMPONENT_FIELDS = new Set(["agents", "commands", "hooks", "rules", "skills"]);
const DOCUMENTED_COMPONENT_DOCS = ["README.md", "plugin/README.md"];
// Prose component lists drift silently from the shipped plugin. Each documented
// kind is fenced by markers so the claim is checked against the inventory
// instead of against one exact sentence, which would fail on harmless edits.
const DOCUMENTED_COMPONENT_KINDS = new Map([
  ["agent", "agents"],
  ["command", "commands"],
  ["skill", "skills"],
]);
const DOCUMENTED_COUNT_WORDS = new Map([
  ["zero", 0],
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12],
  ["thirteen", 13],
  ["fourteen", 14],
  ["fifteen", 15],
  ["sixteen", 16],
  ["seventeen", 17],
  ["eighteen", 18],
  ["nineteen", 19],
  ["twenty", 20],
]);
const MARKETPLACE_FIELDS = new Set(["metadata", "name", "owner", "plugins"]);
const MARKETPLACE_PLUGIN_FIELDS = new Set([
  "description",
  "keywords",
  "name",
  "source",
  "version",
]);
const PLUGIN_MANIFEST_FIELDS = new Set([
  "agents",
  "author",
  "commands",
  "description",
  "homepage",
  "hooks",
  "keywords",
  "license",
  "mcpServers",
  "name",
  "repository",
  "rules",
  "skills",
  "version",
]);

const FRONTMATTER_CONTRACTS = {
  agent: {
    required: new Set(["description", "name"]),
    allowed: new Set(["description", "is_background", "model", "name", "readonly"]),
  },
  rule: {
    required: new Set(["alwaysApply", "description"]),
    allowed: new Set(["alwaysApply", "description"]),
  },
  skill: {
    required: new Set(["description", "name"]),
    allowed: new Set(["description", "name"]),
  },
  command: {
    required: new Set(["description"]),
    allowed: new Set(["description", "name"]),
  },
};

// Role-derived readonly classification, mirroring
// tests/workflows/orchestration-contract.test.mjs. `readonly` is a capability
// grant, so it is keyed off the agent's role rather than sniffed out of body
// phrasing: rewording a body must not hand a review agent write access, and
// adding the flag to an implementation agent must not silently break it. The
// rule is bidirectional and the two sets must exactly cover plugin/agents.
export const READONLY_AGENTS = new Set([
  "adversarial-claims-reviewer",
  "capability-probe",
  "code-reviewer",
  "library-investigator",
  "security-reviewer",
]);
export const WRITING_AGENTS = new Set([
  "engineer",
  "godot-engineer",
  "phaser-engineer",
  "rust-engineer",
]);

// capability-probe is a deliberate minimal discovery sentinel: its whole
// contract is returning one fixed string so a human can confirm Cursor loaded
// custom agents at all. It legitimately has no brief and no scope fields, so it
// is excluded from the brief contract BY NAME -- never by a loose predicate
// such as "short body" or "no scope fields", which a gutted agent would also
// satisfy. Its own shape is asserted separately in the orchestration contract.
export const SENTINEL_AGENTS = new Set(["capability-probe"]);

// The named scope fields a cold-context brief must declare. Exported so
// tests/workflows/orchestration-contract.test.mjs consumes this one definition
// instead of keeping a copy that can silently drift from the shipping gate.
export const BRIEF_SCOPE_FIELDS = ["files_read", "files_write", "dependencies", "conflicts"];

// Agents that audit a document or the plugin's own component files rather than
// reviewing a diff. They have no write scope to declare, so they require only
// `files_read`. Listed BY NAME and fail-closed: every other agent -- including
// every other readonly reviewer -- must declare the full brief scope, so being
// classified readonly can never by itself drop write-scope enforcement.
export const AUDIT_ONLY_AGENTS = new Set([
  "adversarial-claims-reviewer",
  "library-investigator",
]);

const PLATFORM_CAPABILITIES = [
  {
    capability: "cli-stream-json",
    environment: "cli-local",
    status: "unverified",
    evidence: "Run npm run probe; capability depends on the installed Cursor CLI.",
  },
  {
    capability: "command-hook-blocking",
    environment: "editor-local",
    status: "unverified",
    evidence: "Local hook contracts pass; editor enforcement requires a manual probe.",
  },
  {
    capability: "custom-agent-discovery",
    environment: "editor-local",
    status: "unverified",
    evidence: "Files satisfy discovery contracts; editor loading requires a manual probe.",
  },
  {
    capability: "parallel-subagent-events",
    environment: "editor-local",
    status: "unverified",
    evidence: "No live parallel subagent hook event has been captured.",
  },
  {
    capability: "plugin-loading",
    environment: "editor-local",
    status: "unverified",
    evidence: "Repository layout is valid; installed editor loading requires a manual probe.",
  },
  {
    capability: "token-usage",
    environment: "cli-local",
    status: "unavailable",
    evidence: "Documented stream-json output does not guarantee token usage fields.",
  },
];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function assertObject(value, label) {
  invariant(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
}

function assertAllowedFields(value, allowed, label) {
  for (const key of Object.keys(value)) {
    invariant(allowed.has(key), `${label} has unsupported field ${key}`);
  }
}

function assertRequiredString(value, key, label) {
  invariant(
    typeof value[key] === "string" && value[key].trim().length > 0,
    `${label}.${key} must be a non-empty string`,
  );
}

function assertSafeRelativePath(path, label) {
  invariant(typeof path === "string" && path.length > 0, `${label} must be a non-empty relative path`);
  invariant(!isAbsolute(path), `${label} must be relative`);
  invariant(!path.split(/[\\/]/u).includes(".."), `${label} must not traverse outside its root`);
}

function assertInside(parent, child, label) {
  const path = relative(resolve(parent), resolve(child));
  invariant(
    path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path)),
    `${label} escapes its root`,
  );
}

async function assertExistingInside(parent, child, label) {
  assertInside(parent, child, label);
  const [realParent, realChild] = await Promise.all([realpath(parent), realpath(child)]);
  assertInside(realParent, realChild, label);
}

async function readJson(path, label = path) {
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`${label} cannot be read: ${error.message}`, { cause: error });
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`, { cause: error });
  }
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function listFiles(directory) {
  if (!(await pathExists(directory))) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function parseFrontmatter(markdown, path) {
  const lines = markdown.split(/\r?\n/u);
  invariant(lines[0] === "---", `${path} must begin with YAML frontmatter`);
  const end = lines.indexOf("---", 1);
  invariant(end > 1, `${path} must close YAML frontmatter`);
  const fields = {};
  for (const line of lines.slice(1, end)) {
    if (!line.trim()) continue;
    const separator = line.indexOf(":");
    invariant(separator > 0, `${path} has unsupported frontmatter syntax: ${line}`);
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    invariant(/^[A-Za-z_][A-Za-z0-9_-]*$/u.test(key), `${path} has invalid frontmatter field ${key}`);
    invariant(!Object.hasOwn(fields, key), `${path} repeats frontmatter field ${key}`);
    invariant(value.length > 0, `${path} frontmatter field ${key} must not be empty`);
    fields[key] = value;
  }
  return { fields, body: lines.slice(end + 1).join("\n") };
}

async function validateManifests(repositoryRoot) {
  const marketplacePath = join(repositoryRoot, ".cursor-plugin/marketplace.json");
  const marketplace = await readJson(marketplacePath, "marketplace manifest");
  assertObject(marketplace, "marketplace manifest");
  assertAllowedFields(marketplace, MARKETPLACE_FIELDS, "marketplace manifest");
  assertRequiredString(marketplace, "name", "marketplace manifest");
  invariant(KEBAB_CASE.test(marketplace.name), "marketplace manifest name must be kebab-case");
  assertObject(marketplace.owner, "marketplace manifest owner");
  assertRequiredString(marketplace.owner, "name", "marketplace manifest owner");
  invariant(Array.isArray(marketplace.plugins) && marketplace.plugins.length > 0, "marketplace plugins are required");

  const names = new Set();
  for (const entry of marketplace.plugins) {
    assertObject(entry, "marketplace plugin");
    assertAllowedFields(entry, MARKETPLACE_PLUGIN_FIELDS, "marketplace plugin");
    for (const field of ["name", "source", "version"]) assertRequiredString(entry, field, "marketplace plugin");
    invariant(KEBAB_CASE.test(entry.name), `marketplace plugin name ${entry.name} must be kebab-case`);
    invariant(SEMVER.test(entry.version), `marketplace plugin ${entry.name} version must be semantic`);
    invariant(!names.has(entry.name), `marketplace plugin name ${entry.name} is duplicated`);
    names.add(entry.name);
    assertSafeRelativePath(entry.source, "plugin source");
  }
  invariant(marketplace.plugins.length === 1, "this repository must contain exactly one marketplace plugin");
  assertObject(marketplace.metadata, "marketplace manifest metadata");
  for (const field of ["description", "version"]) {
    assertRequiredString(marketplace.metadata, field, "marketplace manifest metadata");
  }
  invariant(SEMVER.test(marketplace.metadata.version), "marketplace metadata version must be semantic");

  const entry = marketplace.plugins[0];
  const pluginRoot = resolve(repositoryRoot, entry.source);
  await assertExistingInside(repositoryRoot, pluginRoot, "plugin source");
  invariant((await stat(pluginRoot)).isDirectory(), "plugin source must resolve to a directory");

  const manifestPath = join(pluginRoot, ".cursor-plugin/plugin.json");
  const manifest = await readJson(manifestPath, "plugin manifest");
  assertObject(manifest, "plugin manifest");
  assertAllowedFields(manifest, PLUGIN_MANIFEST_FIELDS, "plugin manifest");
  for (const field of ["name", "version", "description"]) assertRequiredString(manifest, field, "plugin manifest");
  invariant(KEBAB_CASE.test(manifest.name), "plugin manifest name must be kebab-case");
  invariant(SEMVER.test(manifest.version), "plugin manifest version must be semantic");
  invariant(manifest.name === entry.name, "marketplace and plugin manifest names must match");
  invariant(manifest.version === entry.version, "marketplace and plugin manifest versions must match");
  invariant(
    manifest.version === marketplace.metadata.version,
    "marketplace metadata and plugin manifest versions must match",
  );
  assertObject(manifest.author, "plugin manifest author");
  assertRequiredString(manifest.author, "name", "plugin manifest author");
  for (const field of ["homepage", "repository", "license"]) {
    assertRequiredString(manifest, field, "plugin manifest");
  }
  invariant(
    marketplace.owner.name === manifest.author.name,
    "marketplace owner and plugin author attribution must match",
  );
  invariant(entry.description === manifest.description, "marketplace and plugin descriptions must match");
  invariant(
    JSON.stringify(entry.keywords) === JSON.stringify(manifest.keywords),
    "marketplace and plugin keywords must match",
  );

  for (const field of MANIFEST_COMPONENT_FIELDS) {
    if (manifest[field] === undefined) continue;
    const paths = Array.isArray(manifest[field]) ? manifest[field] : [manifest[field]];
    invariant(paths.length > 0, `plugin manifest ${field} must not be empty`);
    for (const path of paths) {
      assertSafeRelativePath(path, `plugin manifest ${field} path`);
      await assertExistingInside(pluginRoot, resolve(pluginRoot, path), `plugin manifest ${field} path`);
    }
  }

  return { marketplace, entry, pluginRoot, manifest, manifestPath };
}

function configuredPaths(pluginRoot, manifest, field, fallback) {
  if (manifest[field] === undefined) return [join(pluginRoot, fallback)];
  const paths = Array.isArray(manifest[field]) ? manifest[field] : [manifest[field]];
  return paths.map((path) => resolve(pluginRoot, path));
}

async function filesFromConfiguredPaths(paths, extensions) {
  const files = [];
  for (const path of paths) {
    if (!(await pathExists(path))) continue;
    const info = await stat(path);
    const candidates = info.isDirectory() ? await listFiles(path) : [path];
    files.push(...candidates.filter((candidate) => extensions.has(extname(candidate))));
  }
  return [...new Set(files)].sort();
}

async function discoverComponents(repositoryRoot, pluginRoot, manifest) {
  const components = [];
  const add = (kind, path, id) => components.push({
    id,
    kind,
    path: relative(repositoryRoot, path).split(sep).join("/"),
    absolutePath: path,
  });

  for (const path of await filesFromConfiguredPaths(
    configuredPaths(pluginRoot, manifest, "agents", "agents"),
    COMPONENT_EXTENSIONS,
  )) {
    add("agent", path, basenameWithoutExtension(path));
  }

  for (const path of await filesFromConfiguredPaths(
    configuredPaths(pluginRoot, manifest, "rules", "rules"),
    new Set([".mdc"]),
  )) {
    add("rule", path, basenameWithoutExtension(path));
  }

  for (const path of await filesFromConfiguredPaths(
    configuredPaths(pluginRoot, manifest, "commands", "commands"),
    COMPONENT_EXTENSIONS,
  )) {
    add("command", path, basenameWithoutExtension(path));
  }

  const skillRoots = configuredPaths(pluginRoot, manifest, "skills", "skills");
  for (const skillRoot of skillRoots) {
    if (!(await pathExists(skillRoot))) continue;
    const info = await stat(skillRoot);
    const files = info.isDirectory() ? await listFiles(skillRoot) : [skillRoot];
    for (const path of files.filter((candidate) => COMPONENT_EXTENSIONS.has(extname(candidate)))) {
      if (path.endsWith(`${sep}SKILL.md`) || path === skillRoot) {
        add("skill", path, path === skillRoot ? basenameWithoutExtension(path) : dirname(path).split(sep).at(-1));
      } else {
        const relativeReference = relative(pluginRoot, path)
          .replace(/\.[^.]+$/u, "")
          .split(sep)
          .join("-");
        add("reference", path, relativeReference);
      }
    }
  }

  const hookPaths = configuredPaths(pluginRoot, manifest, "hooks", "hooks/hooks.json");
  for (const path of hookPaths) {
    if (!(await pathExists(path))) continue;
    const info = await stat(path);
    const files = info.isDirectory()
      ? (await listFiles(path)).filter((candidate) => candidate.endsWith(".json"))
      : [path];
    for (const hook of files) add("hook", hook, basenameWithoutExtension(hook));
  }

  for (const path of await filesFromConfiguredPaths(
    [join(pluginRoot, "scripts")],
    new Set([".cjs", ".js", ".mjs"]),
  )) {
    add("script", path, basenameWithoutExtension(path));
  }

  // Code-unit ordering, matching listFiles at :286 and the determinism
  // assertion in tests/validator/validator.test.mjs. localeCompare sorts by
  // primary alphabetic weight, so it placed `assets/…` and `references/…`
  // before a sibling `SKILL.md`, while code-unit ordering puts `SKILL.md`
  // first ('S' < 'a'). Latent until skills began shipping subdirectories.
  components.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  const paths = new Set();
  const ids = new Set();
  for (const component of components) {
    await assertExistingInside(pluginRoot, component.absolutePath, `component ${component.path}`);
    invariant(!paths.has(component.path), `component path ${component.path} is discovered more than once`);
    paths.add(component.path);
    invariant(KEBAB_CASE.test(component.id), `component ${component.path} id must be kebab-case`);
    const identity = `${component.kind}:${component.id}`;
    invariant(!ids.has(identity), `component identity ${identity} is duplicated`);
    ids.add(identity);
  }
  invariant(components.length > 0, "component discovery found no plugin components");
  return components;
}

function basenameWithoutExtension(path) {
  const name = path.split(sep).at(-1);
  return name.slice(0, name.length - extname(name).length);
}

async function validateFrontmatter(components) {
  const discoveredAgents = new Set(
    components.filter(({ kind }) => kind === "agent").map(({ id }) => id),
  );
  for (const id of [...READONLY_AGENTS, ...WRITING_AGENTS]) {
    invariant(discoveredAgents.has(id), `classified agent ${id} is no longer discovered; update the role sets`);
  }

  for (const component of components) {
    const contract = FRONTMATTER_CONTRACTS[component.kind];
    if (!contract) continue;
    const markdown = await readFile(component.absolutePath, "utf8");
    const { fields, body } = parseFrontmatter(markdown, component.path);
    for (const field of Object.keys(fields)) {
      invariant(
        contract.allowed.has(field),
        `${component.path} has unsupported frontmatter field ${field}`,
      );
    }
    for (const field of contract.required) {
      invariant(Object.hasOwn(fields, field), `${component.path} is missing required frontmatter field ${field}`);
    }
    invariant(KEBAB_CASE.test(component.id), `${component.path} path name must be kebab-case`);
    if (fields.name !== undefined) {
      invariant(KEBAB_CASE.test(fields.name), `${component.path} frontmatter name must be kebab-case`);
      invariant(
        fields.name === component.id,
        `${component.path} frontmatter name ${fields.name} must match path name ${component.id}`,
      );
    }
    if (component.kind === "agent") {
      const isReadonlyRole = READONLY_AGENTS.has(component.id);
      invariant(
        isReadonlyRole || WRITING_AGENTS.has(component.id),
        `${component.path} is an unclassified agent; add ${component.id} to READONLY_AGENTS or WRITING_AGENTS`,
      );
      if (isReadonlyRole) {
        invariant(
          fields.readonly === "true",
          `${component.path} is a readonly-role agent and must declare readonly: true`,
        );
        invariant(
          /\bNever edit\b|\bDo not read, edit, or execute\b/u.test(body),
          `${component.path} is readonly and must carry an explicit no-mutation promise in its body`,
        );
      } else {
        invariant(
          fields.readonly !== "true",
          `${component.path} writes files and must not declare readonly: true`,
        );
      }
      // Cold-context brief contract, mirroring the per-agent assertions in
      // tests/workflows/orchestration-contract.test.mjs. Checked against the
      // body, not the whole file, so a frontmatter description cannot satisfy
      // it. Every agent except the named sentinel opts in automatically, so a
      // newly classified agent cannot ship briefless.
      if (!SENTINEL_AGENTS.has(component.id)) {
        invariant(
          /cold-context/u.test(body),
          `${component.path} must require a cold-context brief`,
        );
        // Audit-only agents review a document or the plugin's own files rather
        // than a diff, so they have no write scope to declare. Exemption is by
        // name and fail-closed: every other agent, readonly or not, must
        // declare the full brief scope, so a newly added reviewer cannot drop
        // write-scope enforcement by being classified readonly.
        const required = AUDIT_ONLY_AGENTS.has(component.id)
          ? ["files_read"]
          : BRIEF_SCOPE_FIELDS;
        for (const field of required) {
          invariant(
            new RegExp(`\\b${field}\\b`, "u").test(body),
            `${component.path} brief is missing required scope field ${field}`,
          );
        }
      }
    }
  }
}

async function validateMarkdownLinks(pluginRoot, components) {
  for (const component of components) {
    if (!COMPONENT_EXTENSIONS.has(extname(component.absolutePath))) continue;
    const markdown = await readFile(component.absolutePath, "utf8");
    const links = [...markdown.matchAll(/(?<!!)\[[^\x5d]*\x5d\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/gu)];
    for (const [, target] of links) {
      if (/^(?:[a-z][a-z0-9+.-]*:|#)/iu.test(target)) continue;
      const decoded = decodeURIComponent(target.split("#", 1)[0].split("?", 1)[0]);
      if (!decoded) continue;
      const destination = resolve(dirname(component.absolutePath), decoded);
      assertInside(pluginRoot, destination, `local markdown link ${target} in ${component.path}`);
      invariant(
        await pathExists(destination),
        `local markdown link ${target} in ${component.path} does not exist`,
      );
      await assertExistingInside(pluginRoot, destination, `local markdown link ${target} in ${component.path}`);
    }
  }
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

export async function generatePluginInventory(repositoryRoot, options = {}) {
  const root = resolve(repositoryRoot);
  const { entry, pluginRoot, manifest, manifestPath } = await validateManifests(root);
  const components = await discoverComponents(root, pluginRoot, manifest);
  const inventory = {
    schemaVersion: "1.0.0",
    plugin: {
      id: manifest.name,
      name: manifest.name,
      version: manifest.version,
      manifestPath: relative(root, manifestPath).split(sep).join("/"),
      manifestSha256: await sha256(manifestPath),
    },
    components: await Promise.all(components.map(async ({ absolutePath, ...component }) => ({
      id: component.id,
      kind: component.kind,
      path: component.path,
      sha256: await sha256(absolutePath),
    }))),
    platformCapabilities: PLATFORM_CAPABILITIES,
  };

  if (options.write === true) {
    const inventoryPath = join(root, INVENTORY_PATH);
    await writeFile(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
  }
  invariant(entry.name === inventory.plugin.id, "inventory plugin identity must match marketplace");
  return inventory;
}

async function validateInventory(repositoryRoot, expected) {
  const inventoryPath = join(repositoryRoot, INVENTORY_PATH);
  const actual = await readJson(inventoryPath, "plugin inventory");
  invariant(
    JSON.stringify(actual) === JSON.stringify(expected),
    `plugin inventory ${INVENTORY_PATH} is out of date; regenerate it`,
  );
}

function extractDocumentedRegion(source, kind, label) {
  const starts = [
    ...source.matchAll(new RegExp(String.raw`<!-- components:${kind}:start count=(\d+) -->`, "gu")),
  ];
  const ends = [...source.matchAll(new RegExp(String.raw`<!-- components:${kind}:end -->`, "gu"))];
  invariant(
    starts.length === 1 && ends.length === 1,
    `${label} must contain exactly one components:${kind} marker pair; found ${starts.length} start and ${ends.length} end markers`,
  );
  const [start] = starts;
  const [end] = ends;
  const bodyStart = start.index + start[0].length;
  invariant(
    end.index >= bodyStart,
    `${label} components:${kind} end marker appears before its start marker`,
  );
  return { declaredCount: Number(start[1]), body: source.slice(bodyStart, end.index) };
}

function documentedIdentifiers(body) {
  return new Set(
    [...body.matchAll(/`\/?([a-z0-9]+(?:-[a-z0-9]+)*)`/gu)].map(([, identifier]) => identifier),
  );
}

// Only phrases that actually state a count are checked, so wording stays free.
function assertDocumentedCountPhrases(body, noun, expected, label) {
  for (const match of body.matchAll(new RegExp(String.raw`\b([a-z]+|\d+)\s+${noun}\b`, "giu"))) {
    const token = match[1].toLowerCase();
    const stated = /^\d+$/u.test(token) ? Number(token) : DOCUMENTED_COUNT_WORDS.get(token);
    if (stated === undefined) continue;
    invariant(
      stated === expected,
      `${label} states "${match[0]}" but the plugin inventory has ${expected} ${noun}`,
    );
  }
}

async function validateDocumentedComponents(repositoryRoot, inventory) {
  const installed = new Map([...DOCUMENTED_COMPONENT_KINDS.keys()].map((kind) => [kind, new Set()]));
  for (const { kind, id } of inventory.components) {
    installed.get(kind)?.add(id);
  }
  for (const documentPath of DOCUMENTED_COMPONENT_DOCS) {
    const absolutePath = join(repositoryRoot, documentPath);
    invariant(await pathExists(absolutePath), `documented component list ${documentPath} does not exist`);
    const source = await readFile(absolutePath, "utf8");
    for (const [kind, noun] of DOCUMENTED_COMPONENT_KINDS) {
      const expected = installed.get(kind);
      const { declaredCount, body } = extractDocumentedRegion(source, kind, documentPath);
      invariant(
        declaredCount === expected.size,
        `${documentPath} declares count=${declaredCount} for ${noun} but the plugin inventory has ${expected.size}`,
      );
      const documented = documentedIdentifiers(body);
      const missing = [...expected].filter((id) => !documented.has(id)).sort();
      invariant(
        missing.length === 0,
        `${documentPath} omits installed ${noun}: ${missing.join(", ")}`,
      );
      const unknown = [...documented].filter((id) => !expected.has(id)).sort();
      invariant(
        unknown.length === 0,
        `${documentPath} documents ${noun} that are not installed: ${unknown.join(", ")}`,
      );
      invariant(
        documented.size === expected.size,
        `${documentPath} documents ${documented.size} ${noun} but the plugin inventory has ${expected.size}`,
      );
      assertDocumentedCountPhrases(body, noun, expected.size, documentPath);
    }
  }
}

function requirePattern(source, pattern, label) {
  invariant(pattern.test(source), `required orchestration wiring is missing from ${label}: ${pattern}`);
}

async function validateOrchestration(repositoryRoot) {
  const plannerPath = join(repositoryRoot, "plugin/skills/planning-and-task-breakdown/SKILL.md");
  const engineerPath = join(repositoryRoot, "plugin/agents/engineer.md");
  const reviewerPaths = [
    join(repositoryRoot, "plugin/agents/code-reviewer.md"),
    join(repositoryRoot, "plugin/agents/security-reviewer.md"),
  ];
  const [planner, engineer, ...reviewers] = await Promise.all(
    [plannerPath, engineerPath, ...reviewerPaths].map((path) => readFile(path, "utf8")),
  );
  requirePattern(
    planner,
    /local-verify -> \(code-review \|\| security-review\) -> ship-ready/u,
    relative(repositoryRoot, plannerPath),
  );
  requirePattern(planner, /Tier 0[\s\S]*Tier 1[\s\S]*Tier 2/u, relative(repositoryRoot, plannerPath));
  requirePattern(engineer, /failing test before a behavior change/u, relative(repositoryRoot, engineerPath));
  requirePattern(engineer, /code-reviewer` and `security-reviewer` in parallel/u, relative(repositoryRoot, engineerPath));
  for (const [index, reviewer] of reviewers.entries()) {
    const label = relative(repositoryRoot, reviewerPaths[index]);
    requirePattern(reviewer, /^readonly: true$/mu, label);
    requirePattern(reviewer, /Tier 0[\s\S]*Tier 1[\s\S]*Tier 2/u, label);
    requirePattern(reviewer, /Set `ship_ready: false` only for Tier 0 or evidence-backed Tier 1/u, label);
  }
}

async function validateWorkflows(repositoryRoot) {
  const path = join(repositoryRoot, ".github/workflows/authenticated-benchmark.yml");
  const workflow = await readFile(path, "utf8");
  const lifecycleCommand =
    'npm run plugin:lifecycle:verify -- --evidence "$RAW_RUN_ROOT/plugin-lifecycle.json"';
  const lifecycleIndex = workflow.indexOf(lifecycleCommand);
  const smokeIndex = workflow.indexOf("npm run benchmark:smoke:authenticated");
  const releaseIndex = workflow.indexOf("npm run benchmark:release:authenticated");
  invariant(
    lifecycleIndex >= 0 && smokeIndex > lifecycleIndex && releaseIndex > lifecycleIndex,
    "authenticated benchmark must run plugin lifecycle verification immediately before authenticated profiles",
  );
  invariant(
    workflow.includes(
      '--plugin-lifecycle-evidence-file "$RAW_RUN_ROOT/plugin-lifecycle.json"',
    ),
    "authenticated benchmark report must consume the exact plugin lifecycle evidence artifact",
  );
  invariant(
    !workflow.includes('--plugin-lifecycle-evidence "npm run validate'),
    "authenticated benchmark cannot substitute repository validation for plugin lifecycle verification",
  );
}

function resolveJsonPointer(schema, reference, label) {
  invariant(reference.startsWith("#"), `${label} has non-local $ref ${reference}`);
  if (reference === "#") return schema;
  invariant(reference.startsWith("#/"), `${label} has invalid local $ref ${reference}`);
  let value = schema;
  for (const encodedToken of reference.slice(2).split("/")) {
    const token = encodedToken.replaceAll("~1", "/").replaceAll("~0", "~");
    invariant(
      value !== null && typeof value === "object" && Object.hasOwn(value, token),
      `${label} has unresolved local $ref ${reference}`,
    );
    value = value[token];
  }
  return value;
}

async function validateSchemas(repositoryRoot) {
  const schemaRoot = join(repositoryRoot, "schemas");
  const names = (await readdir(schemaRoot)).filter((name) => name.endsWith(".schema.json")).sort();
  invariant(names.length > 0, "schemas directory contains no schema documents");
  const ids = new Set();
  for (const name of names) {
    const schema = await readJson(join(schemaRoot, name), `schema ${name}`);
    assertObject(schema, `schema ${name}`);
    invariant(
      schema.$schema === "https://json-schema.org/draft/2020-12/schema",
      `schema ${name} must declare draft 2020-12`,
    );
    assertRequiredString(schema, "$id", `schema ${name}`);
    invariant(!ids.has(schema.$id), `schema ${name} duplicates $id ${schema.$id}`);
    ids.add(schema.$id);
    const visit = (value) => {
      if (Array.isArray(value)) {
        value.forEach(visit);
      } else if (value && typeof value === "object") {
        if (value.$ref !== undefined) {
          invariant(typeof value.$ref === "string", `schema ${name} has a non-string $ref`);
          resolveJsonPointer(schema, value.$ref, `schema ${name}`);
        }
        Object.values(value).forEach(visit);
      }
    };
    visit(schema);
  }
}

function validateHookCommand(repositoryRoot, pluginRoot, command, label, pluginHook) {
  invariant(typeof command === "string" && command.trim(), `${label} hook command is required`);
  if (pluginHook) {
    const match = command.match(
      /^node "\$\{CURSOR_PLUGIN_ROOT\}\/([^"$`\\\r\n]+)"$/u,
    );
    invariant(
      match,
      `${label} has unsafe plugin hook command; use node "\${CURSOR_PLUGIN_ROOT}/<script>"`,
    );
    const relativeScript = match[1];
    assertSafeRelativePath(relativeScript, `${label} plugin hook script`);
    const absoluteScript = resolve(pluginRoot, relativeScript);
    assertInside(pluginRoot, absoluteScript, `${label} plugin hook script`);
    return { root: pluginRoot, scriptPath: absoluteScript };
  }

  invariant(
    !/[;&|`$><\r\n]/u.test(command),
    `${label} has unsafe hook command shell syntax`,
  );
  const tokens = command.trim().split(/\s+/u);
  invariant(tokens.length === 2 && tokens[0] === "node", `${label} has unsafe hook command; use node <script>`);
  const scriptPath = tokens[1];
  assertSafeRelativePath(scriptPath, `${label} hook script`);
  const absoluteScript = resolve(repositoryRoot, scriptPath);
  assertInside(repositoryRoot, absoluteScript, `${label} hook script`);
  return { root: repositoryRoot, scriptPath: absoluteScript };
}

async function validateHookConfig(repositoryRoot, pluginRoot, path, pluginHook) {
  const label = relative(repositoryRoot, path);
  const config = await readJson(path, label);
  assertObject(config, label);
  invariant(config.version === 1, `${label} hook config version must be 1`);
  assertObject(config.hooks, `${label} hooks`);
  for (const [event, definitions] of Object.entries(config.hooks)) {
    invariant(Array.isArray(definitions) && definitions.length > 0, `${label} hook event ${event} must be a non-empty array`);
    for (const definition of definitions) {
      assertObject(definition, `${label} ${event} hook`);
      const { root, scriptPath } = validateHookCommand(
        repositoryRoot,
        pluginRoot,
        definition.command,
        `${label} ${event}`,
        pluginHook,
      );
      invariant(await pathExists(scriptPath), `${label} hook script ${relative(repositoryRoot, scriptPath)} does not exist`);
      await assertExistingInside(root, scriptPath, `${label} hook script`);
      const source = await readFile(scriptPath, "utf8");
      invariant(
        !/(?:node:child_process|node:(?:http|https|net)|\bfetch\s*\(|\beval\s*\(|\bnew Function\b|process\.env\.HOME|homedir\s*\(|~\/\.cursor|\b(?:writeFile|appendFile|rm|unlink|rename|copyFile|mkdir)\s*\()/u.test(source),
        `${label} hook script ${relative(repositoryRoot, scriptPath)} fails static safety checks`,
      );
    }
  }
}

async function validateHooks(repositoryRoot, pluginRoot, components) {
  const pluginHookPaths = new Set(
    components.filter(({ kind }) => kind === "hook").map(({ absolutePath }) => absolutePath),
  );
  const paths = new Set(pluginHookPaths);
  const probeConfig = join(repositoryRoot, "test/fixtures/hooks/hooks.json");
  if (await pathExists(probeConfig)) paths.add(probeConfig);
  for (const path of [...paths].sort()) {
    await validateHookConfig(repositoryRoot, pluginRoot, path, pluginHookPaths.has(path));
  }
}

export async function validateRepository(repositoryRoot) {
  const root = resolve(repositoryRoot);
  const { manifest, pluginRoot } = await validateManifests(root);
  const components = await discoverComponents(root, pluginRoot, manifest);
  await validateFrontmatter(components);
  await validateMarkdownLinks(pluginRoot, components);
  const inventory = await generatePluginInventory(root);
  await validateInventory(root, inventory);
  await validateDocumentedComponents(root, inventory);
  await validateOrchestration(root);
  await validateWorkflows(root);
  await validateSchemas(root);
  await validateHooks(root, pluginRoot, components);
  return {
    plugin: manifest.name,
    components: components.map(({ absolutePath, ...component }) => component),
    checks: [
      "manifests",
      "components",
      "frontmatter",
      "markdown-links",
      "plugin-inventory",
      "documented-components",
      "orchestration",
      "workflows",
      "schemas",
      "hooks",
    ],
  };
}

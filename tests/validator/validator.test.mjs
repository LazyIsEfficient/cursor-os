import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  generatePluginInventory,
  validateRepository,
} from "../../scripts/lib/repository-validator.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

async function withRepositoryCopy(run) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "cursor-harness-validator-"));
  const repository = join(temporaryRoot, "repository");
  const gitDirectory = join(root, ".git");
  await cp(root, repository, {
    recursive: true,
    filter: (source) => source !== gitDirectory && !source.startsWith(`${gitDirectory}${sep}`),
  });
  try {
    await run(repository);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function replace(path, before, after) {
  const source = await readFile(path, "utf8");
  assert.match(source, new RegExp(before.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  await writeFile(path, source.replace(before, after));
}

test("comprehensive validator accepts the repository and reports every check", async () => {
  const result = await validateRepository(root);

  assert.deepEqual(result.checks, [
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
  ]);
  assert.ok(result.components.length >= 12);
  assert.equal(result.plugin, "cursor-harness");
});

test("validator rejects a marketplace source that escapes its repository", async () => {
  await withRepositoryCopy(async (repository) => {
    const path = join(repository, ".cursor-plugin/marketplace.json");
    const marketplace = JSON.parse(await readFile(path, "utf8"));
    marketplace.plugins[0].source = "../plugin";
    await writeFile(path, `${JSON.stringify(marketplace, null, 2)}\n`);

    await assert.rejects(validateRepository(repository), /plugin source.*(?:relative|travers)/iu);
  });
});

test("validator rejects unsupported frontmatter and path/name mismatch", async () => {
  await withRepositoryCopy(async (repository) => {
    const path = join(repository, "plugin/agents/engineer.md");
    await replace(path, "name: engineer", "name: wrong-name\ntools: shell");

    await assert.rejects(
      validateRepository(repository),
      /(?:unsupported frontmatter field tools|must match.*engineer)/iu,
    );
  });
});

test("validator requires readonly for agents classified as readonly by role", async () => {
  await withRepositoryCopy(async (repository) => {
    const path = join(repository, "plugin/agents/capability-probe.md");
    const source = await readFile(path, "utf8");
    await writeFile(path, source.replace(/^readonly: true\n/mu, ""));
    await generatePluginInventory(repository, { write: true });

    await assert.rejects(
      validateRepository(repository),
      /readonly-role agent and must declare readonly: true/iu,
    );
  });
});

test("validator rejects readonly on an agent whose role is to write", async () => {
  await withRepositoryCopy(async (repository) => {
    const path = join(repository, "plugin/agents/godot-engineer.md");
    const source = await readFile(path, "utf8");
    await writeFile(path, source.replace(/^---\n/u, "---\nreadonly: true\n"));
    await generatePluginInventory(repository, { write: true });

    await assert.rejects(
      validateRepository(repository),
      /writes files and must not declare readonly: true/iu,
    );
  });
});

test("validator rejects a readonly agent whose body drops its no-mutation promise", async () => {
  await withRepositoryCopy(async (repository) => {
    const path = join(repository, "plugin/agents/adversarial-claims-reviewer.md");
    const source = await readFile(path, "utf8");
    await writeFile(path, source.replace("Never edit", "Feel free to adjust"));
    await generatePluginInventory(repository, { write: true });

    await assert.rejects(
      validateRepository(repository),
      /must carry an explicit no-mutation promise/iu,
    );
  });
});

test("validator rejects an unclassified agent dropped into the agents directory", async () => {
  await withRepositoryCopy(async (repository) => {
    const path = join(repository, "plugin/agents/rogue.md");
    await writeFile(
      path,
      "---\nname: rogue\ndescription: An agent that was never classified as readonly or writing.\n---\n\nDo whatever.\n",
    );
    await generatePluginInventory(repository, { write: true });

    await assert.rejects(
      validateRepository(repository),
      /unclassified agent; add rogue to READONLY_AGENTS or WRITING_AGENTS/iu,
    );
  });
});

test("validator rejects an agent whose body drops its cold-context brief", async () => {
  await withRepositoryCopy(async (repository) => {
    const path = join(repository, "plugin/agents/rust-engineer.md");
    const source = await readFile(path, "utf8");
    const [, frontmatter] = source.match(/^(---\n[\s\S]*?\n---\n)/u);
    await writeFile(path, `${frontmatter}\nInfer the task from conversation history.\n`);
    await generatePluginInventory(repository, { write: true });

    await assert.rejects(
      validateRepository(repository),
      /plugin\/agents\/rust-engineer\.md must require a cold-context brief/iu,
    );
  });
});

test("validator rejects a writing agent whose brief drops a scope field", async () => {
  await withRepositoryCopy(async (repository) => {
    const path = join(repository, "plugin/agents/rust-engineer.md");
    const source = await readFile(path, "utf8");
    await writeFile(path, source.replaceAll("files_write", "whatever_seems_relevant"));
    await generatePluginInventory(repository, { write: true });

    await assert.rejects(
      validateRepository(repository),
      /plugin\/agents\/rust-engineer\.md brief is missing required scope field files_write/iu,
    );
  });
});

test("validator rejects a readonly agent whose brief drops its read scope", async () => {
  await withRepositoryCopy(async (repository) => {
    const path = join(repository, "plugin/agents/library-investigator.md");
    const source = await readFile(path, "utf8");
    await writeFile(path, source.replaceAll("files_read", "some_files"));
    await generatePluginInventory(repository, { write: true });

    await assert.rejects(
      validateRepository(repository),
      /plugin\/agents\/library-investigator\.md brief is missing required scope field files_read/iu,
    );
  });
});

// A readonly reviewer that reviews a diff still declares the full brief scope.
// Only the named audit-only agents are exempt, so classifying a new reviewer as
// readonly can never by itself drop write-scope enforcement.
test("validator rejects a readonly reviewer whose brief drops its write scope", async () => {
  await withRepositoryCopy(async (repository) => {
    const path = join(repository, "plugin/agents/code-reviewer.md");
    const source = await readFile(path, "utf8");
    await writeFile(path, source.replaceAll("files_write", "whatever_seems_relevant"));
    await generatePluginInventory(repository, { write: true });

    await assert.rejects(
      validateRepository(repository),
      /plugin\/agents\/code-reviewer\.md brief is missing required scope field files_write/iu,
    );
  });
});

// The no-mutation promise is checked against the body, so moving it into the
// frontmatter description cannot satisfy it. Otherwise a readonly agent could
// grant itself write capability in its body and still ship green.
test("validator rejects a no-mutation promise that lives only in the description", async () => {
  await withRepositoryCopy(async (repository) => {
    const path = join(repository, "plugin/agents/security-reviewer.md");
    const source = await readFile(path, "utf8");
    const moved = source
      .replace("Never edit files, run mutating actions,", "Feel free to adjust files,")
      .replace(/^(description: .*)$/mu, "$1 Never edit.");
    await writeFile(path, moved);
    await generatePluginInventory(repository, { write: true });

    await assert.rejects(
      validateRepository(repository),
      /plugin\/agents\/security-reviewer\.md is readonly and must carry an explicit no-mutation promise in its body/iu,
    );
  });
});

// The sentinel exclusion is by name, so the probe stays exempt no matter how it
// is edited, while every other agent is enrolled automatically. Asserting only
// that the sentinel passes would also pass against a validator with the brief
// checks deleted, so the non-sentinel control case is what gives this teeth.
test("validator exempts the named sentinel from the brief contract", async () => {
  await withRepositoryCopy(async (repository) => {
    const gut = async (repository, name) => {
      const path = join(repository, `plugin/agents/${name}.md`);
      const source = await readFile(path, "utf8");
      const [, frontmatter] = source.match(/^(---\n[\s\S]*?\n---\n)/u);
      await writeFile(path, `${frontmatter}\nDo not read, edit, or execute anything.\n`);
    };

    await gut(repository, "capability-probe");
    await generatePluginInventory(repository, { write: true });
    await assert.doesNotReject(validateRepository(repository));

    // Control: the identical gutting applied to a non-sentinel agent must fail,
    // proving the pass above comes from the exemption and not from an inert check.
    await gut(repository, "engineer");
    await generatePluginInventory(repository, { write: true });
    await assert.rejects(
      validateRepository(repository),
      /plugin\/agents\/engineer\.md must require a cold-context brief/iu,
    );
  });
});

test("validator rejects broken local markdown links", async () => {
  await withRepositoryCopy(async (repository) => {
    const path = join(repository, "plugin/agents/engineer.md");
    await writeFile(path, `${await readFile(path, "utf8")}\n[missing](../skills/no-such-skill/SKILL.md)\n`);

    await assert.rejects(validateRepository(repository), /local markdown link.*does not exist/iu);
  });
});

test("validator rejects stale inventory hashes and component parity", async () => {
  await withRepositoryCopy(async (repository) => {
    const path = join(repository, "plugin/agents/capability-probe.md");
    await writeFile(path, `${await readFile(path, "utf8")}\n`);

    await assert.rejects(validateRepository(repository), /plugin inventory.*out of date/iu);
  });
});

test("inventory generation is deterministic", async () => {
  const first = await generatePluginInventory(root);
  const second = await generatePluginInventory(root);

  assert.deepEqual(first, second);
  assert.ok(
    first.components.some(
      ({ kind, path }) => kind === "script" && path === "plugin/scripts/before-shell-execution.mjs",
    ),
    "hook implementation scripts must be inventoried",
  );
  assert.deepEqual(
    first.components.map(({ path }) => path),
    [...first.components.map(({ path }) => path)].sort(),
  );
});

// Issue #5: both READMEs claimed six skills while nineteen shipped. The prose
// component lists are asserted against the inventory so the same drift cannot
// recur silently.
test("validator rejects a README that omits an installed component", async () => {
  await withRepositoryCopy(async (repository) => {
    await replace(
      join(repository, "plugin/README.md"),
      "`release-manager`",
      "release-manager",
    );

    await assert.rejects(
      validateRepository(repository),
      /plugin\/README\.md omits installed skills: release-manager/iu,
    );
  });
});

// A misspelled name must not read as "you forgot to document release-manager"
// when release-managr is sitting right there in the file. The omission and the
// unrecognized token are reported together so the typo is self-evident.
test("validator reports an unrecognized name alongside the component it omits", async () => {
  await withRepositoryCopy(async (repository) => {
    await replace(join(repository, "plugin/README.md"), "`release-manager`", "`release-managr`");

    await assert.rejects(validateRepository(repository), (error) => {
      assert.match(error.message, /plugin\/README\.md omits installed skills: release-manager/iu);
      assert.match(error.message, /unrecognized names in this region[^:]*: release-managr/iu);
      return true;
    });
  });
});

// Marker regions are prose. Formatting a tool name as code inside one is
// ordinary markdown, not a claim that the plugin ships a `jest` component.
test("validator accepts backticked non-component tokens inside a marker region", async () => {
  await withRepositoryCopy(async (repository) => {
    await replace(
      join(repository, "plugin/README.md"),
      "(Jest and Supertest)",
      "(`jest` and `supertest`)",
    );

    await validateRepository(repository);
  });
});

// Fail-open, recorded so nobody assumes coverage that is gone: the prose count
// in front of the name list is not verified in any form. Only the names are.
test("validator does not verify the prose count in front of a component list", async () => {
  await withRepositoryCopy(async (repository) => {
    await replace(join(repository, "README.md"), "thirty-seven skills:", "a dozen skills:");

    await validateRepository(repository);
  });
});

test("validator rejects a README whose component markers are missing", async () => {
  await withRepositoryCopy(async (repository) => {
    await replace(join(repository, "plugin/README.md"), "<!-- components:agent:end -->", "");

    await assert.rejects(
      validateRepository(repository),
      /plugin\/README\.md must contain exactly one components:agent marker pair/iu,
    );
  });
});

// The property this whole check exists for: a newly installed skill must fail
// validation until BOTH READMEs name it. Each stage is asserted, so documenting
// one README cannot be mistaken for satisfying the check.
test("validator rejects a newly installed skill until both READMEs document it", async () => {
  await withRepositoryCopy(async (repository) => {
    const skillDirectory = join(repository, "plugin/skills/undocumented-skill");
    await mkdir(skillDirectory, { recursive: true });
    await writeFile(
      join(skillDirectory, "SKILL.md"),
      "---\nname: undocumented-skill\ndescription: A skill added to the plugin without updating either README component list.\n---\n\nDo the thing.\n",
    );
    await generatePluginInventory(repository, { write: true });

    const document = (path) =>
      replace(
        join(repository, path),
        "<!-- components:skill:end -->",
        " Also `undocumented-skill`.<!-- components:skill:end -->",
      );

    await assert.rejects(
      validateRepository(repository),
      /README\.md omits installed skills: undocumented-skill/iu,
      "neither README documents the new skill",
    );

    await document("README.md");
    await assert.rejects(
      validateRepository(repository),
      /plugin\/README\.md omits installed skills: undocumented-skill/iu,
      "the plugin README still omits the new skill",
    );

    await document("plugin/README.md");
    await validateRepository(repository);
  });
});

test("validator rejects unresolved or non-local schema references", async () => {
  await withRepositoryCopy(async (repository) => {
    const path = join(repository, "schemas/plugin-inventory.schema.json");
    const schema = JSON.parse(await readFile(path, "utf8"));
    schema.properties.plugin.$ref = "#/$defs/missing";
    await writeFile(path, `${JSON.stringify(schema, null, 2)}\n`);

    await assert.rejects(validateRepository(repository), /unresolved local \$ref/iu);
  });
});

test("validator rejects hook commands with shell syntax or escaped scripts", async () => {
  await withRepositoryCopy(async (repository) => {
    const path = join(repository, "test/fixtures/hooks/hooks.json");
    const config = JSON.parse(await readFile(path, "utf8"));
    config.hooks.beforeShellExecution[0].command = "node ../outside.mjs && echo unsafe";
    await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);

    await assert.rejects(validateRepository(repository), /unsafe hook command/iu);
  });
});

test("validator accepts the exact quoted CURSOR_PLUGIN_ROOT hook form", async () => {
  const result = await validateRepository(root);

  assert.ok(result.checks.includes("hooks"));
});

test("validator rejects arbitrary expansion or shell syntax in plugin hook commands", async () => {
  for (const command of [
    'node "${HOME}/scripts/before-shell-execution.mjs"',
    'node "${CURSOR_PLUGIN_ROOT}/scripts/before-shell-execution.mjs"; echo unsafe',
    'node "${CURSOR_PLUGIN_ROOT}/${SCRIPT_NAME}"',
  ]) {
    await withRepositoryCopy(async (repository) => {
      const path = join(repository, "plugin/hooks/hooks.json");
      const config = JSON.parse(await readFile(path, "utf8"));
      config.hooks.beforeShellExecution[0].command = command;
      await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
      await generatePluginInventory(repository, { write: true });

      await assert.rejects(validateRepository(repository), /unsafe plugin hook command/iu);
    });
  }
});

test("validator rejects plugin-root hook targets outside plugin containment", async () => {
  await withRepositoryCopy(async (repository) => {
    const path = join(repository, "plugin/hooks/hooks.json");
    const config = JSON.parse(await readFile(path, "utf8"));
    config.hooks.beforeShellExecution[0].command =
      'node "${CURSOR_PLUGIN_ROOT}/../scripts/outside.mjs"';
    await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
    await generatePluginInventory(repository, { write: true });

    await assert.rejects(validateRepository(repository), /plugin hook script.*(?:traverse|escapes)/iu);
  });
});

test("validator rejects missing plugin-root hook targets", async () => {
  await withRepositoryCopy(async (repository) => {
    const path = join(repository, "plugin/hooks/hooks.json");
    const config = JSON.parse(await readFile(path, "utf8"));
    config.hooks.beforeShellExecution[0].command =
      'node "${CURSOR_PLUGIN_ROOT}/scripts/missing.mjs"';
    await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
    await generatePluginInventory(repository, { write: true });

    await assert.rejects(validateRepository(repository), /hook script.*does not exist/iu);
  });
});

test("validator rejects missing orchestration review wiring", async () => {
  await withRepositoryCopy(async (repository) => {
    const path = join(repository, "plugin/skills/planning-and-task-breakdown/SKILL.md");
    await replace(
      path,
      "local-verify -> (code-review || security-review) -> ship-ready",
      "local-verify -> ship-ready",
    );
    await generatePluginInventory(repository, { write: true });

    await assert.rejects(validateRepository(repository), /orchestration wiring/iu);
  });
});

test("validator rejects repository validation substituted for lifecycle verification", async () => {
  await withRepositoryCopy(async (repository) => {
    const path = join(repository, ".github/workflows/authenticated-benchmark.yml");
    await replace(
      path,
      "npm run plugin:lifecycle:verify -- --evidence \"$RAW_RUN_ROOT/plugin-lifecycle.json\"",
      "npm run validate",
    );

    await assert.rejects(
      validateRepository(repository),
      /authenticated benchmark.*plugin lifecycle verification/iu,
    );
  });
});

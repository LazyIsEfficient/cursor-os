import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  GH_PR_WITHOUT_VERIFY_AGENT_MESSAGE,
  GH_PR_WITHOUT_VERIFY_RULE,
  VERIFY_PR_GATE_DISABLED_ENV,
  verifyLedgerPath,
} from "../../scripts/lib/verify-ledger-lib.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = resolve(
  repositoryRoot,
  "plugin/scripts/before-shell-execution.mjs",
);
const configPath = resolve(repositoryRoot, "plugin/hooks/hooks.json");

function runHook(input, { cwd = repositoryRoot, env } = {}) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd,
    encoding: "utf8",
    env: env ? { ...process.env, ...env } : process.env,
    input,
    timeout: 5_000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
}

function commandDecision(command, options) {
  return runHook(
    `${JSON.stringify({ command, cwd: options?.cwd ?? repositoryRoot, sandbox: true })}\n`,
    options,
  );
}

function writeValidVerifyLedger(root, headSha) {
  mkdirSync(join(root, ".cursor"), { recursive: true });
  const at = new Date().toISOString();
  writeFileSync(
    verifyLedgerPath(root),
    `${JSON.stringify(
      {
        version: 2,
        profile: "node-harness",
        conversation_id: "test",
        impl_verified: true,
        verified_at: at,
        head_sha: headSha,
        commands: [
          { cmd: "npm test", exit_code: 0, at, spawned: true },
          {
            cmd: "node scripts/validate.mjs",
            exit_code: 0,
            at,
            spawned: true,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
}

function gitHeadSha(root) {
  const result = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  return result.stdout.trim();
}

test("allows benign everyday commands", () => {
  for (const command of [
    "ls",
    "ls -la",
    "ls /",
    "git status",
    "git status --short",
    "git push origin feature/safe-update",
    "npm test",
    "npm run validate",
    "node --test tests/security/*.test.mjs",
    "rm file.txt",
    "rm -f file.txt",
    'printf "%s\\n" hello',
    "printf '%s' '$(git reset --hard)'",
    "printf '%s' '`git reset --hard`'",
    "FOO=bar git status",
    "GIT_AUTHOR_NAME=x git status",
    "env MODE=test npm test",
    "command ls",
    "sudo ls",
    "timeout 5 ls",
    "nice ls",
    "time ls",
    "sh -c 'ls -la'",
    "bash -c 'git status'",
    "git -c user.name=test status",
  ]) {
    assert.deepEqual(commandDecision(command), { permission: "allow" }, command);
  }
});

test("allows named eval exceptions only", () => {
  for (const command of [
    'eval "$(direnv hook zsh)"',
    'eval "$(ssh-agent -s)"',
    '  eval "$(direnv hook zsh)"  ',
  ]) {
    assert.deepEqual(commandDecision(command), { permission: "allow" }, command);
  }
});

test("denies high-impact literal command shapes", () => {
  const commands = [
    "rm -rf /",
    "rm -rf ./foo",
    "rm -rf ./tmp",
    "rm -fr ./tmp",
    "rm -r -f ./tmp",
    "rm --recursive --force ./tmp",
    `"/bin/rm" "-rf" './tmp'`,
    "git reset --hard",
    `git reset "--hard"`,
    "git -C ./fixture clean -fd",
    `env MODE=test git "push" --force-with-lease origin main`,
    `sh -c 'git push origin +main'`,
    "git branch -D abandoned-work",
    "gh repo delete owner/repository",
    "npm publish",
    "rm tests/evaluators/hidden-check.mjs",
    "mv fixtures/canaries/marker.txt /tmp/marker.txt",
    "printf changed > tests/security/evaluator-canary.txt",
  ];

  for (const command of commands) {
    const response = commandDecision(command);
    assert.equal(response.permission, "deny", command);
    assert.match(response.user_message, /^Command blocked by the local shell guard/u);
    assert.equal(typeof response.agent_message, "string");
  }
});

test("denies ANSI-C quoting, launchers, and git config injection bypasses", () => {
  const commands = [
    "rm $'-rf' /tmp/x",
    "git reset $'--hard'",
    "timeout 5 rm -rf /tmp/x",
    "gtimeout 5 rm -rf /tmp/x",
    "nice rm -rf /tmp/x",
    "gnice rm -rf /tmp/x",
    "busybox rm -rf /tmp/x",
    "time rm -rf /tmp/x",
    "stdbuf -oL rm -rf /tmp/x",
    "gstdbuf -oL rm -rf /tmp/x",
    "ionice rm -rf /tmp/x",
    "xargs rm -rf /tmp/x",
    "git -c alias.evil='!rm -rf /tmp/x' evil",
    "git -c core.pager='rm -rf /tmp/x' log",
    "git -c diff.external='rm -rf /tmp/x' status",
    "FOO='!true' git --config-env=alias.evil=FOO evil",
    "FOO='!true' git --config-env alias.evil=FOO evil",
    "GIT_CONFIG_PARAMETERS=\"'alias.evil=!true'\" git evil",
    "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.probe GIT_CONFIG_VALUE_0='!true' git probe",
    "env GIT_CONFIG_PARAMETERS=\"'alias.evil=!true'\" git evil",
  ];

  for (const command of commands) {
    const response = commandDecision(command);
    assert.equal(response.permission, "deny", command);
    assert.match(response.user_message, /^Command blocked by the local shell guard/u);
  }
});

test("denies known expansion and eval bypass classes", () => {
  const commands = [
    "eval rm -rf /",
    "/bin/r? -rf /",
    "$(echo rm -rf /)",
    `eval "$(printf 'rm -rf /')"`,
    ". <(printf 'rm -rf /')",
    "source <(printf 'rm -rf /')",
    "eval eval rm -rf /",
    `eval "$(direnv hook zsh)" && eval rm -rf /`,
    "echo `rm -rf /`",
    'echo "$(rm -rf /)"',
  ];

  for (const command of commands) {
    const response = commandDecision(command);
    assert.equal(response.permission, "deny", command);
    assert.match(response.user_message, /^Command blocked by the local shell guard/u);
    assert.equal(typeof response.agent_message, "string");
  }
});

test("denies unsafe command words and non-allowlisted eval", () => {
  for (const command of [
    "r? -rf /",
    "/bin/rm[s] -rf /",
    "{rm,echo} -rf /",
    "~/.local/bin/rm -rf /",
    "eval echo hi",
    'eval "$(direnv hook bash)"',
    'eval "$(ssh-agent -c)"',
  ]) {
    assert.equal(commandDecision(command).permission, "deny", command);
  }
});

test("denies nested unsafe forms inside shell -c", () => {
  for (const command of [
    "sh -c 'eval rm -rf /'",
    "bash -c '$(echo rm -rf /)'",
    "zsh -c '/bin/r? -rf /'",
    "sh -c 'rm -rf ./tmp'",
    "bash -c 'git reset --hard'",
  ]) {
    assert.equal(commandDecision(command).permission, "deny", command);
  }
});

test("pipe into interpreter remains out of scope", () => {
  // Deliberate residual risk — not claimed blocked. `find -exec rm` is closed
  // by the high-impact argv scan when `rm` appears as a shell word; pipe-into
  // interpreter still is not.
  assert.deepEqual(commandDecision("printf rm | bash"), { permission: "allow" });
});

test("structural high-impact scan catches find -exec rm", () => {
  assert.equal(
    commandDecision("find /tmp -name x -exec rm -rf {} +").permission,
    "deny",
  );
});

test("fails closed with deterministic JSON for malformed input", () => {
  for (const input of [
    "not-json\n",
    "{}\n",
    '{"command":"git reset \\"}\n',
    `${JSON.stringify({ command: "git reset '" })}\n`,
    `${JSON.stringify({ command: 'echo "$(git reset --hard"' })}\n`,
    `${JSON.stringify({ command: "echo `git reset --hard" })}\n`,
  ]) {
    assert.deepEqual(runHook(input), {
      permission: "deny",
      user_message:
        "Command blocked by the local shell guard (invalid-hook-input).",
      agent_message:
        "The deterministic beforeShellExecution guard denied this command. Ask the user to perform or explicitly revise the operation.",
    });
  }
});

test("uses the official plugin-root, version 1 fail-closed contract", async () => {
  const config = JSON.parse(await readFile(configPath, "utf8"));

  assert.equal(config.version, 1);
  assert.deepEqual(Object.keys(config.hooks).sort(), [
    "afterFileEdit",
    "beforeReadFile",
    "beforeShellExecution",
    "postToolUse",
    "preCompact",
    "preToolUse",
    "sessionStart",
    "stop",
    "subagentStop",
  ]);
  assert.deepEqual(config.hooks.beforeShellExecution, [
    {
      type: "command",
      command:
        'node "${CURSOR_PLUGIN_ROOT}/scripts/before-shell-execution.mjs"',
      timeout: 5,
      failClosed: true,
    },
  ]);
});

test("advisory hooks are registered fail-open with plugin-root commands", async () => {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const advisoryCommands = {
    sessionStart: [
      'node "${CURSOR_PLUGIN_ROOT}/scripts/session-state-inject.mjs"',
      'node "${CURSOR_PLUGIN_ROOT}/scripts/memory-index-inject.mjs"',
      'node "${CURSOR_PLUGIN_ROOT}/scripts/dispatch-gate-session-init.mjs"',
    ],
    preCompact: ['node "${CURSOR_PLUGIN_ROOT}/scripts/pre-compact-notice.mjs"'],
    postToolUse: [
      'node "${CURSOR_PLUGIN_ROOT}/scripts/dispatch-gate-post-tool.mjs"',
    ],
    afterFileEdit: [
      'node "${CURSOR_PLUGIN_ROOT}/scripts/dispatch-gate-after-file-edit.mjs"',
    ],
    subagentStop: [
      'node "${CURSOR_PLUGIN_ROOT}/scripts/dispatch-gate-subagent-stop.mjs"',
    ],
    stop: [
      'node "${CURSOR_PLUGIN_ROOT}/scripts/memory-extract-nudge.mjs"',
      'node "${CURSOR_PLUGIN_ROOT}/scripts/dispatch-gate-stop.mjs"',
    ],
  };

  for (const [event, commands] of Object.entries(advisoryCommands)) {
    assert.deepEqual(
      config.hooks[event].map((definition) => definition.command),
      commands,
      event,
    );

    for (const definition of config.hooks[event]) {
      assert.equal(definition.type, "command");
      // Advisory hooks must never gate the user: a crash has to fail open.
      assert.equal(
        Object.hasOwn(definition, "failClosed"),
        false,
        `${event} must not set failClosed`,
      );
    }
  }

  // Loop safety: replaces the on-disk turn counter of the Claude original.
  assert.equal(config.hooks.stop[0].loop_limit, 1);
  assert.equal(config.hooks.stop[1].loop_limit, 3);
});

test("dispatch-gate failClosed hooks always declare failClosed", async () => {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  for (const event of ["preToolUse", "beforeReadFile"]) {
    assert.equal(config.hooks[event].length, 1);
    assert.equal(config.hooks[event][0].failClosed, true);
    assert.match(
      config.hooks[event][0].command,
      /^node "\$\{CURSOR_PLUGIN_ROOT\}\/scripts\/dispatch-gate-/u,
    );
  }
});

test("denies gh pr create|ready without a valid verify ledger", () => {
  // Ensure no leftover ledger from other tests.
  try {
    rmSync(verifyLedgerPath(repositoryRoot), { force: true });
  } catch {
    /* ignore */
  }

  for (const command of [
    "gh pr create",
    "gh pr ready",
    "gh pr create --fill",
    "gh -R owner/repo pr create",
    "gh --repo owner/repo pr create",
    "gh --repo=owner/repo pr create",
    "gh -R owner/repo pr ready",
  ]) {
    const response = commandDecision(command);
    assert.equal(response.permission, "deny", command);
    assert.match(
      response.user_message,
      new RegExp(`\\(${GH_PR_WITHOUT_VERIFY_RULE}\\)`, "u"),
      command,
    );
    assert.equal(response.agent_message, GH_PR_WITHOUT_VERIFY_AGENT_MESSAGE, command);
  }
});

test("allows gh pr create|ready with a valid verify ledger for HEAD", () => {
  const headSha = gitHeadSha(repositoryRoot);
  writeValidVerifyLedger(repositoryRoot, headSha);
  try {
    for (const command of ["gh pr create", "gh pr ready"]) {
      assert.deepEqual(
        commandDecision(command),
        { permission: "allow" },
        command,
      );
    }
  } finally {
    rmSync(verifyLedgerPath(repositoryRoot), { force: true });
  }
});

test("VERIFY_PR_GATE_DISABLED=1 skips only the verify-ledger PR check", () => {
  try {
    rmSync(verifyLedgerPath(repositoryRoot), { force: true });
  } catch {
    /* ignore */
  }

  assert.deepEqual(
    commandDecision("gh pr create", {
      env: { [VERIFY_PR_GATE_DISABLED_ENV]: "1" },
    }),
    { permission: "allow" },
  );

  // Other high-impact gh forms remain denied even with the emergency env.
  const denied = commandDecision("gh repo delete owner/repository", {
    env: { [VERIFY_PR_GATE_DISABLED_ENV]: "1" },
  });
  assert.equal(denied.permission, "deny");
});

test("guard entry has no direct fs/network/credential APIs (ledger via lib)", async () => {
  const source = await readFile(scriptPath, "utf8");

  assert.doesNotMatch(
    source,
    /node:(?:child_process|cluster|dgram|dns|fs|http|https|net|os|tls|worker_threads)/u,
  );
  assert.doesNotMatch(source, /\b(?:eval|Function)\s*\(/u);
  assert.doesNotMatch(source, /\bprocess\.env\b/u);
  assert.doesNotMatch(source, /\b(?:homedir|readFile|readFileSync|fetch)\s*\(/u);
  assert.match(source, /verify-ledger-lib\.mjs/u);
  assert.match(source, /GH_PR_WITHOUT_VERIFY_RULE/u);
  assert.match(source, /ghCommand/u);
  assert.match(source, /NAMED_EXCEPTIONS/u);
  assert.match(source, /MAX_INPUT_BYTES/u);
  assert.match(source, /isSafeCommandWord/u);
  assert.match(source, /highImpactRule/u);
  assert.match(source, /PROTECTED_PATH_PATTERN/u);
  assert.match(source, /COMMAND_LAUNCHERS/u);
  assert.match(source, /GNU_COREUTILS_LAUNCHERS/u);
  assert.match(source, /HIGH_IMPACT_EXECUTABLES/u);
  assert.match(source, /gitConfigInjectionRule/u);
  assert.match(source, /isGitConfigEnvAssignment/u);
});

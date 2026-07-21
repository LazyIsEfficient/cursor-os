import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = resolve(
  repositoryRoot,
  "plugin/scripts/before-shell-execution.mjs",
);

function runHook(input) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: repositoryRoot,
    encoding: "utf8",
    input,
    timeout: 1_000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
}

function commandDecision(command) {
  return runHook(`${JSON.stringify({ command, cwd: repositoryRoot, sandbox: true })}\n`);
}

function assertDenied(command) {
  const response = commandDecision(command);
  assert.equal(response.permission, "deny", command);
  assert.match(response.user_message, /^Command blocked by the local shell guard/u);
}

// Regression for #1: `(` and `)` fused into the adjacent word, so
// executableName("(rm") returned "(rm" and matched no rule.
test("blocks destructive commands wrapped in a subshell", () => {
  for (const command of [
    "(rm -rf /)",
    "(git push --force origin main)",
    "(git reset --hard)",
    "(cd /tmp && rm -rf /)",
  ]) {
    assertDenied(command);
  }
});

// Regression for #1: `{` and `}` were not operators either.
test("blocks destructive commands wrapped in a brace group", () => {
  for (const command of ["{ rm -rf /; }", "{ npm publish; }", "{ git reset --hard; }"]) {
    assertDenied(command);
  }
});

// Regression for #1: splitSegments split on `;` only, so the leading keyword
// became the segment's first word and the executable resolved to `then`.
test("blocks destructive commands behind a leading shell keyword", () => {
  for (const command of [
    "if true; then rm -rf /; fi",
    "while true; do rm -rf /; done",
    "! git push --force origin main",
    "if true; then npm publish; else git reset --hard; fi",
  ]) {
    assertDenied(command);
  }
});

// Regression for #1: unwrapCommand knew env/sudo/command/builtin/nohup only.
test("blocks destructive commands behind exec, time, xargs, and timeout wrappers", () => {
  for (const command of [
    "exec rm -rf /",
    "exec -a disguise rm -rf /",
    "time rm -rf /",
    "time -p git reset --hard",
    "xargs -n 1 rm -rf /",
    "timeout 5 rm -rf /",
  ]) {
    assertDenied(command);
  }
});

// Regression for #6: MUTATING_COMMANDS omitted the truncation/overwrite tools.
test("blocks evaluator and canary mutation via copy, tee, dd, sed, and link", () => {
  for (const command of [
    "cp /dev/null evaluators/x.json",
    "tee evaluators/x.json",
    'sed -i "" s/a/b/ canary.txt',
    "dd if=/dev/zero of=evaluators/x.json",
    "ln -sf /dev/null tests/evaluators/check.mjs",
    "install -m 644 /dev/null fixtures/canaries/marker.txt",
  ]) {
    assertDenied(command);
  }
});

// Grouping the guard cannot confidently pair is grouping it cannot inspect.
test("fails closed on unbalanced grouping syntax", () => {
  for (const command of ["(rm -rf /", "{ rm -rf /;", "echo )", "( ( echo hi )"]) {
    assertDenied(command);
  }
});

// The parser changes must not widen the denylist onto ordinary development.
test("still allows ordinary development commands", () => {
  for (const command of [
    "ls -la",
    "git status",
    "npm test",
    "node --test",
    "rm -rf ./dist",
    "cp package.json package.json.bak",
    "sed -n 1,5p README.md",
    "rm -rf ${HOME}/scratch",
    "echo {a,b}",
    'find . -name "*.log" -exec rm {} \\;',
    "(cd packages/app && npm run build)",
    "if true; then npm test; fi",
    "echo $(printf safe)",
  ]) {
    assert.deepEqual(commandDecision(command), { permission: "allow" }, command);
  }
});

// The fail-closed contract is the hook's core guarantee; a tokenizer refactor
// must not turn a parse failure into an allow.
test("fails closed on empty, non-JSON, and command-less input", () => {
  const denial = {
    permission: "deny",
    user_message: "Command blocked by the local shell guard (invalid-hook-input).",
    agent_message:
      "The deterministic beforeShellExecution guard denied this command. Ask the user to perform or explicitly revise the operation.",
  };

  assert.deepEqual(runHook(""), denial, "empty stdin");
  assert.deepEqual(runHook("not-json\n"), denial, "non-JSON stdin");
  assert.deepEqual(runHook('{"sandbox":true}\n'), denial, "JSON missing command");
});

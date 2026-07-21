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

// Review item 1: `timeout 5 rm -rf /` was covered, but every value-taking flag
// halted resolution on the numeric duration and resolved the wrong executable
// (`timeout -s KILL 5 rm -rf /` resolved to `kill` and allowed). Bare-form-only
// coverage is what let this through, so each wrapper is now exercised in its
// separated (`-k 10`), attached (`-k10`), and `--flag=value` forms.
test("blocks destructive commands behind wrapper value-taking flags", () => {
  for (const command of [
    "timeout -s KILL 5 rm -rf /",
    "timeout --signal KILL 5 rm -rf /",
    "timeout --signal=KILL 5 rm -rf /",
    "timeout -k 10 5 rm -rf /",
    "timeout -k10 5 rm -rf /",
    "timeout --kill-after=10 5 rm -rf /",
    "timeout -s KILL -k 10 5 rm -rf /",
    "timeout -k 10 5 git push --force origin main",
    "env -u PATH rm -rf /",
    "env --unset PATH rm -rf /",
    "env -C /tmp rm -rf /",
    "env FOO=1 -u BAR rm -rf /",
    "sudo -u root rm -rf /",
    "sudo --user root rm -rf /",
    "sudo -g wheel -u root rm -rf /",
    "sudo -p prompt rm -rf /",
    "exec -a disguise rm -rf /",
    "xargs -I {} rm -rf /",
    "xargs --max-args 1 rm -rf /",
    "xargs -n 1 -P 4 rm -rf /",
    "nice -n 10 rm -rf /",
    "nice --adjustment 10 rm -rf /",
    "ionice -c 2 -n 4 rm -rf /",
    "doas -u root rm -rf /",
    "chrt -p 1 rm -rf /",
    "chrt 5 rm -rf /",
    "taskset -c 0 rm -rf /",
    "taskset 0x1 rm -rf /",
    "stdbuf -o 0 rm -rf /",
    "time -o out.txt rm -rf /",
    "command -p rm -rf /",
    "nice -10 rm -rf /",
    "ionice -c2 -n4 rm -rf /",
  ]) {
    assertDenied(command);
  }
});

// Review item: wrapper enumeration stopped one word short of these names.
// Name-based unwrapping cannot be exhaustive — see docs/threat-model.md — but
// the enumerated set must at least cover the common process wrappers.
test("blocks destructive commands behind additional process wrappers", () => {
  for (const command of [
    "nice rm -rf /",
    "setsid rm -rf /",
    "ionice rm -rf /",
    "doas rm -rf /",
    "chroot / rm -rf /",
    "script -c 'rm -rf /' /dev/null",
    "nohup setsid nice rm -rf /",
    "sudo -u root timeout -k 5 10 git push --force origin main",
  ]) {
    assertDenied(command);
  }
});

// Review item 2: every `case` arm's `)` is unpaired, which drove parenDepth
// negative and denied all `case` statements as invalid input — a regression
// against `main`. The arms must parse *and* still be inspected.
test("parses case statements and inspects their arms", () => {
  for (const command of [
    "case $x in a) echo hi;; esac",
    "case $x in a) echo hi;; b) ls;; *) pwd;; esac",
    "case $x in (a) echo hi;; esac",
    "case $x in a|b) npm test;; esac",
    "case $x in a) case $y in b) echo nested;; esac;; esac",
  ]) {
    assert.deepEqual(commandDecision(command), { permission: "allow" }, command);
  }

  for (const command of [
    "case $x in a) rm -rf /;; esac",
    "case $x in a) echo ok;; *) git push --force origin main;; esac",
    "case $x in a) case $y in b) npm publish;; esac;; esac",
  ]) {
    assertDenied(command);
  }
});

// `case`, `in`, and `esac` are reserved only in command position. Tracking
// them unconditionally made `grep case notes.txt` fail closed, because the
// argument opened a case construct that was never terminated.
test("treats case keywords in argument position as ordinary words", () => {
  for (const command of [
    "grep case notes.txt",
    "echo case",
    "git grep esac",
    "grep -r in src",
    "find . -name case",
    "echo case > out.txt",
    'git commit -m "handle the case where in fails"',
  ]) {
    assert.deepEqual(commandDecision(command), { permission: "allow" }, command);
  }
});

// An unterminated `case` is grouping the guard cannot pair, so it fails closed
// exactly like an unbalanced paren. A stray `)` outside a case stays denied.
test("fails closed on unterminated case and stray parentheses", () => {
  for (const command of ["case $x in a) echo hi;;", "echo done)", "case $x in"]) {
    assertDenied(command);
  }
});

// Pre-existing bypass, now fixed: bash removes backslash-newline entirely, so
// the shell saw `rm -rf /` where the guard saw a wrapped, harmless-looking word.
test("blocks destructive commands split by line continuations", () => {
  for (const command of [
    "rm -rf \\\n/",
    "rm \\\n-rf \\\n/",
    "git push \\\n--force origin main",
  ]) {
    assertDenied(command);
  }
});

// Pre-existing bypass, now fixed: `>|` and `>&` truncate a protected file just
// as `>` does, and `>|` additionally split the segment on its `|`.
test("blocks protected-artifact writes through every redirect operator", () => {
  for (const command of [
    "echo x > canary.txt",
    "echo x >> canary.txt",
    "echo x >| canary.txt",
    "echo x >& canary.txt",
    "echo x &> canary.txt",
    "echo x &>> canary.txt",
    "echo x >| evaluators/x.json",
  ]) {
    assertDenied(command);
  }
});

// Pre-existing bypass, now fixed: the high-impact target list was compared as
// raw text, so any path spelling that normalizes to `/` evaded it.
test("blocks high-impact delete targets across path spellings", () => {
  for (const command of [
    "rm -rf /",
    "rm -rf //",
    "rm -rf ///",
    "rm -rf /.",
    "rm -rf /..",
    "rm -rf /./",
    "rm -rf ./",
    "rm -rf ./.",
    "rm -rf ./.git",
    "rm -rf .git/",
    "rm -rf ${HOME}/",
  ]) {
    assertDenied(command);
  }
});

// Normalization must not widen the rule onto ordinary relative paths.
test("still allows scoped deletes that only resemble high-impact targets", () => {
  for (const command of [
    "rm -rf ./dist",
    "rm -rf dist/",
    "rm -rf ./build/../dist",
    "rm -rf ${HOME}/scratch",
    "rm -rf /tmp/build",
    "rm -rf node_modules",
  ]) {
    assert.deepEqual(commandDecision(command), { permission: "allow" }, command);
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
  assert.deepEqual(runHook('{"command":""}\n'), denial, "empty command");
  assert.deepEqual(runHook('{"command":null}\n'), denial, "null command");
  assert.deepEqual(runHook('{"command":42}\n'), denial, "numeric command");
  assert.deepEqual(runHook('{"command":["rm","-rf","/"]}\n'), denial, "array command");
  assert.deepEqual(runHook('{"command":{"a":1}}\n'), denial, "object command");
  assert.deepEqual(runHook("null\n"), denial, "null payload");
  assert.deepEqual(runHook("[]\n"), denial, "array payload");
  assert.deepEqual(runHook("7\n"), denial, "number payload");
  assert.deepEqual(
    runHook(`${JSON.stringify({ command: "a".repeat(2 * 1024 * 1024) })}\n`),
    denial,
    "oversize payload",
  );
});

// The guard cannot tell a path operand from pattern text, and cannot reliably
// detect in-place editing across GNU and BSD `sed`. It therefore denies any
// mutation-capable tool that names a protected artifact, including read-only
// uses. This is deliberate conservatism, and `protected-artifact-reference` is
// named for that breadth — see docs/threat-model.md.
test("denies mutation-capable tools naming protected artifacts, reads included", () => {
  for (const command of [
    'sed -i "" s/a/b/ canary.txt',
    "sed -n 1p evaluators/x.json",
    "sed -n '/canary/p' notes.txt",
  ]) {
    assertDenied(command);
  }

  // Tools with no mutating mode are unaffected, so reading stays possible.
  for (const command of ["cat evaluators/x.json", "grep canary notes.txt"]) {
    assert.deepEqual(commandDecision(command), { permission: "allow" }, command);
  }
});

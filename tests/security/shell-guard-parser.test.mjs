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

// Confirmed bypass: `eval` was in neither SHELL_KEYWORDS nor the wrapper table,
// so unwrapCommand resolved the executable to `eval` itself and every rule that
// keys off the executable — rm, git, gh, npm, protected-path — missed. A cold
// reviewer ran these against a real canary directory and deleted it.
test("blocks destructive commands passed to eval", () => {
  for (const command of [
    "eval rm -rf /",
    "eval 'rm -rf /'",
    'eval "rm -rf /"',
    'eval "git push --force origin main"',
    "eval 'echo ok; rm -rf /'",
    "eval eval rm -rf /",
    "sudo eval rm -rf /",
    "eval 'npm publish'",
  ]) {
    assertDenied(command);
  }
});

// `eval` is inspected by recursing into its joined operands rather than denied
// outright, so operands that resolve to something harmless stay usable.
test("still allows eval of non-destructive commands", () => {
  for (const command of ["eval echo hi", "eval 'npm test'", "eval ls"]) {
    assert.deepEqual(commandDecision(command), { permission: "allow" }, command);
  }
});

// Confirmed bypass: `<<` and `<` were operator literals but not segment
// operators, so the payload stayed in the interpreter's own segment and the
// words read as `[bash, rm, -rf, /]` — `rm` looked like an argument to `bash`.
// `<<<` was not tokenized as an operator at all.
test("blocks destructive here-strings and here-documents", () => {
  for (const command of [
    "bash <<< 'rm -rf /'",
    'bash <<< "rm -rf /"',
    "sh <<< 'rm -rf /'",
    "zsh <<< 'git reset --hard'",
    "bash << EOF\nrm -rf /\nEOF",
    "sh << 'EOF'\nnpm publish\nEOF",
  ]) {
    assertDenied(command);
  }
});

// The payload is only a script when an interpreter reads it. Feeding text to a
// non-interpreter on stdin must not be inspected as a command.
test("still allows here-strings feeding non-interpreters", () => {
  for (const command of [
    "cat <<< 'rm -rf /'",
    "bash <<< 'npm test'",
    "grep foo <<< 'some text'",
  ]) {
    assert.deepEqual(commandDecision(command), { permission: "allow" }, command);
  }
});

// Confirmed bypass: inspectSubstitutions recursed into the substitution *body*
// (`echo rm`, harmless) but never modelled that its *result* becomes the
// command name. tokenize split on `(`/`)`, leaving a final segment `[-rf, /]`
// whose executable parsed as `-rf` and matched no rule.
test("blocks commands whose name comes from a substitution or variable", () => {
  for (const command of [
    "$(echo rm) -rf /",
    "`echo rm` -rf /",
    '"$(echo rm)" -rf /',
    "$FOO -rf /",
    "${CMD} -rf /",
    "$SHELL -c 'rm -rf /'",
  ]) {
    assertDenied(command);
  }
});

// The unresolvable-name rule inspects the command name only. Substitutions and
// variables in argument position keep their existing meaning.
test("still allows substitutions and variables in argument position", () => {
  for (const command of [
    "echo $(printf safe)",
    "rm -rf ${HOME}/scratch",
    "git commit -m \"$(cat msg.txt)\"",
    "echo $HOME",
    "for i in a b c; do echo $i; done",
    "case $x in a) echo hi;; esac",
    "select opt in a b; do echo $opt; done",
  ]) {
    assert.deepEqual(commandDecision(command), { permission: "allow" }, command);
  }
});

// Confirmed bypass: the interpreter list covered `sh|bash|zsh|dash|script` and
// missed the `ksh` family; `busybox` and `watch` were absent from the wrapper
// table, so `busybox sh -c CMD` resolved to `busybox` and `watch rm` to `watch`.
test("blocks destructive commands behind the widened interpreter list", () => {
  for (const command of [
    "ksh -c 'rm -rf /'",
    "ksh93 -c 'rm -rf /'",
    "mksh -c 'rm -rf /'",
    "ash -c 'rm -rf /'",
    "busybox sh -c 'rm -rf /'",
    "busybox rm -rf /",
    "busybox sh -c 'git push --force origin main'",
    "watch rm -rf /",
    "watch -n 1 rm -rf /",
    "watch --interval 2 npm publish",
  ]) {
    assertDenied(command);
  }
});

test("still allows non-destructive uses of the widened interpreter list", () => {
  for (const command of [
    "ksh -c 'npm test'",
    "busybox ls",
    "watch date",
    "watch -n 1 git status",
  ]) {
    assert.deepEqual(commandDecision(command), { permission: "allow" }, command);
  }
});

// Found while probing the fixes above, not in the reported set. Both survive
// executableName(): `watch 'rm -rf /'` and `eval$IFS'rm -rf /'` each tokenize
// to a single word ending in `/`, so slicing at the last slash left an empty
// command name, and an empty name is a legitimate assignment-only segment.
// The unresolvable-name rule therefore tests the raw word, not the basename.
test("blocks destructive commands quoted into a single command word", () => {
  for (const command of [
    "watch 'rm -rf /'",
    'watch "rm -rf /"',
    "watch -n 1 'rm -rf /'",
    "eval$IFS'rm -rf /'",
    "$(which rm) -rf /",
    "eval \"$@\"",
  ]) {
    assertDenied(command);
  }
});

test("still allows watch over non-destructive commands", () => {
  for (const command of [
    "watch date",
    "watch 'git status'",
    "watch -n 1 'npm test'",
  ]) {
    assert.deepEqual(commandDecision(command), { permission: "allow" }, command);
  }
});

// Adversarial re-review of e3263ab: glob and brace metacharacters in command
// position were unguarded. `/bin/r?` expands to `/bin/rm`, and the reviewer ran
// `/bin/r? -rf ./victim` against a real directory and deleted it. The name a
// glob resolves to is exactly as unknowable as `$(...)`, so it fails closed.
test("blocks glob and brace expansion in command position", () => {
  for (const command of [
    "/bin/r? -rf ./victim",
    "/bin/[r]m -rf /",
    "/bin/r[m] -rf /",
    "/bin/*m -rf /",
    "/bin/?m -rf /",
    "/bin/r* -rf /",
    "/usr/bin/r?? -rf /",
    "r? -rf /",
    "{rm,x} -rf /",
    "bash << EOF\n/bin/r? -rf /\nEOF",
  ]) {
    assertDenied(command);
  }
});

// Globs are only unresolvable in *command* position. As operands they are
// ordinary, and `[`/`[[` are the test builtins rather than character classes.
test("still allows globs in argument position and the test builtins", () => {
  for (const command of [
    "ls *.log",
    "rm -rf ./dist/*",
    "npm run build && ls dist/*.js",
    "for f in *.log; do echo $f; done",
    "if [ -f x ]; then npm test; fi",
    '[ -z "$x" ] && echo empty',
    "[[ -f x ]] && npm test",
  ]) {
    assert.deepEqual(commandDecision(command), { permission: "allow" }, command);
  }
});

// A here-document body is stdin data, not source. Parsing it as commands denied
// ordinary documents: `cat <<EOF > notes.md` followed by prose that happens to
// contain `rm -rf /` was blocked. The body is a script only when an interpreter
// reads it, and `<<-` must tokenize as its own operator or the tab-stripping
// form leaves `-EOF` parsing as a command name.
test("treats here-document bodies as data unless an interpreter reads them", () => {
  for (const command of [
    "cat <<EOF > doc.md\nrm -rf / destroys everything\nEOF",
    "cat <<-EOF\nhello\nEOF",
    "cat <<-EOF > doc.md\n\trm -rf / is bad\n\tEOF",
    "cat <<'EOF'\nrm -rf /\nEOF",
    "python <<EOF\nprint('rm -rf /')\nEOF",
    "cat <<EOF\nunterminated body rm -rf /",
  ]) {
    assert.deepEqual(commandDecision(command), { permission: "allow" }, command);
  }

  // An interpreter still runs the body, tab-stripped and quoted forms included.
  for (const command of [
    "bash << EOF\nrm -rf /\nEOF",
    "sh <<-EOF\nrm -rf /\nEOF",
    "bash <<'EOF'\nrm -rf /\nEOF",
  ]) {
    assertDenied(command);
  }

  // The reader's own redirects survive body extraction.
  assertDenied("cat <<EOF > canary.txt\nhello\nEOF");
});

// The here-string payload is the reader's stdin, so it is never a command name.
// Treating it as one denied `grep foo <<< "$INPUT"` on its own payload.
test("treats here-string payloads as data for non-interpreters", () => {
  for (const command of [
    'grep foo <<< "$INPUT"',
    'sort <<< "${x}"',
    "cat <<< 'rm -rf /'",
    "bash <<< 'npm test'",
  ]) {
    assert.deepEqual(commandDecision(command), { permission: "allow" }, command);
  }
});

// A word that is entirely one substitution has already had its body inspected,
// and with no operands beside it there is nothing more to evaluate. Denying it
// blocked the ubiquitous shell-init idioms, and a guard people switch off
// protects nothing. Operands alongside it put it back in the deny path.
test("allows a whole-substitution command with no operands", () => {
  for (const command of [
    'eval "$(direnv hook zsh)"',
    'eval "$(direnv hook bash)"',
    'eval "$(ssh-agent -s)"',
    'eval "$(brew shellenv)"',
  ]) {
    assert.deepEqual(commandDecision(command), { permission: "allow" }, command);
  }

  // Operands beside the substitution, or a body that is itself destructive.
  for (const command of [
    "$(echo rm) -rf /",
    "$(echo git) push --force origin main",
    "$(echo npm) publish",
    "$(rm -rf /)",
    "`rm -rf /`",
    'eval "$@"',
  ]) {
    assertDenied(command);
  }
});

// Regression for the same review: consuming `$(...)` as one word must not lose
// the substitution-body inspection that runs before tokenizing.
test("still inspects substitution bodies after whole-word tokenization", () => {
  for (const command of [
    "echo $(rm -rf /)",
    "x=$(rm -rf /)",
    "$(rm -rf /",
  ]) {
    assertDenied(command);
  }
});

// Running out of nesting budget means the guard has stopped reading a command
// string it knows is there. That is exactly when it must not degrade to allow.
test("fails closed when nested shell depth is exhausted", () => {
  for (const command of [
    'sh -c "sh -c \\"sh -c \\\\\\"sh -c rm\\\\\\"\\""',
    'eval "eval \\"eval \\\\\\"eval rm -rf /\\\\\\"\\""',
  ]) {
    assertDenied(command);
  }
});

// OPEN PRODUCT DECISION — this test pins current behaviour, not desired
// behaviour. `find -exec CMD` is arbitrary command execution that no rule
// inspects, and `find . -exec rm -rf {} \;` was a confirmed canary deletion.
// before-shell-execution.mjs implements findExecutesMutatingCommand behind
// `DENY_FIND_EXEC = false`; flipping that constant makes the first case below
// deny and is a deliberate tradeoff, because the guard cannot tell scoped
// cleanup (`-name '*.tmp' -exec rm {}`) from `-exec rm -rf {}`. Whoever flips
// it owns this assertion.
test("find -exec stays allowed pending a product decision", () => {
  for (const command of [
    'find . -name "*.log" -exec rm {} \\;',
    "find . -type f -exec chmod 644 {} \\;",
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

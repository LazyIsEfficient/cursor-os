import {
  GH_PR_WITHOUT_VERIFY_AGENT_MESSAGE,
  GH_PR_WITHOUT_VERIFY_RULE,
  GIT_PUSH_WITHOUT_VERIFY_AGENT_MESSAGE,
  GIT_PUSH_WITHOUT_VERIFY_RULE,
  resolveGitWorkTreeFromArgv,
  verifyLedgerAllowsGhPr,
  verifyLedgerProjectRoot,
} from "./lib/verify-ledger-lib.mjs";

const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_NESTED_SHELL_DEPTH = 3;

// Exact command forms only — not a general `eval` carve-out.
const NAMED_EXCEPTIONS = new Set([
  'eval "$(direnv hook zsh)"',
  'eval "$(ssh-agent -s)"',
]);

const SEGMENT_OPERATORS = new Set([";", ";;", "&&", "||", "|", "&", "\n"]);
const REDIRECT_OPERATORS = new Set([">", ">>"]);

// Paths the benchmark harness must keep intact; mutations fail closed even as
// otherwise-literal allowlisted forms.
const PROTECTED_PATH_PATTERN =
  /(?:^|[/\\._-])(?:evaluators?|canaries?)(?:$|[/\\._-])/i;
const MUTATING_COMMANDS = new Set([
  "chmod",
  "chown",
  "mv",
  "rm",
  "shred",
  "truncate",
  "unlink",
]);

const SHELL_INTERPRETERS = new Set([
  "ash",
  "bash",
  "dash",
  "ksh",
  "ksh88",
  "ksh93",
  "mksh",
  "pdksh",
  "sh",
  "zsh",
]);

const WRAPPER_COMMANDS = new Set([
  "builtin",
  "command",
  "env",
  "nohup",
  "sudo",
]);

// Launchers whose first non-option operand is another command. Peel them and
// re-apply policy to the resolved command. Homebrew GNU coreutils (`gtimeout`,
// `gnice`, `gstdbuf`, `gtime`) map to the same peel logic as the unprefixed
// names. Unknown launchers are not enumerated forever — after peel, any
// remaining high-impact basename is re-checked structurally.
const COMMAND_LAUNCHERS = new Set([
  "busybox",
  "nice",
  "stdbuf",
  "time",
  "timeout",
]);

// Homebrew / MacPorts GNU coreutils prefixes → canonical launcher kind.
const GNU_COREUTILS_LAUNCHERS = new Map([
  ["gnice", "nice"],
  ["gstdbuf", "stdbuf"],
  ["gtime", "time"],
  ["gtimeout", "timeout"],
]);

// Basenames whose argument shapes are high-impact. After wrappers/known
// launchers are peeled, any remaining argv word with one of these basenames is
// reconstructed and re-checked so unlisted launchers (`ionice`, `xargs`, …)
// cannot hide `rm -rf` / destructive git. Not an exhaustive launcher list.
const HIGH_IMPACT_EXECUTABLES = new Set([
  "busybox",
  "gh",
  "git",
  "npm",
  "pnpm",
  "rm",
]);

// Git config keys that can run a shell command when set via `git -c`.
const GIT_SHELL_ESCAPE_KEYS = new Set([
  "core.editor",
  "core.pager",
  "core.sshcommand",
  "diff.external",
  "diff.tool",
  "interactive.difffilter",
  "merge.tool",
]);

function decision(permission, rule, agentMessage) {
  if (permission === "allow") {
    return { permission: "allow" };
  }

  return {
    permission: "deny",
    user_message: `Command blocked by the local shell guard (${rule}).`,
    agent_message:
      agentMessage ??
      "The deterministic beforeShellExecution guard denied this command. Ask the user to perform or explicitly revise the operation.",
  };
}

function tokenize(command) {
  const tokens = [];
  let value = "";
  let quote = null;
  let escaped = false;

  const emitWord = () => {
    if (value.length > 0) {
      tokens.push({ kind: "word", value });
      value = "";
    }
  };

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];

    if (escaped) {
      value += character;
      escaped = false;
      continue;
    }

    if (quote === "'") {
      if (character === "'") {
        quote = null;
      } else {
        value += character;
      }
      continue;
    }

    if (quote === '"') {
      if (character === '"') {
        quote = null;
      } else if (character === "\\") {
        escaped = true;
      } else {
        value += character;
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === "\n") {
      emitWord();
      tokens.push({ kind: "operator", value: "\n" });
      continue;
    }

    if (/\s/u.test(character)) {
      emitWord();
      continue;
    }

    const pair = command.slice(index, index + 2);
    if (["&&", "||", ";;", ">>", "<<"].includes(pair)) {
      emitWord();
      tokens.push({ kind: "operator", value: pair });
      index += 1;
      continue;
    }

    if ([";", "|", "&", ">", "<"].includes(character)) {
      emitWord();
      tokens.push({ kind: "operator", value: character });
      continue;
    }

    value += character;
  }

  if (quote !== null || escaped) {
    throw new Error("unterminated shell token");
  }

  emitWord();
  return tokens;
}

function splitSegments(tokens) {
  const segments = [];
  let segment = [];

  for (const token of tokens) {
    if (token.kind === "operator" && SEGMENT_OPERATORS.has(token.value)) {
      if (segment.length > 0) {
        segments.push(segment);
        segment = [];
      }
    } else {
      segment.push(token);
    }
  }

  if (segment.length > 0) {
    segments.push(segment);
  }
  return segments;
}

function executableName(value) {
  const normalized = value.replaceAll("\\", "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1).toLowerCase();
}

function isAssignment(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/u.test(value);
}

// Literal path-like command word: no glob, brace, tilde, dollar, quotes, or
// grouping metacharacters that the shell would expand before execution.
function isSafeCommandWord(word) {
  return (
    word.length > 0 &&
    !word.startsWith("-") &&
    /^[A-Za-z0-9_./][A-Za-z0-9_./+-]*$/u.test(word)
  );
}

function isSafeAssignment(word) {
  const separator = word.indexOf("=");
  if (separator <= 0) {
    return false;
  }
  const name = word.slice(0, separator);
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(name);
}

// Fail closed on any GIT_CONFIG_* assignment — same control family as `git -c`
// (GIT_CONFIG_PARAMETERS, GIT_CONFIG_COUNT / KEY_n / VALUE_n, and unknown names).
function isGitConfigEnvAssignment(word) {
  if (!isAssignment(word)) {
    return false;
  }
  const name = word.slice(0, word.indexOf("="));
  return /^GIT_CONFIG_/u.test(name);
}

function launcherKind(executable) {
  if (COMMAND_LAUNCHERS.has(executable)) {
    return executable;
  }
  return GNU_COREUTILS_LAUNCHERS.get(executable) ?? null;
}

function substitutionEnd(command, start, kind) {
  let quote = null;
  let escaped = false;
  let depth = kind === "dollar" || kind === "process" ? 1 : 0;

  for (let index = start; index < command.length; index += 1) {
    const character = command[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === "'") {
      if (character === "'") {
        quote = null;
      }
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "'") {
      quote = "'";
      continue;
    }
    if (character === '"') {
      quote = quote === '"' ? null : '"';
      continue;
    }
    if (kind === "backtick" && character === "`") {
      return index;
    }
    if (
      (kind === "dollar" || kind === "process") &&
      quote === null
    ) {
      if (character === "(") {
        depth += 1;
      }
      if (character === ")") {
        depth -= 1;
        if (depth === 0) {
          return index;
        }
      }
    }
  }

  throw new Error("unterminated shell substitution");
}

// Active expansions the shell runs as commands (or as process substitutions),
// including ANSI-C `$'...'` quoting which rewrites argument bytes after the
// guard would otherwise read them as ordinary text. Single-quoted text is
// inert. Presence of a runnable expansion is denied so a missed mechanism
// fails closed; unterminated forms throw and fail closed as invalid input.
function containsActiveCommandExpansion(command) {
  let quote = null;
  let escaped = false;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (quote === "'") {
      if (character === "'") {
        quote = null;
      }
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (quote === '"') {
      if (character === '"') {
        quote = null;
        continue;
      }
      if (character === "`") {
        index = substitutionEnd(command, index + 1, "backtick");
        return true;
      }
      if (character === "$" && command[index + 1] === "(") {
        index = substitutionEnd(command, index + 2, "dollar");
        return true;
      }
      if (character === "$" && command[index + 1] === "'") {
        return true;
      }
      continue;
    }

    if (character === "'") {
      quote = "'";
      continue;
    }

    if (character === '"') {
      quote = '"';
      continue;
    }

    if (character === "`") {
      index = substitutionEnd(command, index + 1, "backtick");
      return true;
    }

    if (character === "$" && command[index + 1] === "(") {
      index = substitutionEnd(command, index + 2, "dollar");
      return true;
    }

    // ANSI-C quoting: $'...' rewrites the word (e.g. $'-rf' → -rf).
    if (character === "$" && command[index + 1] === "'") {
      return true;
    }

    if (
      (character === "<" || character === ">") &&
      command[index + 1] === "("
    ) {
      index = substitutionEnd(command, index + 2, "process");
      return true;
    }
  }

  return false;
}

function hasShortFlag(arguments_, flag) {
  return arguments_.some(
    (argument) =>
      /^-[^-]/u.test(argument) &&
      argument
        .slice(1)
        .split("")
        .includes(flag),
  );
}

function skipWrapperFlags(executable, words, startIndex) {
  let index = startIndex + 1;

  if (executable === "env") {
    while (
      index < words.length &&
      (words[index].startsWith("-") || isAssignment(words[index]))
    ) {
      if (["-u", "--unset", "-C", "--chdir"].includes(words[index])) {
        index += 1;
      }
      index += 1;
    }
    return index;
  }

  if (executable === "sudo") {
    while (index < words.length && words[index].startsWith("-")) {
      if (["-u", "-g", "-h", "-p", "-C"].includes(words[index])) {
        index += 1;
      }
      index += 1;
    }
    return index;
  }

  while (index < words.length && words[index].startsWith("-")) {
    index += 1;
  }
  return index;
}

// Skip launcher options (and operands such as timeout's DURATION) so the next
// word is the command the launcher will exec. `executable` is the canonical
// launcher kind (see `launcherKind`).
function skipLauncherOperands(executable, words, startIndex) {
  let index = startIndex + 1;

  if (executable === "timeout") {
    while (index < words.length && words[index].startsWith("-")) {
      const option = words[index];
      if (
        ["-k", "--kill-after", "-s", "--signal"].includes(option) ||
        option.startsWith("--kill-after=") ||
        option.startsWith("--signal=")
      ) {
        if (!option.includes("=")) {
          index += 1;
        }
      }
      index += 1;
    }
    // DURATION is required before COMMAND.
    if (index < words.length) {
      index += 1;
    }
    return index;
  }

  if (executable === "nice") {
    while (index < words.length && words[index].startsWith("-")) {
      const option = words[index];
      if (option === "-n" || option === "--adjustment") {
        index += 1;
      } else if (option.startsWith("-n") && option.length > 2) {
        // -nN form; no separate operand.
      } else if (option.startsWith("--adjustment=")) {
        // inline value
      }
      index += 1;
    }
    return index;
  }

  if (executable === "busybox") {
    while (index < words.length && words[index].startsWith("-")) {
      index += 1;
    }
    // Leave index on the applet name so the next loop iteration inspects it.
    return index;
  }

  if (executable === "time") {
    while (index < words.length && words[index].startsWith("-")) {
      const option = words[index];
      if (
        ["-f", "-o", "--format", "--output"].includes(option) ||
        option.startsWith("--format=") ||
        option.startsWith("--output=")
      ) {
        if (!option.includes("=")) {
          index += 1;
        }
      }
      index += 1;
    }
    return index;
  }

  if (executable === "stdbuf") {
    while (index < words.length && words[index].startsWith("-")) {
      const option = words[index];
      if (
        ["-i", "-o", "-e", "--input", "--output", "--error"].includes(option) ||
        option.startsWith("--input=") ||
        option.startsWith("--output=") ||
        option.startsWith("--error=")
      ) {
        if (!option.includes("=") && option.length <= 2) {
          index += 1;
        } else if (
          ["--input", "--output", "--error"].includes(option)
        ) {
          index += 1;
        }
      }
      index += 1;
    }
    return index;
  }

  return index;
}

function isDangerousGitConfigAssignment(assignment) {
  const separator = assignment.indexOf("=");
  const key =
    separator === -1
      ? assignment.toLowerCase()
      : assignment.slice(0, separator).toLowerCase();
  const value = separator === -1 ? "" : assignment.slice(separator + 1);

  // Shell-running aliases: `alias.foo=!cmd` and any `-c` override of alias.*.
  if (key.startsWith("alias.")) {
    return true;
  }
  if (value.includes("!")) {
    return true;
  }
  return GIT_SHELL_ESCAPE_KEYS.has(key);
}

// Fail closed on `git -c` / `--config-env` forms that can bind a shell-running
// value (alias.!cmd, core.pager, diff.external, …). `--config-env` reads the
// value from the process environment, so the command string alone cannot prove
// it safe — deny the flag family entirely.
function gitConfigInjectionRule(arguments_) {
  let index = 0;
  while (index < arguments_.length) {
    const argument = arguments_[index];
    if (argument === "-c") {
      const assignment = arguments_[index + 1];
      if (assignment === undefined || isDangerousGitConfigAssignment(assignment)) {
        return "git-config-injection";
      }
      index += 2;
      continue;
    }
    if (argument.startsWith("-c") && argument.length > 2) {
      // Rare glued form: -ckey=value
      if (isDangerousGitConfigAssignment(argument.slice(2))) {
        return "git-config-injection";
      }
      index += 1;
      continue;
    }
    if (
      argument === "--config-env" ||
      argument.startsWith("--config-env=")
    ) {
      return "git-config-injection";
    }
    if (!argument.startsWith("-") || argument === "--") {
      break;
    }
    if (
      ["-C", "--git-dir", "--work-tree", "--namespace"].includes(argument)
    ) {
      index += 2;
      continue;
    }
    index += 1;
  }
  return null;
}

function gitCommand(arguments_) {
  let index = 0;

  while (index < arguments_.length && arguments_[index].startsWith("-")) {
    if (
      ["-C", "-c", "--git-dir", "--work-tree", "--namespace"].includes(
        arguments_[index],
      )
    ) {
      index += 1;
    }
    index += 1;
  }

  return {
    subcommand: (arguments_[index] ?? "").toLowerCase(),
    arguments: arguments_.slice(index + 1),
  };
}

// Peel `gh` global options (`-R`/`--repo`, `--hostname`, …) so high-impact
// matching sees the group name after flags.
const GH_VALUE_TAKING_FLAGS = new Set(["-R", "--repo", "--hostname"]);

// Resolve the verb that follows the group name: scan for the first non-flag
// word while consuming values of gh's value-taking flags, including glued
// `-Ro/r` and `--repo=o/r` forms. Unknown flags that are not `--flag=value`
// form conservatively consume NO value (matching cobra's subcommand search,
// which errors on flags the parent group does not define). `--` before the
// verb makes the position unresolvable — callers fail closed.
function resolveGhVerb(arguments_) {
  let index = 0;

  while (index < arguments_.length) {
    const argument = arguments_[index];
    if (argument === "--") {
      return { verb: null, ambiguous: true };
    }
    if (!argument.startsWith("-") || argument === "-") {
      return { verb: argument.toLowerCase(), ambiguous: false };
    }
    if (argument.includes("=")) {
      // --flag=value / glued -R=o/r: value inline, no operand consumed.
      index += 1;
      continue;
    }
    if (GH_VALUE_TAKING_FLAGS.has(argument)) {
      index += 2;
      continue;
    }
    if (/^-R\S/u.test(argument)) {
      // Glued shorthand: -Ro/r
      index += 1;
      continue;
    }
    // Unknown flag: cobra skips an unknown flag AND its value when locating
    // subcommands, so we cannot know whether it takes a value. Fail closed.
    return { verb: null, ambiguous: true };
  }

  return { verb: null, ambiguous: true };
}

function ghCommand(arguments_) {
  let index = 0;

  while (index < arguments_.length && arguments_[index].startsWith("-")) {
    const argument = arguments_[index];
    if (argument.includes("=")) {
      index += 1;
      continue;
    }
    if (GH_VALUE_TAKING_FLAGS.has(argument)) {
      index += 2;
      continue;
    }
    index += 1;
  }

  const ghArgs = arguments_.slice(index + 1);
  return {
    subcommand: (arguments_[index] ?? "").toLowerCase(),
    arguments: ghArgs,
    ...resolveGhVerb(ghArgs),
  };
}

// Fail-closed mapping when the verb position after the group name cannot be
// resolved: Tier-A-shaped groups deny with their most restrictive hard rule;
// Tier-B-shaped groups (below) require the verify ledger.
const GH_AMBIGUOUS_VERB_RULES = new Map([
  ["alias", "gh-alias-mutation"],
  ["auth", "gh-auth-token"],
  ["extension", "gh-extension-install"],
  ["gpg-key", "gh-account-key-add"],
  ["pr", "gh-pr-merge"],
  ["release", "gh-release-mutation"],
  ["repo", "remote-object-delete"],
  ["ssh-key", "gh-account-key-add"],
]);
const GH_AMBIGUOUS_VERB_LEDGER_GROUPS = new Set([
  "secret",
  "variable",
  "workflow",
]);

// True when `gh api` mutates GitHub state: an explicit mutating -X/--method,
// or the implicit POST gh performs when body flags (-f/--field, -F/--raw-field,
// --input) are present. Read-only forms (no method flags, GET) return false.
function ghApiIsMutation(arguments_) {
  let explicitMethod = null;
  let hasBodyFlags = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "-X" || argument === "--method") {
      explicitMethod = (arguments_[index + 1] ?? "").toUpperCase();
      index += 1;
      continue;
    }
    if (argument.startsWith("--method=")) {
      explicitMethod = argument.slice("--method=".length).toUpperCase();
      continue;
    }
    if (/^-X[A-Za-z]/u.test(argument)) {
      // Glued shorthand: -XPOST
      explicitMethod = argument.slice(2).toUpperCase();
      continue;
    }
    if (
      ["-f", "-F", "--field", "--raw-field", "--input"].includes(argument)
    ) {
      hasBodyFlags = true;
      index += 1;
      continue;
    }
    if (
      argument.startsWith("--field=") ||
      argument.startsWith("--raw-field=") ||
      argument.startsWith("--input=") ||
      /^-[fF]./u.test(argument)
    ) {
      // --field=K=V / glued -fK=V forms.
      hasBodyFlags = true;
    }
  }

  if (explicitMethod !== null) {
    return ["POST", "PUT", "PATCH", "DELETE"].includes(explicitMethod);
  }
  return hasBodyFlags;
}

function isRecursiveForceDelete(arguments_) {
  const recursive =
    arguments_.includes("--recursive") ||
    hasShortFlag(arguments_, "r") ||
    hasShortFlag(arguments_, "R");
  const forced =
    arguments_.includes("--force") || hasShortFlag(arguments_, "f");
  return recursive && forced;
}

// High-impact shapes that remain denied even when the command word is a literal
// allowlisted form. Compose after named exceptions and expansion denial.
// `workspaceRoot` is used for the verify-ledger gate (`git push`, `gh pr
// create|ready`, and mutating `gh api` / Tier-B gh forms).
function highImpactRule(segment, executable, arguments_, workspaceRoot) {
  for (let index = 0; index < segment.length - 1; index += 1) {
    if (
      segment[index].kind === "operator" &&
      REDIRECT_OPERATORS.has(segment[index].value) &&
      segment[index + 1].kind === "word" &&
      PROTECTED_PATH_PATTERN.test(segment[index + 1].value)
    ) {
      return "protected-artifact-write";
    }
  }

  if (
    MUTATING_COMMANDS.has(executable) &&
    arguments_.some((argument) => PROTECTED_PATH_PATTERN.test(argument))
  ) {
    return "protected-artifact-mutation";
  }

  if (executable === "rm" && isRecursiveForceDelete(arguments_)) {
    return "destructive-filesystem-delete";
  }

  if (executable === "git") {
    const configRule = gitConfigInjectionRule(arguments_);
    if (configRule) {
      return configRule;
    }

    const parsed = gitCommand(arguments_);
    const forcePush =
      parsed.arguments.includes("--force") ||
      parsed.arguments.includes("--force-with-lease") ||
      parsed.arguments.includes("--force-if-includes") ||
      parsed.arguments.some((argument) =>
        argument.startsWith("--force-with-lease="),
      ) ||
      hasShortFlag(parsed.arguments, "f") ||
      parsed.arguments.some((argument) => argument.startsWith("+"));

    if (parsed.subcommand === "reset" && parsed.arguments.includes("--hard")) {
      return "git-discard-reset";
    }
    if (
      parsed.subcommand === "clean" &&
      (parsed.arguments.includes("--force") || hasShortFlag(parsed.arguments, "f"))
    ) {
      return "git-destructive-clean";
    }
    if (parsed.subcommand === "push" && forcePush) {
      return "git-history-rewrite";
    }
    // Remote ref deletion: `git push origin :ref` (empty-src refspec) and
    // `git push [--delete|-d] <remote> <ref>` rewrite shared state like a
    // force push — deny alongside it. `--prune` deletes remote refs whose
    // local counterpart is gone; `--mirror` force-updates AND deletes refs —
    // both bypass the force-push/refspec checks otherwise. Exact tokens only,
    // so legitimate src:dst refspecs and plain pushes are untouched.
    if (
      parsed.subcommand === "push" &&
      (parsed.arguments.includes("--delete") ||
        parsed.arguments.includes("--mirror") ||
        parsed.arguments.includes("--prune") ||
        hasShortFlag(parsed.arguments, "d") ||
        parsed.arguments.some((argument) => argument.startsWith(":")))
    ) {
      return "git-remote-ref-delete";
    }
    // Remaining plain `git push` forms require a valid verify ledger for the
    // effective git work tree (from `-C` / `--git-dir` / `--work-tree`), not
    // merely the hook cwd — otherwise a decoy cwd with a valid ledger can
    // authorize pushing a different repo. Unresolvable target → fail closed.
    if (parsed.subcommand === "push") {
      const ledgerRoot = resolveGitWorkTreeFromArgv(arguments_, workspaceRoot);
      if (ledgerRoot === null) {
        return GIT_PUSH_WITHOUT_VERIFY_RULE;
      }
      const allow = verifyLedgerAllowsGhPr(ledgerRoot);
      if (!allow.ok) {
        return GIT_PUSH_WITHOUT_VERIFY_RULE;
      }
    }
    if (
      parsed.subcommand === "branch" &&
      (parsed.arguments.includes("-D") ||
        parsed.arguments.includes("--delete-force") ||
        (parsed.arguments.includes("--delete") &&
          parsed.arguments.includes("--force")))
    ) {
      return "git-force-branch-delete";
    }
  }

  if (executable === "gh") {
    const parsed = ghCommand(arguments_);
    const ghArgs = parsed.arguments;
    const ghVerb = parsed.verb;

    // Verb position unresolvable: deny Tier-A-shaped ambiguity with the
    // group's most restrictive hard rule; ledger-gate Tier-B-shaped groups.
    if (parsed.ambiguous) {
      const ambiguousRule = GH_AMBIGUOUS_VERB_RULES.get(parsed.subcommand);
      if (ambiguousRule) {
        return ambiguousRule;
      }
      if (GH_AMBIGUOUS_VERB_LEDGER_GROUPS.has(parsed.subcommand)) {
        const allow = verifyLedgerAllowsGhPr(workspaceRoot);
        if (!allow.ok) {
          return GH_PR_WITHOUT_VERIFY_RULE;
        }
      }
    }

    if (
      (parsed.subcommand === "repo" && ghVerb === "delete") ||
      (parsed.subcommand === "release" && ghVerb === "delete")
    ) {
      return "remote-object-delete";
    }

    // Tier A hard denies — no verify ledger can make these agent-safe.
    if (
      (parsed.subcommand === "ssh-key" || parsed.subcommand === "gpg-key") &&
      ghVerb === "add"
    ) {
      // Persistent account takeover: a new SSH/GPG key survives the session.
      return "gh-account-key-add";
    }
    if (
      parsed.subcommand === "extension" &&
      (ghVerb === "install" || ghVerb === "upgrade")
    ) {
      // Supply-chain RCE: extensions execute arbitrary code as the user.
      return "gh-extension-install";
    }
    if (
      parsed.subcommand === "alias" &&
      (ghVerb === "set" || ghVerb === "delete")
    ) {
      // Gate bypass: alias expansions are invisible to hook command matching.
      return "gh-alias-mutation";
    }
    if (parsed.subcommand === "pr" && ghVerb === "merge") {
      // Repo doctrine: humans merge. An agent merge skips the ship-gate DAG.
      return "gh-pr-merge";
    }
    if (
      parsed.subcommand === "release" &&
      ["create", "edit", "upload", "delete-asset"].includes(ghVerb)
    ) {
      // Releases are owned by release.yml + the tag-from-main CI guard;
      // upload/delete-asset mutate assets on those owned releases.
      return "gh-release-mutation";
    }
    if (parsed.subcommand === "auth" && ghVerb === "token") {
      // Credential exfiltration: prints the OAuth token to stdout.
      return "gh-auth-token";
    }

    if (
      parsed.subcommand === "pr" &&
      (ghVerb === "create" || ghVerb === "ready")
    ) {
      const allow = verifyLedgerAllowsGhPr(workspaceRoot);
      if (!allow.ok) {
        return GH_PR_WITHOUT_VERIFY_RULE;
      }
    }

    // Tier B ledger gates — reversible shared-state mutations that still
    // require checkpoint:impl-verified, same as `gh pr create|ready`.
    // Read-only forms (view/list/status/checks/diff, `secret list`,
    // `workflow list|view`, `repo view|list`, `pr review --comment`) stay
    // allowed without a ledger.
    if (
      ((parsed.subcommand === "secret" || parsed.subcommand === "variable") &&
        (ghVerb === "set" || ghVerb === "delete")) ||
      (parsed.subcommand === "workflow" &&
        (ghVerb === "run" ||
          ghVerb === "disable" ||
          ghVerb === "enable")) ||
      (parsed.subcommand === "pr" &&
        (ghVerb === "close" || ghVerb === "reopen")) ||
      (parsed.subcommand === "pr" &&
        ghVerb === "review" &&
        (ghArgs.includes("--approve") ||
          ghArgs.includes("--request-changes"))) ||
      (parsed.subcommand === "repo" &&
        (ghVerb === "create" ||
          ghVerb === "fork" ||
          ghVerb === "rename"))
    ) {
      const allow = verifyLedgerAllowsGhPr(workspaceRoot);
      if (!allow.ok) {
        return GH_PR_WITHOUT_VERIFY_RULE;
      }
    }

    // `gh api` is a raw escape hatch around the pr/repo/release gates:
    // `gh api repos/{o}/{r}/pulls -f head=...` creates a PR ungated. Route
    // every mutating call through the same verify ledger as `gh pr create`.
    if (parsed.subcommand === "api" && ghApiIsMutation(parsed.arguments)) {
      const allow = verifyLedgerAllowsGhPr(workspaceRoot);
      if (!allow.ok) {
        return GH_PR_WITHOUT_VERIFY_RULE;
      }
    }
  }

  if (
    ["npm", "pnpm"].includes(executable) &&
    ["publish", "unpublish"].includes(arguments_[0])
  ) {
    return "package-registry-mutation";
  }

  return null;
}

function inspectResolvedCommand(segment, words, index, depth, workspaceRoot) {
  const word = words[index];
  if (!isSafeCommandWord(word)) {
    return "unsafe-command-word";
  }

  const executable = executableName(word);
  const arguments_ = words.slice(index + 1);

  if (executable === "eval") {
    return "eval-not-allowlisted";
  }

  const impact = highImpactRule(segment, executable, arguments_, workspaceRoot);
  if (impact) {
    return impact;
  }

  if (executable === "." || executable === "source") {
    const script = arguments_[0];
    if (script === undefined || !isSafeCommandWord(script)) {
      return "unsafe-source";
    }
    return null;
  }

  if (SHELL_INTERPRETERS.has(executable)) {
    const commandIndex = arguments_.findIndex(
      (argument) =>
        argument === "-c" || /^-[A-Za-z]*c[A-Za-z]*$/u.test(argument),
    );
    if (commandIndex >= 0) {
      if (commandIndex + 1 >= arguments_.length) {
        return "unsafe-shell-c";
      }
      if (depth <= 0) {
        return "nested-shell-depth-exceeded";
      }
      return inspectCommand(arguments_[commandIndex + 1], depth - 1, workspaceRoot);
    }

    for (const argument of arguments_) {
      if (argument.startsWith("-")) {
        continue;
      }
      // First non-flag operand is the script path when present.
      if (!isSafeCommandWord(argument)) {
        return "unsafe-shell-script";
      }
      break;
    }
    return null;
  }

  return null;
}

// After wrappers/known launchers are peeled, scan remaining argv for a
// high-impact basename (or eval / nested shell) and re-apply policy from that
// word onward. Closes `ionice rm -rf` / `xargs rm -rf` without listing every
// launcher. Residual: pipe-into-interpreter (and tools like `find -delete`).
function inspectFromHighImpactScan(segment, words, startIndex, depth, workspaceRoot) {
  for (let scan = startIndex; scan < words.length; scan += 1) {
    const word = words[scan];
    // Flags and non-path-like mid-argv words are not command basenames — skip.
    if (!isSafeCommandWord(word)) {
      continue;
    }

    const executable = executableName(word);

    if (executable === "eval") {
      return "eval-not-allowlisted";
    }

    if (
      HIGH_IMPACT_EXECUTABLES.has(executable) ||
      SHELL_INTERPRETERS.has(executable) ||
      executable === "." ||
      executable === "source"
    ) {
      const rule = inspectResolvedCommand(
        segment,
        words,
        scan,
        depth,
        workspaceRoot,
      );
      if (rule) {
        return rule;
      }
      // Benign high-impact form (e.g. `git status` under `ionice`) — keep
      // scanning in case a later word is destructive.
    }
  }

  return null;
}

function inspectSegment(segment, depth, workspaceRoot) {
  const words = segment
    .filter((token) => token.kind === "word")
    .map((token) => token.value);

  // Fail closed: any GIT_CONFIG_* assignment in the segment (leading or via
  // `env`) is the same control family as `git -c` shell-escape injection.
  for (const word of words) {
    if (isGitConfigEnvAssignment(word)) {
      return "git-config-env-injection";
    }
  }

  let index = 0;
  while (index < words.length && isAssignment(words[index])) {
    if (!isSafeAssignment(words[index])) {
      return "unsafe-assignment";
    }
    index += 1;
  }

  if (index >= words.length) {
    return null;
  }

  while (index < words.length) {
    const word = words[index];
    if (!isSafeCommandWord(word)) {
      return "unsafe-command-word";
    }

    const executable = executableName(word);

    if (executable === "eval") {
      return "eval-not-allowlisted";
    }

    if (WRAPPER_COMMANDS.has(executable)) {
      index = skipWrapperFlags(executable, words, index);
      if (index >= words.length) {
        return null;
      }
      continue;
    }

    const kind = launcherKind(executable);
    if (kind !== null) {
      index = skipLauncherOperands(kind, words, index);
      if (index >= words.length) {
        return null;
      }
      continue;
    }

    // First non-wrapper/non-launcher word: apply direct policy, then structural
    // high-impact scan so unknown launchers cannot hide destructive argv.
    const direct = inspectResolvedCommand(
      segment,
      words,
      index,
      depth,
      workspaceRoot,
    );
    if (direct) {
      return direct;
    }

    return inspectFromHighImpactScan(
      segment,
      words,
      index + 1,
      depth,
      workspaceRoot,
    );
  }

  return "unsafe-command-word";
}

function inspectCommand(command, depth = MAX_NESTED_SHELL_DEPTH, workspaceRoot = process.cwd()) {
  const trimmed = command.trim();
  if (NAMED_EXCEPTIONS.has(trimmed)) {
    return null;
  }

  if (containsActiveCommandExpansion(command)) {
    return "command-expansion";
  }

  const segments = splitSegments(tokenize(command));
  if (segments.length === 0) {
    return "empty-command";
  }

  for (const segment of segments) {
    const rule = inspectSegment(segment, depth, workspaceRoot);
    if (rule) {
      return rule;
    }
  }

  return null;
}

async function readInput() {
  let input = "";
  let bytes = 0;
  let tooLarge = false;

  for await (const chunk of process.stdin) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > MAX_INPUT_BYTES) {
      tooLarge = true;
    } else {
      input += chunk;
    }
  }

  if (tooLarge) {
    throw new Error("hook input too large");
  }
  return input;
}

async function main() {
  try {
    const payload = JSON.parse(await readInput());
    if (
      payload === null ||
      typeof payload !== "object" ||
      Array.isArray(payload) ||
      typeof payload.command !== "string" ||
      payload.command.length === 0
    ) {
      throw new Error("invalid hook payload");
    }

    const workspaceRoot = verifyLedgerProjectRoot(payload);
    const rule = inspectCommand(
      payload.command,
      MAX_NESTED_SHELL_DEPTH,
      workspaceRoot,
    );
    let agentMessage;
    if (rule === GH_PR_WITHOUT_VERIFY_RULE) {
      agentMessage = GH_PR_WITHOUT_VERIFY_AGENT_MESSAGE;
    } else if (rule === GIT_PUSH_WITHOUT_VERIFY_RULE) {
      agentMessage = GIT_PUSH_WITHOUT_VERIFY_AGENT_MESSAGE;
    }
    process.stdout.write(
      `${JSON.stringify(decision(rule ? "deny" : "allow", rule, agentMessage))}\n`,
    );
  } catch {
    process.stdout.write(
      `${JSON.stringify(decision("deny", "invalid-hook-input"))}\n`,
    );
  }
}

await main();

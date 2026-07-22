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

function decision(permission, rule) {
  if (permission === "allow") {
    return { permission: "allow" };
  }

  return {
    permission: "deny",
    user_message: `Command blocked by the local shell guard (${rule}).`,
    agent_message:
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

// Fail closed on `git -c` / `--config` forms that can bind a shell-running
// value (alias.!cmd, core.pager, diff.external, …).
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
function highImpactRule(segment, executable, arguments_) {
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

  if (
    executable === "gh" &&
    ((arguments_[0] === "repo" && arguments_[1] === "delete") ||
      (arguments_[0] === "release" && arguments_[1] === "delete"))
  ) {
    return "remote-object-delete";
  }

  if (
    ["npm", "pnpm"].includes(executable) &&
    ["publish", "unpublish"].includes(arguments_[0])
  ) {
    return "package-registry-mutation";
  }

  return null;
}

function inspectResolvedCommand(segment, words, index, depth) {
  const word = words[index];
  if (!isSafeCommandWord(word)) {
    return "unsafe-command-word";
  }

  const executable = executableName(word);
  const arguments_ = words.slice(index + 1);

  if (executable === "eval") {
    return "eval-not-allowlisted";
  }

  const impact = highImpactRule(segment, executable, arguments_);
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
      return inspectCommand(arguments_[commandIndex + 1], depth - 1);
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
// launcher. Residual: `find -exec`, pipe-into-interpreter.
function inspectFromHighImpactScan(segment, words, startIndex, depth) {
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
      const rule = inspectResolvedCommand(segment, words, scan, depth);
      if (rule) {
        return rule;
      }
      // Benign high-impact form (e.g. `git status` under `ionice`) — keep
      // scanning in case a later word is destructive.
    }
  }

  return null;
}

function inspectSegment(segment, depth) {
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
    const direct = inspectResolvedCommand(segment, words, index, depth);
    if (direct) {
      return direct;
    }

    return inspectFromHighImpactScan(segment, words, index + 1, depth);
  }

  return "unsafe-command-word";
}

function inspectCommand(command, depth = MAX_NESTED_SHELL_DEPTH) {
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
    const rule = inspectSegment(segment, depth);
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

    const rule = inspectCommand(payload.command);
    process.stdout.write(
      `${JSON.stringify(decision(rule ? "deny" : "allow", rule))}\n`,
    );
  } catch {
    process.stdout.write(
      `${JSON.stringify(decision("deny", "invalid-hook-input"))}\n`,
    );
  }
}

await main();

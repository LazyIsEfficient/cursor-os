const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_NESTED_SHELL_DEPTH = 3;

// `=` is a boundary so `dd of=evaluators/x.json` style operands are covered.
const PROTECTED_PATH_PATTERN =
  /(?:^|[/\\._=-])(?:evaluators?|canar(?:y|ies))(?:$|[/\\._-])/i;
const MUTATING_COMMANDS = new Set([
  "chmod",
  "chown",
  "cp",
  "dd",
  "install",
  "ln",
  "mv",
  "rm",
  "sed",
  "shred",
  "tee",
  "truncate",
  "unlink",
]);
// `<<<` and `<<` end a segment for the same reason `|` does: what follows is a
// payload, not another operand of the command on the left. Leaving them inside
// the segment let `bash <<< 'rm -rf /'` read as the word list
// `[bash, rm, -rf, /]`, where `rm` looked like a harmless argument to `bash`.
const SEGMENT_OPERATORS = new Set([
  ";",
  ";;",
  "&&",
  "||",
  "|",
  "&",
  "\n",
  "(",
  ")",
  "{",
  "}",
  "<<<",
  "<<",
]);
// Here-documents and here-strings both feed their payload to the command on
// stdin. For an interpreter that payload *is* the script, so it is inspected as
// one rather than treated as inert data.
const HERE_OPERATORS = new Set(["<<<", "<<"]);
// `>|` forces truncation over `noclobber`, and `>&`/`&>`/`&>>` redirect a
// stream to a file just as `>` does. All of them can destroy a protected file.
const REDIRECT_OPERATORS = new Set([">", ">>", ">|", ">&", "&>", "&>>"]);
// Longest match first: `&>>` must win over `&>`, and `>|` over `>`.
const OPERATOR_LITERALS = [
  "&>>",
  "&&",
  "||",
  ";;",
  ">>",
  "<<<",
  "<<",
  ">|",
  ">&",
  "&>",
  ";",
  "|",
  "&",
  ">",
  "<",
];
// Reserved words that may lead a segment. Skipping them exposes the real
// executable in `if true; then rm -rf /; fi` style compound commands.
const SHELL_KEYWORDS = new Set([
  "!",
  "case",
  "coproc",
  "do",
  "done",
  "elif",
  "else",
  "esac",
  "fi",
  "for",
  "function",
  "if",
  "in",
  "select",
  "then",
  "until",
  "while",
  "{",
  "}",
]);
// `case WORD in`, `for NAME in`, and `select NAME in` are followed by a subject
// rather than by a command. Skipping only the keyword left the subject sitting
// in command position, where `case $x in ...` resolved its executable to `$x`.
const KEYWORDS_WITH_SUBJECT = new Set(["case", "for", "select"]);
// Every one of these runs a command string given to `-c`. `script -c CMD` does
// it through a pty; the `ksh` family was missing entirely, which is what let
// `ksh -c 'rm -rf /'` resolve to the inert executable `ksh`. `busybox sh` is
// not listed here because `busybox` is unwrapped as a wrapper first, leaving
// the applet name (`sh`) as the executable.
const SHELL_INTERPRETERS = new Set([
  "ash",
  "bash",
  "dash",
  "ksh",
  "ksh88",
  "ksh93",
  "mksh",
  "pdksh",
  "script",
  "sh",
  "zsh",
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

// A reserved-word brace is only a brace when it stands alone as a word, so
// `${HOME}`, `{a,b}` and `find . -exec rm {} \;` keep their current meaning.
function isStandaloneBrace(command, index, pendingValue) {
  if (pendingValue.length > 0) {
    return false;
  }
  const next = command[index + 1];
  return (
    next === undefined ||
    /\s/u.test(next) ||
    [";", "&", "|", "(", ")"].includes(next)
  );
}

function tokenize(command) {
  const tokens = [];
  let value = "";
  let quote = null;
  let escaped = false;
  let parenDepth = 0;
  let braceDepth = 0;
  // `case a in x) ...;; esac` arms close with an unpaired `)`. Tracking the
  // open `case` constructs is what tells that `)` apart from a stray one.
  const caseStack = [];

  // `case` is a reserved word only in command position. As an argument it is
  // ordinary text, so `grep case notes.txt` must not open a case construct.
  let commandPosition = true;

  const noteWord = (word) => {
    const top = caseStack.at(-1);
    if (word === "case" && commandPosition) {
      caseStack.push({ sawIn: false });
    } else if (word === "esac") {
      caseStack.pop();
    } else if (top !== undefined && !top.sawIn && word === "in") {
      top.sawIn = true;
    }
  };

  const emitWord = () => {
    if (value.length > 0) {
      tokens.push({ kind: "word", value });
      noteWord(value);
      commandPosition = false;
      value = "";
    }
  };

  // After any control operator the next word leads a command again; after a
  // redirect it names a file, not a command.
  const pushOperator = (operator) => {
    tokens.push({ kind: "operator", value: operator });
    commandPosition = !REDIRECT_OPERATORS.has(operator);
  };

  // Inside a `case` arm list, `)` terminates a pattern instead of closing a
  // subshell, so it must not drive `parenDepth` negative.
  const isCaseArmTerminator = () =>
    parenDepth === 0 && (caseStack.at(-1)?.sawIn ?? false);

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
      pushOperator("\n");
      continue;
    }

    if (/\s/u.test(character)) {
      emitWord();
      continue;
    }

    if (character === "(" || character === ")") {
      emitWord();
      if (character === ")" && isCaseArmTerminator()) {
        pushOperator(")");
        continue;
      }
      parenDepth += character === "(" ? 1 : -1;
      if (parenDepth < 0) {
        throw new Error("unbalanced shell grouping");
      }
      pushOperator(character);
      continue;
    }

    if (
      (character === "{" || character === "}") &&
      isStandaloneBrace(command, index, value)
    ) {
      braceDepth += character === "{" ? 1 : -1;
      if (braceDepth < 0) {
        throw new Error("unbalanced shell grouping");
      }
      pushOperator(character);
      continue;
    }

    const literal = OPERATOR_LITERALS.find(
      (candidate) => command.slice(index, index + candidate.length) === candidate,
    );
    if (literal !== undefined) {
      emitWord();
      pushOperator(literal);
      index += literal.length - 1;
      continue;
    }

    value += character;
  }

  if (quote !== null || escaped) {
    throw new Error("unterminated shell token");
  }

  // Flush first: a trailing `esac` is what closes the last `case` construct.
  emitWord();

  // Grouping we cannot confidently pair is grouping we cannot inspect: deny.
  // An unterminated `case` is the same situation: its arms were never closed.
  if (parenDepth !== 0 || braceDepth !== 0 || caseStack.length > 0) {
    throw new Error("unbalanced shell grouping");
  }

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

function isAssignment(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/u.test(value);
}

// One table, one loop. Every wrapper declares the flags that consume the next
// word, so adding a wrapper cannot reintroduce the class of bug where a
// separated flag value is mistaken for the wrapped executable.
//
// `valueFlags` lists only the separated form (`-k 10`); the attached form
// (`-k10`, `--kill-after=10`) is a single word and needs no entry.
// `operand` skips one mandatory positional argument that precedes the command.
const DURATION_OPERAND = /^\d+(?:\.\d+)?[smhd]?$/u;
const WRAPPERS = new Map([
  ["builtin", {}],
  // `command -p` selects a default PATH; it takes no value.
  ["command", {}],
  ["nohup", {}],
  ["time", { valueFlags: ["-o", "--output", "-f", "--format"] }],
  ["exec", { valueFlags: ["-a"] }],
  ["env", { valueFlags: ["-u", "--unset", "-C", "--chdir"], assignments: true }],
  [
    "sudo",
    {
      valueFlags: [
        "-u",
        "--user",
        "-g",
        "--group",
        "-h",
        "--host",
        "-p",
        "--prompt",
        "-C",
        "--close-from",
        "-r",
        "--role",
        "-t",
        "--type",
      ],
      assignments: true,
    },
  ],
  ["doas", { valueFlags: ["-u", "-C"] }],
  [
    "timeout",
    {
      valueFlags: ["-s", "--signal", "-k", "--kill-after"],
      operand: DURATION_OPERAND,
    },
  ],
  ["nice", { valueFlags: ["-n", "--adjustment"] }],
  ["ionice", { valueFlags: ["-c", "--class", "-n", "--classdata", "-p", "--pid"] }],
  ["setsid", {}],
  // `busybox APPLET ARGS` is a multi-call binary: unwrapping it exposes the
  // applet, so `busybox rm -rf /` resolves to `rm` and `busybox sh -c CMD`
  // resolves to `sh` and then recurses through the normal interpreter path.
  ["busybox", {}],
  // `watch` concatenates its operands and runs the result through `sh -c`, so
  // `watch 'rm -rf /'` executes a deletion from a single quoted word whose
  // basename is empty. `joinsOperands` re-joins them for a nested inspection.
  ["watch", { valueFlags: ["-n", "--interval"], joinsOperands: true }],
  ["stdbuf", { valueFlags: ["-i", "-o", "-e", "--input", "--output", "--error"] }],
  // `chrt PRIORITY COMMAND` and `taskset MASK COMMAND` both place a mandatory
  // operand before the command; without it the operand reads as the executable.
  ["chrt", { valueFlags: ["-p", "--pid"], operand: /^\d+$/u }],
  [
    "taskset",
    {
      valueFlags: ["-p", "--pid", "-c", "--cpu-list"],
      operand: /^(?:0x[0-9a-f]+|[\d,-]+)$/iu,
    },
  ],
  // `chroot NEWROOT COMMAND`: the directory operand is any single word.
  ["chroot", { valueFlags: ["--userspec", "--groups", "--skip-chdir"], operand: /./u }],
  [
    "xargs",
    {
      valueFlags: [
        "-E",
        "-I",
        "-L",
        "-P",
        "-a",
        "-d",
        "-i",
        "-n",
        "-s",
        "--arg-file",
        "--delimiter",
        "--eof",
        "--max-args",
        "--max-chars",
        "--max-lines",
        "--max-procs",
        "--replace",
      ],
    },
  ],
]);

function unwrapCommand(words) {
  let index = 0;
  let joinsOperands = false;

  while (index < words.length) {
    // Reserved words are matched literally: `IF` and `/usr/bin/if` are not
    // keywords, so they must not be skipped.
    if (SHELL_KEYWORDS.has(words[index])) {
      const keyword = words[index];
      index += 1;
      if (KEYWORDS_WITH_SUBJECT.has(keyword) && index < words.length) {
        index += 1;
      }
      continue;
    }
    if (isAssignment(words[index])) {
      index += 1;
      continue;
    }
    break;
  }

  while (index < words.length) {
    const wrapper = WRAPPERS.get(executableName(words[index]));
    if (wrapper === undefined) {
      break;
    }

    const valueFlags = new Set(wrapper.valueFlags ?? []);
    joinsOperands = joinsOperands || wrapper.joinsOperands === true;
    index += 1;

    while (index < words.length) {
      const word = words[index];

      // `--` ends option parsing; the next word is the command itself.
      if (word === "--") {
        index += 1;
        break;
      }
      if (wrapper.assignments === true && isAssignment(word)) {
        index += 1;
        continue;
      }
      // A bare `-` is an operand (stdin), not a flag.
      if (!word.startsWith("-") || word === "-") {
        break;
      }

      index += 1;
      // Separated value form: the following word belongs to the flag, not to
      // the command being wrapped.
      if (valueFlags.has(word) && index < words.length) {
        index += 1;
      }
    }

    if (
      wrapper.operand !== undefined &&
      index < words.length &&
      wrapper.operand.test(words[index])
    ) {
      index += 1;
    }
  }

  return {
    executable: index < words.length ? executableName(words[index]) : "",
    // The raw word is kept alongside the basename because executableName()
    // discards exactly the evidence the unresolvable-name rule needs: it
    // lowercases, and it slices at the last `/`, so `eval$IFS'rm -rf /'` —
    // a single word ending in a slash — reduces to the empty string.
    executableWord: index < words.length ? words[index] : "",
    arguments: words.slice(index + 1),
    joinsOperands,
  };
}

const HIGH_IMPACT_TARGETS = new Set([
  "/",
  "/*",
  ".",
  "..",
  "*",
  "~",
  "~/*",
  "$HOME",
  "${HOME}",
  ".git",
]);

// `rm -rf //` and `rm -rf /.` delete exactly what `rm -rf /` deletes, so the
// target is compared in canonical form rather than as raw text. This resolves
// `.`, `..`, duplicate slashes, and trailing slashes only — it never touches
// the filesystem and never expands variables or globs.
function normalizePathTarget(value) {
  const absolute = value.startsWith("/");
  const segments = [];

  for (const segment of value.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (segments.length > 0 && segments.at(-1) !== "..") {
        segments.pop();
      } else if (!absolute) {
        // `..` above a relative root is meaningful; above `/` it is still `/`.
        segments.push("..");
      }
      continue;
    }
    segments.push(segment);
  }

  if (absolute) {
    return `/${segments.join("/")}`;
  }
  return segments.length === 0 ? "." : segments.join("/");
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

function protectedPathRule(segment, executable, arguments_) {
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

  // Deliberately coarse: the guard does not model each tool's argument grammar,
  // so it cannot tell a path operand from pattern text, nor an in-place edit
  // from a read (sniffing `-i` is unreliable across GNU and BSD variants). Any
  // mutation-capable tool naming a protected artifact is denied, including
  // read-only invocations. The rule name reflects that breadth.
  if (
    MUTATING_COMMANDS.has(executable) &&
    arguments_.some((argument) => PROTECTED_PATH_PATTERN.test(argument))
  ) {
    return "protected-artifact-reference";
  }

  return null;
}

// Every rule below keys off the executable name. If the shell will rewrite that
// name at run time — a command substitution (`$(...)`, backticks) or a variable
// (`$FOO`, `${FOO}`) — the guard is matching against text the shell never runs,
// so no rule can fire and the command falls through as "unrecognised, allow".
// A name the guard cannot resolve is a name it cannot police: fail closed.
//
// This takes the raw word rather than the basename, because executableName()
// erases the evidence: it slices at the last `/`, so `eval$IFS'rm -rf /'` —
// one word ending in a slash — reduces to the empty string.
//
// An empty name is deliberately excluded. It means the segment consisted only
// of assignments (`FOO=1`) or reserved words (`fi`, `done`), both of which are
// legitimate and execute nothing.
function isUnresolvableCommandName(word) {
  if (word === "") {
    return false;
  }
  // A leading `-` is a flag, never an executable. It is the residue left behind
  // when a substitution supplied the command name: `$(echo rm) -rf /` splits
  // into a `$` segment and a `[-rf, /]` segment.
  return word.includes("$") || word.includes("`") || word.startsWith("-");
}

// PRODUCT DECISION PENDING — deliberately not wired into the deny path.
//
// `find ... -exec CMD ... ;` runs CMD once per match, which is arbitrary
// command execution that no rule below inspects. `find . -exec rm -rf {} \;`
// was one of the confirmed canary deletions. Enabling this predicate would
// contradict tests/security/shell-guard-parser.test.mjs, which asserts
// `find . -name "*.log" -exec rm {} \;` as an intentional allow. That assertion
// encodes arbitrary-rm-via-`-exec` as desired behaviour and only the product
// owner can flip it, so the check ships implemented but off.
const DENY_FIND_EXEC = false;
const FIND_EXEC_FLAGS = new Set(["-exec", "-execdir", "-ok", "-okdir"]);

function findExecutesMutatingCommand(executable, arguments_) {
  if (executable !== "find") {
    return false;
  }
  return arguments_.some(
    (argument, index) =>
      FIND_EXEC_FLAGS.has(argument) &&
      index + 1 < arguments_.length &&
      MUTATING_COMMANDS.has(executableName(arguments_[index + 1])),
  );
}

function inspectSegment(segment, depth) {
  const words = segment
    .filter((token) => token.kind === "word")
    .map((token) => token.value);
  const {
    executable,
    executableWord,
    arguments: arguments_,
    joinsOperands,
  } = unwrapCommand(words);

  const protectedRule = protectedPathRule(segment, executable, arguments_);
  if (protectedRule) {
    return protectedRule;
  }

  // A wrapper that concatenates its operands into a command string (`watch`)
  // is inspected on the rejoined string, so the quoted single-word form and
  // the multi-word form resolve to the same command.
  if (joinsOperands && executableWord !== "") {
    if (depth <= 0) {
      return "nested-shell-depth-exceeded";
    }
    return inspectCommand([executableWord, ...arguments_].join(" "), depth - 1);
  }

  // `eval` joins its operands with a space and runs the result as a shell
  // command, so the joined text is inspected exactly like an `sh -c` payload.
  // Recursion is preferred over an outright deny because it keeps `eval` usable
  // for the harmless cases while still resolving the destructive ones to their
  // real rule name; anything eval runs that the guard cannot resolve statically
  // is caught by isUnresolvableCommandName instead.
  if (executable === "eval") {
    if (depth <= 0) {
      return "nested-shell-depth-exceeded";
    }
    const rule = inspectCommand(arguments_.join(" "), depth - 1);
    if (rule) {
      return rule;
    }
  }

  if (SHELL_INTERPRETERS.has(executable)) {
    const commandIndex = arguments_.findIndex(
      (argument) => argument === "-c" || /^-[A-Za-z]*c[A-Za-z]*$/u.test(argument),
    );
    if (commandIndex >= 0 && commandIndex + 1 < arguments_.length) {
      // Exhausting the nesting budget must not degrade into an allow: the
      // payload is a command string the guard has explicitly stopped reading.
      if (depth <= 0) {
        return "nested-shell-depth-exceeded";
      }
      return inspectCommand(arguments_[commandIndex + 1], depth - 1);
    }
  }

  if (isUnresolvableCommandName(executableWord)) {
    return "unresolvable-command-name";
  }

  if (DENY_FIND_EXEC && findExecutesMutatingCommand(executable, arguments_)) {
    return "find-exec-mutation";
  }

  if (executable === "rm") {
    const recursive =
      arguments_.includes("--recursive") || hasShortFlag(arguments_, "r");
    const forced = arguments_.includes("--force") || hasShortFlag(arguments_, "f");
    const highImpactTarget = arguments_.some((argument) =>
      HIGH_IMPACT_TARGETS.has(normalizePathTarget(argument)),
    );
    if (recursive && forced && highImpactTarget) {
      return "destructive-filesystem-delete";
    }
  }

  if (executable === "git") {
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
    ((arguments_[0] === "repo" &&
      arguments_[1] === "delete") ||
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

function substitutionEnd(command, start, kind) {
  let quote = null;
  let escaped = false;
  let depth = kind === "dollar" ? 1 : 0;
  for (let index = start; index < command.length; index += 1) {
    const character = command[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === "'") {
      if (character === "'") quote = null;
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
    if (kind === "dollar" && quote === null) {
      if (character === "(") depth += 1;
      if (character === ")") {
        depth -= 1;
        if (depth === 0) return index;
      }
    }
  }
  throw new Error("unterminated shell substitution");
}

function inspectSubstitutions(command, depth) {
  let quote = null;
  let escaped = false;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === "'") {
      if (character === "'") quote = null;
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
    const dollar = character === "$" && command[index + 1] === "(";
    const backtick = character === "`";
    if (!dollar && !backtick) continue;
    if (depth <= 0) throw new Error("shell substitution nesting exceeds limit");
    const contentStart = index + (dollar ? 2 : 1);
    const end = substitutionEnd(command, contentStart, dollar ? "dollar" : "backtick");
    const rule = inspectCommand(command.slice(contentStart, end), depth - 1);
    if (rule) return rule;
    index = end;
  }
  return null;
}

// Bash removes a backslash before a newline entirely, so `rm -rf \<newline>/`
// is byte-for-byte `rm -rf /` by the time the shell runs it. Removing the pair
// up front denies the guard a way to see a different command than the shell.
function joinLineContinuations(command) {
  return command.replaceAll("\\\r\n", "").replaceAll("\\\n", "");
}

// Splitting the segment stops the payload being read as an argument, but the
// payload of `bash <<< 'rm -rf /'` is a whole script and lands in a segment of
// its own whose executable is meaningless. This pass pairs each here-operator
// with the command it feeds and, when that command is an interpreter, inspects
// the payload as the command string it actually is.
function inspectHereDocuments(tokens, depth) {
  let words = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.kind === "word") {
      words.push(token.value);
      continue;
    }

    if (HERE_OPERATORS.has(token.value)) {
      const payload = tokens[index + 1];
      const { executable } = unwrapCommand(words);
      if (payload?.kind === "word" && SHELL_INTERPRETERS.has(executable)) {
        if (depth <= 0) {
          return "nested-shell-depth-exceeded";
        }
        const rule = inspectCommand(payload.value, depth - 1);
        if (rule) {
          return rule;
        }
      }
      words = [];
      continue;
    }

    if (SEGMENT_OPERATORS.has(token.value)) {
      words = [];
    }
  }

  return null;
}

function inspectCommand(rawCommand, depth = MAX_NESTED_SHELL_DEPTH) {
  const command = joinLineContinuations(rawCommand);
  const substitutionRule = inspectSubstitutions(command, depth);
  if (substitutionRule) return substitutionRule;
  const tokens = tokenize(command);
  const hereRule = inspectHereDocuments(tokens, depth);
  if (hereRule) return hereRule;
  for (const segment of splitSegments(tokens)) {
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
    process.stdout.write(`${JSON.stringify(decision(rule ? "deny" : "allow", rule))}\n`);
  } catch {
    process.stdout.write(`${JSON.stringify(decision("deny", "invalid-hook-input"))}\n`);
  }
}

await main();

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
  "<<-",
  "<<",
]);
// Here-documents and here-strings both feed their payload to the command on
// stdin. For an interpreter that payload *is* the script, so it is inspected as
// one rather than treated as inert data.
//
// `<<-` is listed separately because it must out-match `<<`: without it the
// tab-stripping form tokenized as `<<` plus a word `-EOF`, and that leading
// dash then read as an unresolvable command name, denying every `cat <<-EOF`.
const HERE_OPERATORS = new Set(["<<<", "<<-", "<<"]);
const HERE_DOCUMENT_OPERATORS = new Set(["<<-", "<<"]);
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
  "<<-",
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
  const pushOperator = (operator, caseArm = false) => {
    tokens.push({ kind: "operator", value: operator, caseArm });
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

    // A command substitution is a single word to the shell, so it is consumed
    // whole rather than split on its parentheses. Splitting it stranded the
    // operands that followed in a segment of their own, which is how
    // `$(echo rm) -rf /` came to parse `-rf` as a command name while the
    // substitution that actually named `rm` sat in a segment by itself.
    if (character === "$" && command[index + 1] === "(") {
      const end = substitutionEnd(command, index + 2, "dollar");
      value += command.slice(index, end + 1);
      index = end;
      continue;
    }
    if (character === "`") {
      const end = substitutionEnd(command, index + 1, "backtick");
      value += command.slice(index, end + 1);
      index = end;
      continue;
    }

    if (character === "(" || character === ")") {
      emitWord();
      if (character === ")" && isCaseArmTerminator()) {
        pushOperator(")", true);
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
  let skipPayloadWord = false;

  for (const token of tokens) {
    if (token.kind === "operator" && SEGMENT_OPERATORS.has(token.value)) {
      // The words before a case arm's `)` are its match patterns, not a
      // command: `*) pwd;;` matches anything, it does not run `*`. Inspecting
      // them denied every wildcard arm once globs became unresolvable names.
      if (token.caseArm === true) {
        segment = [];
        continue;
      }
      if (segment.length > 0) {
        segments.push(segment);
        segment = [];
      }
      // The word after a here-operator is a delimiter or a here-string payload:
      // stdin data, never a command name. inspectHereDocuments has already run
      // it as a script for the interpreters that genuinely do so. Leaving it in
      // command position denied `grep foo <<< "$INPUT"` on its own payload.
      skipPayloadWord = HERE_OPERATORS.has(token.value);
      continue;
    }
    if (skipPayloadWord && token.kind === "word") {
      skipPayloadWord = false;
      continue;
    }
    segment.push(token);
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

const NO_COMMAND = {
  executable: "",
  executableWord: "",
  arguments: [],
  joinsOperands: false,
};

function unwrapCommand(words) {
  let index = 0;
  let joinsOperands = false;
  let sawSubjectKeyword = false;

  while (index < words.length) {
    // Reserved words are matched literally: `IF` and `/usr/bin/if` are not
    // keywords, so they must not be skipped.
    if (SHELL_KEYWORDS.has(words[index])) {
      const keyword = words[index];
      index += 1;
      if (KEYWORDS_WITH_SUBJECT.has(keyword)) {
        sawSubjectKeyword = true;
        if (index < words.length) {
          index += 1;
        }
      }
      // `in` opens the word list of a `for`/`select`/`case`, and that list is
      // data: `for f in *.log` names files to loop over, not a program to run.
      // Reading it as a command resolved the executable to `*.log` and denied
      // an ordinary loop. Any command in the construct lives in the `do`/arm
      // segments, which are split off by `;` and inspected on their own.
      if (keyword === "in" && sawSubjectKeyword) {
        return NO_COMMAND;
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
// Everything the shell rewrites before it decides what to run: substitutions
// and variables (`$`, backtick), and the glob and brace metacharacters. A name
// holding any of them is not the name of the program that executes — `/bin/r?`
// runs `/bin/rm` and `{rm,x}` expands to `rm x` — so no rule below can match it
// and the command would fall through as "unrecognised, allow". A reviewer
// deleted a real directory this way with `/bin/r? -rf ./victim`.
const UNRESOLVABLE_NAME_PATTERN = /[$`*?[\]{}]/u;
// `[` and `[[` are the test builtins, not globs: `[ -f x ]` is ordinary shell.
const TEST_BUILTINS = new Set(["[", "[["]);
// A word that is entirely one command substitution, e.g. `$(tool init)`.
//
// In COMMAND position this is never an exception: bash runs the substitution's
// *output* as the command line, so inspecting the body proves nothing. The body
// of `$(printf 'rm -rf /')` is a harmless `printf`, yet the command that runs is
// `rm -rf /`. An earlier revision allowed a lone substitution here on the
// grounds that its body was benign and nothing sat beside it; that was a
// general-purpose arbitrary-command bypass — `rm -rf /` denied while
// `$(printf 'rm -rf /')` allowed. The output is not statically knowable, so
// command position always fails closed.
//
// The pattern survives only for OPERAND position — see the `eval` handling.
const WHOLE_SUBSTITUTION_PATTERN = /^(?:\$\(.*\)|`.*`)$/su;

// This takes the raw word rather than the basename, because executableName()
// erases the evidence: it slices at the last `/`, so `eval$IFS'rm -rf /'` —
// one word ending in a slash — reduces to the empty string.
//
// An empty name is deliberately excluded. It means the segment consisted only
// of assignments (`FOO=1`) or reserved words (`fi`, `done`), both of which are
// legitimate and execute nothing.
function isUnresolvableCommandName(word) {
  if (word === "" || TEST_BUILTINS.has(word)) {
    return false;
  }
  // A leading `-` is a flag, never an executable.
  return UNRESOLVABLE_NAME_PATTERN.test(word) || word.startsWith("-");
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
    const joined = arguments_.join(" ");
    // A lone substitution reached `eval` as an OPERAND, and its body has
    // already been inspected in that position by inspectSubstitutions.
    // Recursing would re-tokenize it into command position, where the
    // unresolvable-name rule denies `eval "$(direnv hook zsh)"` and every other
    // shell-init idiom. This is the only place the whole-substitution carve-out
    // applies; a substitution that names a command outright still fails closed.
    if (!WHOLE_SUBSTITUTION_PATTERN.test(joined)) {
      const rule = inspectCommand(joined, depth - 1);
      if (rule) {
        return rule;
      }
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

// A here-document body is data: the shell copies it verbatim to the reader's
// stdin until the delimiter line, and only an interpreter turns that text back
// into commands. Lifting the body out before tokenizing is what stops
// `cat <<EOF > notes.md` followed by the prose line `rm -rf / destroys
// everything` from parsing that prose as a command and denying a document.
//
// The stripped command keeps its `<<`/`<<-` operator and delimiter so the token
// stream still shows which command reads which body; the bodies are returned in
// operator order so each pairs with its reader.
function extractHereDocumentBodies(rawCommand) {
  const bodies = [];
  let command = "";
  let index = 0;
  let quote = null;
  let escaped = false;
  let pending = [];

  // Reads one body per queued opener, in order, starting at the current index.
  const consumePendingBodies = () => {
    for (const { operator, delimiter } of pending) {
      const lines = [];
      while (index < rawCommand.length) {
        let line = "";
        while (index < rawCommand.length && rawCommand[index] !== "\n") {
          line += rawCommand[index];
          index += 1;
        }
        index += 1;
        // `<<-` strips leading tabs from the body and from the delimiter line.
        const stripped = operator === "<<-" ? line.replace(/^\t+/u, "") : line;
        if (stripped === delimiter) {
          break;
        }
        lines.push(stripped);
      }
      bodies.push(lines.join("\n"));
    }
    pending = [];
  };

  while (index < rawCommand.length) {
    const character = rawCommand[index];

    if (escaped) {
      command += character;
      escaped = false;
      index += 1;
      continue;
    }
    if (character === "\\") {
      command += character;
      escaped = true;
      index += 1;
      continue;
    }
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
      command += character;
      index += 1;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      command += character;
      index += 1;
      continue;
    }
    // End of the opener line: every here-document queued on it starts here.
    if (character === "\n") {
      command += "\n";
      index += 1;
      consumePendingBodies();
      continue;
    }
    // `<<<` is a here-string: its payload is on the same line, not a body.
    if (rawCommand.startsWith("<<<", index)) {
      command += "<<<";
      index += 3;
      continue;
    }
    if (!rawCommand.startsWith("<<", index)) {
      command += character;
      index += 1;
      continue;
    }

    const operator = rawCommand.startsWith("<<-", index) ? "<<-" : "<<";
    command += operator;
    index += operator.length;

    while (index < rawCommand.length && /[ \t]/u.test(rawCommand[index])) {
      command += rawCommand[index];
      index += 1;
    }

    // Quoting the delimiter only disables expansion inside the body; the
    // delimiter itself is the unquoted text, so `<<'EOF'` still ends at `EOF`.
    let delimiter = "";
    let delimiterQuote = null;
    while (index < rawCommand.length) {
      const delimiterCharacter = rawCommand[index];
      if (delimiterQuote !== null) {
        index += 1;
        if (delimiterCharacter === delimiterQuote) {
          delimiterQuote = null;
        } else {
          delimiter += delimiterCharacter;
        }
        continue;
      }
      if (delimiterCharacter === "'" || delimiterCharacter === '"') {
        delimiterQuote = delimiterCharacter;
        index += 1;
        continue;
      }
      if (/[\s;&|<>()]/u.test(delimiterCharacter)) {
        break;
      }
      delimiter += delimiterCharacter;
      index += 1;
    }

    command += delimiter;
    if (delimiter !== "") {
      pending.push({ operator, delimiter });
    }
  }

  // A command may open several here-documents at once (`cat <<A <<B`). Their
  // bodies follow the *opener line* one after another, in operator order, so
  // the openers are queued while the line is scanned and drained when it ends.
  // Draining at the first opener instead left B's body in the token stream to
  // be parsed as commands, desynchronising every later pairing.
  consumePendingBodies();
  return { command, bodies };
}

// Pairs each here-operator with the command that reads it. A payload is only
// inspected as a script when its reader is an interpreter — for anything else
// it is stdin data, which is why `cat <<< 'rm -rf /'` and prose here-docs stay
// allowed while `bash <<< 'rm -rf /'` does not.
function inspectHereDocuments(tokens, depth, bodies) {
  let words = [];
  let bodyIndex = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.kind === "word") {
      words.push(token.value);
      continue;
    }

    if (HERE_OPERATORS.has(token.value)) {
      const payload = HERE_DOCUMENT_OPERATORS.has(token.value)
        ? bodies[bodyIndex++]
        : tokens[index + 1]?.value;
      const { executable } = unwrapCommand(words);
      if (typeof payload === "string" && SHELL_INTERPRETERS.has(executable)) {
        if (depth <= 0) {
          return "nested-shell-depth-exceeded";
        }
        const rule = inspectCommand(payload, depth - 1);
        if (rule) {
          return rule;
        }
      }
      continue;
    }

    if (SEGMENT_OPERATORS.has(token.value)) {
      words = [];
    }
  }

  return null;
}

function inspectCommand(rawCommand, depth = MAX_NESTED_SHELL_DEPTH) {
  const { command, bodies } = extractHereDocumentBodies(
    joinLineContinuations(rawCommand),
  );
  const substitutionRule = inspectSubstitutions(command, depth);
  if (substitutionRule) return substitutionRule;
  const tokens = tokenize(command);
  const hereRule = inspectHereDocuments(tokens, depth, bodies);
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

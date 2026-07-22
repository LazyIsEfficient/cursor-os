const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_NESTED_SHELL_DEPTH = 3;

// Exact command forms only — not a general `eval` carve-out.
const NAMED_EXCEPTIONS = new Set([
  'eval "$(direnv hook zsh)"',
  'eval "$(ssh-agent -s)"',
]);

const SEGMENT_OPERATORS = new Set([";", ";;", "&&", "||", "|", "&", "\n"]);

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

// Active expansions the shell runs as commands (or as process substitutions).
// Single-quoted text is inert. Presence of a runnable expansion is denied so a
// missed mechanism fails closed; unterminated forms throw and fail closed as
// invalid input.
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

function inspectSegment(segment, depth) {
  const words = segment
    .filter((token) => token.kind === "word")
    .map((token) => token.value);

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

    if (executable === "." || executable === "source") {
      const script = words[index + 1];
      if (script === undefined || !isSafeCommandWord(script)) {
        return "unsafe-source";
      }
      return null;
    }

    if (SHELL_INTERPRETERS.has(executable)) {
      const arguments_ = words.slice(index + 1);
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

const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_NESTED_SHELL_DEPTH = 3;

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
const SEGMENT_OPERATORS = new Set([";", ";;", "&&", "||", "|", "&", "\n"]);
const REDIRECT_OPERATORS = new Set([">", ">>"]);

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

function unwrapCommand(words) {
  let index = 0;

  while (index < words.length && isAssignment(words[index])) {
    index += 1;
  }

  while (index < words.length) {
    const executable = executableName(words[index]);

    if (executable === "env") {
      index += 1;
      while (
        index < words.length &&
        (words[index].startsWith("-") || isAssignment(words[index]))
      ) {
        if (["-u", "--unset", "-C", "--chdir"].includes(words[index])) {
          index += 1;
        }
        index += 1;
      }
      continue;
    }

    if (executable === "sudo") {
      index += 1;
      while (index < words.length && words[index].startsWith("-")) {
        if (["-u", "-g", "-h", "-p", "-C"].includes(words[index])) {
          index += 1;
        }
        index += 1;
      }
      continue;
    }

    if (["command", "builtin", "nohup"].includes(executable)) {
      index += 1;
      while (index < words.length && words[index].startsWith("-")) {
        index += 1;
      }
      continue;
    }

    break;
  }

  return {
    executable: index < words.length ? executableName(words[index]) : "",
    arguments: words.slice(index + 1),
  };
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

  if (
    MUTATING_COMMANDS.has(executable) &&
    arguments_.some((argument) => PROTECTED_PATH_PATTERN.test(argument))
  ) {
    return "protected-artifact-mutation";
  }

  return null;
}

function inspectSegment(segment, depth) {
  const words = segment
    .filter((token) => token.kind === "word")
    .map((token) => token.value);
  const { executable, arguments: arguments_ } = unwrapCommand(words);

  const protectedRule = protectedPathRule(segment, executable, arguments_);
  if (protectedRule) {
    return protectedRule;
  }

  if (["sh", "bash", "zsh", "dash"].includes(executable) && depth > 0) {
    const commandIndex = arguments_.findIndex(
      (argument) => argument === "-c" || /^-[A-Za-z]*c[A-Za-z]*$/u.test(argument),
    );
    if (commandIndex >= 0 && commandIndex + 1 < arguments_.length) {
      return inspectCommand(arguments_[commandIndex + 1], depth - 1);
    }
  }

  if (executable === "rm") {
    const recursive =
      arguments_.includes("--recursive") || hasShortFlag(arguments_, "r");
    const forced = arguments_.includes("--force") || hasShortFlag(arguments_, "f");
    const highImpactTarget = arguments_.some((argument) =>
      [
        "/",
        "/*",
        ".",
        "./",
        "..",
        "../",
        "*",
        "./*",
        "~",
        "~/",
        "~/*",
        "$HOME",
        "${HOME}",
        ".git",
        "./.git",
      ].includes(argument),
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

function inspectCommand(command, depth = MAX_NESTED_SHELL_DEPTH) {
  const substitutionRule = inspectSubstitutions(command, depth);
  if (substitutionRule) return substitutionRule;
  for (const segment of splitSegments(tokenize(command))) {
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

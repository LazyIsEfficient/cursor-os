const DOCUMENTED_TYPES = new Set(["system", "user", "assistant", "tool_call", "result"]);
const DIRECT_NETWORK_TOOLS = new Set([
  "fetch",
  "webfetch",
  "websearch",
  "browser",
  "callmcptool",
]);
const SHELL_TOOLS = new Set(["shell", "bash", "terminal", "runcommand", "exec", "execute"]);
const NETWORK_CLIENTS = new Set(["curl", "wget", "nc", "ncat", "netcat", "telnet", "ssh", "scp", "sftp", "ftp", "lftp"]);
const NETWORK_GIT_COMMANDS = new Set(["clone", "fetch", "pull", "push", "ls-remote"]);
const NETWORK_PACKAGE_COMMANDS = new Set(["install", "add", "ci", "view", "info", "download"]);
const PACKAGE_CLIENTS = new Set(["npm", "pnpm", "yarn", "pip", "pip3"]);
const COMMAND_WRAPPERS = new Set(["command", "builtin", "nohup"]);
const SHELL_EXECUTABLES = new Set(["sh", "bash", "zsh", "dash"]);

function normalizedToolToken(name) {
  return typeof name === "string"
    ? name.toLowerCase().replace(/[^a-z0-9]/gu, "").replace(/toolcall$/u, "")
    : "";
}

function parseArguments(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toolDescriptor(toolCall) {
  if (!toolCall || typeof toolCall !== "object") return { toolName: null, arguments: null };
  if (toolCall.function && typeof toolCall.function === "object") {
    return {
      toolName: typeof toolCall.function.name === "string" ? toolCall.function.name : null,
      arguments: parseArguments(toolCall.function.arguments),
    };
  }
  if (typeof toolCall.name === "string") {
    return { toolName: toolCall.name, arguments: toolCall.args ?? null };
  }
  const keys = Object.keys(toolCall).sort();
  if (keys.length !== 1) return { toolName: null, arguments: null };
  const payload = toolCall[keys[0]];
  return {
    toolName: keys[0],
    arguments: payload && typeof payload === "object" ? payload.args ?? null : null,
  };
}

function shellCommand(arguments_) {
  if (typeof arguments_ === "string") return arguments_;
  if (!arguments_ || typeof arguments_ !== "object") return null;
  for (const key of ["command", "cmd"]) {
    if (typeof arguments_[key] === "string") return arguments_[key];
  }
  return null;
}

function executableName(value) {
  const normalized = value.replaceAll("\\", "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1).toLowerCase();
}

function isAssignment(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/u.test(value);
}

function extractDelimited(command, start, terminator) {
  let quote = null;
  let escaped = false;
  let depth = terminator === ")" ? 1 : 0;
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
    if (quote === '"') {
      if (character === "\\") escaped = true;
      else if (character === '"') quote = null;
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
      quote = '"';
      continue;
    }
    if (terminator === ")") {
      if (character === "(") depth += 1;
      if (character === ")") {
        depth -= 1;
        if (depth === 0) return { content: command.slice(start, index), end: index };
      }
    } else if (character === "`") {
      return { content: command.slice(start, index), end: index };
    }
  }
  return null;
}

function tokenizeShell(command, nestedCommands) {
  const tokens = [];
  let word = "";
  let quote = null;
  let escaped = false;
  const emit = () => {
    if (word.length > 0) {
      tokens.push({ kind: "word", value: word });
      word = "";
    }
  };
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (escaped) {
      word += character;
      escaped = false;
      continue;
    }
    if (quote === "'") {
      if (character === "'") quote = null;
      else word += character;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      quote = quote === '"' ? null : '"';
      continue;
    }
    if (character === "'" && quote === null) {
      quote = "'";
      continue;
    }
    if ((quote === null || quote === '"') && character === "$" && command[index + 1] === "(") {
      const substitution = extractDelimited(command, index + 2, ")");
      if (!substitution) return null;
      nestedCommands.push(substitution.content);
      index = substitution.end;
      continue;
    }
    if (quote === null && ["<", ">"].includes(character) && command[index + 1] === "(") {
      const substitution = extractDelimited(command, index + 2, ")");
      if (!substitution) return { malformedExecutableSubstitution: true };
      nestedCommands.push(substitution.content);
      index = substitution.end;
      continue;
    }
    if ((quote === null || quote === '"') && character === "`") {
      const substitution = extractDelimited(command, index + 1, "`");
      if (!substitution) return null;
      nestedCommands.push(substitution.content);
      index = substitution.end;
      continue;
    }
    if (quote === null && (/\s/u.test(character) || [";", "|", "&"].includes(character))) {
      emit();
      if ([";", "|", "&", "\n"].includes(character)) tokens.push({ kind: "separator" });
      continue;
    }
    word += character;
  }
  if (quote !== null || escaped) return null;
  emit();
  return tokens;
}

function unwrapCommand(words) {
  let index = 0;
  while (index < words.length && isAssignment(words[index])) index += 1;
  while (index < words.length) {
    const executable = executableName(words[index]);
    if (executable === "env") {
      index += 1;
      while (index < words.length && (words[index].startsWith("-") || isAssignment(words[index]))) {
        if (["-u", "--unset", "-C", "--chdir"].includes(words[index])) index += 1;
        index += 1;
      }
      continue;
    }
    if (executable === "sudo") {
      index += 1;
      while (index < words.length && words[index].startsWith("-")) {
        if (["-u", "-g", "-h", "-p", "-C"].includes(words[index])) index += 1;
        index += 1;
      }
      continue;
    }
    if (COMMAND_WRAPPERS.has(executable)) {
      index += 1;
      while (index < words.length && words[index].startsWith("-")) index += 1;
      continue;
    }
    break;
  }
  return {
    executable: index < words.length ? executableName(words[index]) : "",
    arguments: words.slice(index + 1),
  };
}

function gitSubcommand(arguments_) {
  let index = 0;
  while (index < arguments_.length && arguments_[index].startsWith("-")) {
    if (["-C", "-c", "--git-dir", "--work-tree", "--namespace"].includes(arguments_[index])) index += 1;
    index += 1;
  }
  return (arguments_[index] ?? "").toLowerCase();
}

function detectNetworkCommand(command, depth = 3) {
  if (depth < 0) return null;
  const nestedCommands = [];
  const tokens = tokenizeShell(command, nestedCommands);
  if (tokens?.malformedExecutableSubstitution) return "unknown";
  if (!tokens) return null;
  const segments = [];
  let segment = [];
  for (const token of tokens) {
    if (token.kind === "separator") {
      if (segment.length > 0) segments.push(segment);
      segment = [];
    } else {
      segment.push(token.value);
    }
  }
  if (segment.length > 0) segments.push(segment);
  for (const words of segments) {
    const { executable, arguments: arguments_ } = unwrapCommand(words);
    if (NETWORK_CLIENTS.has(executable)) return executable;
    if (executable === "git" && NETWORK_GIT_COMMANDS.has(gitSubcommand(arguments_))) return "git";
    if (PACKAGE_CLIENTS.has(executable) && NETWORK_PACKAGE_COMMANDS.has((arguments_[0] ?? "").toLowerCase())) {
      return executable;
    }
    if (SHELL_EXECUTABLES.has(executable) && depth > 0) {
      const commandIndex = arguments_.findIndex((argument) => argument === "-c" || /^-[A-Za-z]*c[A-Za-z]*$/u.test(argument));
      if (commandIndex >= 0 && commandIndex + 1 < arguments_.length) {
        const client = detectNetworkCommand(arguments_[commandIndex + 1], depth - 1);
        if (client) return client;
      }
    }
  }
  for (const nested of nestedCommands) {
    const client = detectNetworkCommand(nested, depth - 1);
    if (client) return client;
  }
  return null;
}

export function detectNetworkToolInvocations(toolCalls) {
  const attempts = [];
  for (const call of toolCalls) {
    const token = normalizedToolToken(call.toolName);
    if (
      DIRECT_NETWORK_TOOLS.has(token) ||
      token === "mcp" ||
      token.startsWith("mcp") ||
      token.includes("callmcp")
    ) {
      attempts.push({ callId: call.callId, toolName: call.toolName, kind: "direct-network-tool" });
      continue;
    }
    if (!SHELL_TOOLS.has(token)) continue;
    const command = shellCommand(call.arguments);
    if (!command) continue;
    const client = detectNetworkCommand(command);
    if (client) {
      attempts.push({
        callId: call.callId,
        toolName: call.toolName,
        kind: client === "unknown" ? "malformed-shell-syntax" : "shell-network-client",
        client,
      });
    }
  }
  return attempts;
}

export function normalizeCliNdjson(source) {
  const documentedTypes = [];
  const calls = new Map();
  const parseErrors = [];
  let terminalResult = null;

  for (const [index, line] of source.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch (error) {
      parseErrors.push({ line: index + 1, error: error.message });
      continue;
    }
    if (!event || typeof event !== "object" || !DOCUMENTED_TYPES.has(event.type)) continue;
    documentedTypes.push(event.type);
    if (event.type === "result") {
      terminalResult = {
        subtype: typeof event.subtype === "string" ? event.subtype : null,
      };
      continue;
    }
    if (event.type !== "tool_call" || typeof event.call_id !== "string" || event.call_id.length === 0) continue;
    const descriptor = toolDescriptor(event.tool_call);
    const existing = calls.get(event.call_id) ?? {
      callId: event.call_id,
      toolName: descriptor.toolName ?? (typeof event.name === "string" ? event.name : null),
      arguments: descriptor.arguments,
      started: false,
      completed: false,
      failed: false,
    };
    if (existing.toolName === null && descriptor.toolName !== null) existing.toolName = descriptor.toolName;
    if (existing.arguments === null && descriptor.arguments !== null) existing.arguments = descriptor.arguments;
    if (event.subtype === "started") existing.started = true;
    if (event.subtype === "completed") existing.completed = true;
    if (event.subtype === "failed") existing.failed = true;
    calls.set(event.call_id, existing);
  }

  const toolCalls = [...calls.values()].sort((left, right) => left.callId.localeCompare(right.callId));
  return {
    documentedTypes,
    toolCalls,
    toolCallCount: toolCalls.filter((call) => call.started).length,
    unmatchedToolCallIds: toolCalls
      .filter((call) => !call.started || (!call.completed && !call.failed))
      .map((call) => call.callId),
    hasTerminalResult: terminalResult !== null,
    terminalResult,
    parseErrors,
    networkAttempts: detectNetworkToolInvocations(toolCalls),
  };
}

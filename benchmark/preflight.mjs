import { runCursorAuthenticationPreflight } from "./lib/auth-preflight.mjs";

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[++index];
    if (value === undefined) throw new Error(`${argument} requires a value`);
    if (argument === "--cursor-config-template") options.cursorConfigTemplatePath = value;
    else if (argument === "--agent-bin") options.binary = value;
    else throw new Error(`unknown option ${argument}`);
  }
  return options;
}

try {
  const result = await runCursorAuthenticationPreflight(parseArguments(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`Authenticated benchmark preflight failed: ${error.message}\n`);
  process.exitCode = 1;
}

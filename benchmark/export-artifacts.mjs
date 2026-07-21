import { exportSanitizedArtifacts } from "./lib/artifact-export.mjs";

function parseArguments(argv) {
  const options = { secretCanaryFiles: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[++index];
    if (value === undefined) throw new Error(`${argument} requires a value`);
    if (argument === "--run-root") options.runRoot = value;
    else if (argument === "--export-root") options.exportRoot = value;
    else if (argument === "--secret-canary-file") options.secretCanaryFiles.push(value);
    else throw new Error(`unknown option ${argument}`);
  }
  if (!options.runRoot || !options.exportRoot) {
    throw new Error("--run-root and --export-root are required");
  }
  return options;
}

try {
  const manifest = await exportSanitizedArtifacts(parseArguments(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify({
    status: "sanitized",
    files: manifest.files.length,
    manifest: `${process.argv[process.argv.indexOf("--export-root") + 1]}/export-manifest.json`,
  })}\n`);
} catch (error) {
  process.stderr.write(`Benchmark artifact export failed: ${error.message}\n`);
  process.exitCode = 1;
}

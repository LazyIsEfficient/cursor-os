import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { readBenchmarkManifest } from "./lib/manifest.mjs";
import {
  aggregateReport,
  writeReportFiles,
} from "./lib/report.mjs";
import { validateResultRecords } from "./lib/result.mjs";
import { hashTree } from "./lib/util.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// scripts/verify-plugin-lifecycle.mjs produces the artifact this gate consumes and must
// derive pluginSourceSha256 from the same helper against the same directory.
const sourcePlugin = join(repositoryRoot, "plugin");
// Executed as a subprocess, not imported: benchmark/ must not take a module dependency on
// scripts/ while the shared-lib layering decision spanning PRs #19/#22/#23 is open.
const lifecycleVerifier = join(repositoryRoot, "scripts", "verify-plugin-lifecycle.mjs");
const execFileAsync = promisify(execFile);

const EXPECTED_LIFECYCLE_STATUSES = ["installed", "unchanged", "repaired", "uninstalled"];
const EVIDENCE_PROPERTIES = new Set([
  "schemaVersion",
  "command",
  "temporaryCursorRoot",
  "pluginSourceSha256",
  "lifecycleStatuses",
  "removalVerified",
  "unrelatedRegistrationPreserved",
  "inputDigest",
]);

// Key order is not meaningful in the artifact, so compare on a canonical form.
function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
}

function assertEvidenceShape(evidence, { inputDigest }) {
  if (evidence === null || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new Error("plugin lifecycle evidence artifact is invalid");
  }
  const unknown = Object.keys(evidence).filter((key) => !EVIDENCE_PROPERTIES.has(key));
  if (unknown.length > 0) {
    throw new Error(
      `plugin lifecycle evidence artifact carries unknown properties ${unknown.sort().join(", ")}`,
    );
  }
  if (
    evidence.schemaVersion !== "1.0.0" ||
    evidence.command !== "npm run plugin:lifecycle:verify" ||
    evidence.temporaryCursorRoot !== true ||
    evidence.removalVerified !== true ||
    evidence.unrelatedRegistrationPreserved !== true ||
    !/^[a-f0-9]{64}$/u.test(evidence.pluginSourceSha256) ||
    JSON.stringify(evidence.lifecycleStatuses) !== JSON.stringify(EXPECTED_LIFECYCLE_STATUSES)
  ) {
    throw new Error("plugin lifecycle evidence artifact is invalid");
  }
  // Fails closed on absence: a binding that only applies when the artifact opts into it
  // is not a binding.
  if (evidence.inputDigest === undefined) {
    throw new Error(
      "plugin lifecycle evidence is missing inputDigest; re-run " +
        `npm run plugin:lifecycle:verify -- --evidence <path> --input-digest ${inputDigest}`,
    );
  }
  if (evidence.inputDigest !== inputDigest) {
    throw new Error("plugin lifecycle evidence is bound to a different benchmark run");
  }
}

// The artifact is a self-report: every field in it is a constant or a digest the writer
// can compute, so reading it proves nothing about whether the lifecycle ever ran. Running
// the verifier here means this gate observes the lifecycle itself.
async function runLifecycleVerifier(inputDigest) {
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [lifecycleVerifier, "--input-digest", inputDigest],
      { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 1024 * 1024 },
    );
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      `plugin lifecycle verification re-run failed: ${(error.stderr || error.message).trim()}`,
    );
  }
}

function parseArguments(argv) {
  const options = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      positional.push(argument);
      continue;
    }
    const value = argv[++index];
    if (value === undefined) throw new Error(`${argument} requires a value`);
    if (argument === "--generated-at") options.generatedAt = value;
    else if (argument === "--output-prefix") options.outputPrefix = value;
    else if (argument === "--plugin-lifecycle") options.pluginLifecycleStatus = value;
    else if (argument === "--plugin-lifecycle-evidence") options.pluginLifecycleEvidence = value;
    else if (argument === "--plugin-lifecycle-evidence-file") options.pluginLifecycleEvidenceFile = value;
    else throw new Error(`unknown option ${argument}`);
  }
  if (positional.length !== 2) {
    throw new Error("usage: npm run benchmark:report -- <benchmark-manifest.json> <results.ndjson> [options]");
  }
  return { manifestPath: positional[0], recordPath: positional[1], ...options };
}

async function lifecycleGate(options, { inputDigest }) {
  if (options.pluginLifecycleEvidenceFile) {
    const evidence = JSON.parse(await readFile(options.pluginLifecycleEvidenceFile, "utf8"));
    assertEvidenceShape(evidence, { inputDigest });
    const observedPluginSha256 = await hashTree(sourcePlugin);
    if (evidence.pluginSourceSha256 !== observedPluginSha256) {
      throw new Error(
        "plugin lifecycle evidence pluginSourceSha256 " +
          `${evidence.pluginSourceSha256} does not match the digest of plugin/ ` +
          `${observedPluginSha256}; the evidence does not describe the plugin under report. ` +
          "Re-run npm run plugin:lifecycle:verify -- --evidence " +
          `${options.pluginLifecycleEvidenceFile} --input-digest ${inputDigest}`,
      );
    }
    const observed = await runLifecycleVerifier(inputDigest);
    if (canonicalize(observed) !== canonicalize(evidence)) {
      throw new Error(
        "plugin lifecycle evidence does not match the verification this gate just ran; " +
          "the artifact was not produced by scripts/verify-plugin-lifecycle.mjs. Re-run " +
          `npm run plugin:lifecycle:verify -- --evidence ${options.pluginLifecycleEvidenceFile} ` +
          `--input-digest ${inputDigest}`,
      );
    }
    return {
      status: "pass",
      evidence:
        `command=${evidence.command};artifact=${options.pluginLifecycleEvidenceFile}` +
        `;pluginSourceSha256=${observedPluginSha256};inputDigest=${inputDigest}` +
        ";reverifiedBy=benchmark/report.mjs",
    };
  }
  const status = options.pluginLifecycleStatus ?? "fail";
  if (!new Set(["pass", "fail"]).has(status)) {
    throw new Error("--plugin-lifecycle must be pass or fail");
  }
  if (status === "pass") {
    throw new Error("--plugin-lifecycle pass requires --plugin-lifecycle-evidence-file");
  }
  return {
    status,
    evidence: options.pluginLifecycleEvidence ?? "plugin lifecycle evidence was not supplied",
  };
}

try {
  const options = parseArguments(process.argv.slice(2));
  const loaded = await readBenchmarkManifest(options.manifestPath);
  const records = (await readFile(options.recordPath, "utf8"))
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`result record line ${index + 1} is invalid JSON: ${error.message}`);
      }
    });
  validateResultRecords(records, { loadedManifest: loaded });
  const pluginLifecycle = await lifecycleGate(options, { inputDigest: loaded.inputDigest });
  const report = aggregateReport({
    benchmarkId: loaded.manifest.benchmarkId,
    profile: loaded.manifest.profile,
    inputDigest: loaded.inputDigest,
    generatedAt: options.generatedAt,
    plannedPairs: loaded.fixtures.length * loaded.manifest.repetitions,
    pairs: records,
    plannedFixtures: loaded.fixtures.map(({ manifest: fixture }) => ({
      fixtureId: fixture.fixtureId,
      category: fixture.category,
    })),
    repetitions: loaded.manifest.repetitions,
    loadedManifest: loaded,
    pluginLifecycle,
  });
  const defaultPrefix = resolve(dirname(options.recordPath), "report");
  const prefix = resolve(options.outputPrefix ?? defaultPrefix);
  const jsonPath = `${prefix}.json`;
  const markdownPath = `${prefix}.md`;
  await writeReportFiles({ report, jsonPath, markdownPath });
  process.stdout.write(`${JSON.stringify({
    eligible: report.eligibility.eligible,
    speedClaim: report.speed.claim,
    json: jsonPath,
    markdown: markdownPath,
  })}\n`);
} catch (error) {
  process.stderr.write(`Benchmark report failed: ${error.message}\n`);
  process.exitCode = 1;
}

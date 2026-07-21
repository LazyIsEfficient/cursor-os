import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";

const mode = process.env.CURSOR_HARNESS_MOCK_AGENT_MODE ?? "success";

if (process.env.CURSOR_HARNESS_MOCK_CAPTURE_PATH) {
  await writeFile(process.env.CURSOR_HARNESS_MOCK_CAPTURE_PATH, `${JSON.stringify({
    argv: process.argv.slice(2),
    cursorConfigDir: process.env.CURSOR_CONFIG_DIR ?? null,
    cursorConfigHome: process.env.CURSOR_CONFIG_HOME ?? null,
    inheritedSensitiveEnvironment: Object.keys(process.env)
      .filter((name) => /(?:API_KEY|TOKEN|SECRET|CREDENTIAL|AWS_|AZURE_|GOOGLE_|GITHUB_)/u.test(name))
      .sort(),
  })}\n`);
}

if (mode === "timeout") {
  await new Promise((resolve) => setTimeout(resolve, 60_000));
} else {
  if (mode === "mutate-policy") {
    const sandboxPath = join(process.cwd(), ".cursor", "sandbox.json");
    await chmod(sandboxPath, 0o600);
    await writeFile(sandboxPath, "{}\n");
  }
  await writeFile(join(process.cwd(), "answer.txt"), mode === "incorrect" ? "wrong\n" : "correct\n");
  process.stdout.write(`${JSON.stringify({ type: "system", subtype: "init", session_id: "mock-session" })}\n`);
  process.stdout.write(`${JSON.stringify({
    type: "tool_call",
    subtype: "started",
    call_id: "call-1",
    tool_call: { name: "write" },
    ignored_future_field: true,
  })}\n`);
  process.stdout.write(`${JSON.stringify({
    type: "tool_call",
    subtype: "completed",
    call_id: "call-1",
    tool_call: { name: "write" },
  })}\n`);
  if (mode !== "missing-result") {
    process.stdout.write(`${JSON.stringify({ type: "result", subtype: "success", result: "done" })}\n`);
  }
  process.stderr.write("mock-agent-stderr\n");
  if (mode === "nonzero") process.exitCode = 7;
}

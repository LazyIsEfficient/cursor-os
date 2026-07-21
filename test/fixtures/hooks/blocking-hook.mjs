let input = "";

for await (const chunk of process.stdin) {
  input += chunk;
}

let payload;
try {
  payload = JSON.parse(input);
} catch {
  process.stderr.write("Hook input must be valid JSON.\n");
  process.exitCode = 1;
}

if (payload?.command === "probe:exit-2") {
  process.exitCode = 2;
} else if (payload?.command === "probe:deny") {
  process.stdout.write(
    `${JSON.stringify({
      permission: "deny",
      user_message: "Capability probe denial.",
      agent_message: "The deterministic capability probe blocked this command.",
    })}\n`,
  );
} else if (payload) {
  process.stdout.write(`${JSON.stringify({ permission: "allow" })}\n`);
}

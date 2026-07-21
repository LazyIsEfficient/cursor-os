import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const workspace = process.argv[2];
const failures = [];

if (!workspace) {
  console.error("workspace argument is required");
  process.exit(2);
}
async function load(path) {
  try {
    return await import(pathToFileURL(join(workspace, path)).href);
  } catch (error) {
    failures.push(`${path}: ${error.message}`);
    return {};
  }
}

function check(label, assertion) {
  try {
    assertion();
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
  }
}

const email = await load("src/email.mjs");
const sms = await load("src/sms.mjs");
const registry = await load("src/channels.mjs");
const message = { recipient: "ada@example.test", body: "hello" };
check("email handler", () => assert.equal(
  email.sendEmail(message),
  "email:ada@example.test:hello",
));
check("sms handler", () => assert.equal(
  sms.sendSms({ recipient: "+15550001", body: "hello" }),
  "sms:+15550001:hello",
));
check("sms length boundary", () => {
  assert.equal(
    sms.sendSms({ recipient: "x", body: "a".repeat(160) }),
    `sms:x:${"a".repeat(160)}`,
  );
  assert.throws(
    () => sms.sendSms({ recipient: "x", body: "a".repeat(161) }),
    RangeError,
  );
});
check("email registered", () => assert.equal(
  registry.deliver("email", message),
  "email:ada@example.test:hello",
));
check("sms registered", () => assert.equal(
  registry.deliver("sms", { recipient: "7", body: "ok" }),
  "sms:7:ok",
));
check("console preserved", () => assert.equal(
  registry.deliver("console", { body: "visible" }),
  "console:visible",
));
check("unknown channel preserved", () => assert.throws(
  () => registry.deliver("fax", message),
  /unknown channel: fax/u,
));

if (failures.length > 0) {
  console.error("acceptance failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("acceptance passed");

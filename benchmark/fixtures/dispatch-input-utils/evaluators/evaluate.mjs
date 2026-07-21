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

const colors = await load("src/is-hex-color.mjs");
const users = await load("src/is-safe-username.mjs");
const ports = await load("src/parse-port.mjs");
check("isHexColor valid", () => {
  assert.equal(colors.isHexColor("#aB3"), true);
  assert.equal(colors.isHexColor("#00ff7F"), true);
});
check("isHexColor invalid", () => {
  assert.equal(colors.isHexColor("fff"), false);
  assert.equal(colors.isHexColor("#abcd"), false);
  assert.equal(colors.isHexColor(123), false);
});
check("isSafeUsername valid", () => {
  assert.equal(users.isSafeUsername("Ada_123"), true);
  assert.equal(users.isSafeUsername("abc"), true);
});
check("isSafeUsername invalid", () => {
  assert.equal(users.isSafeUsername("1admin"), false);
  assert.equal(users.isSafeUsername("ab"), false);
  assert.equal(users.isSafeUsername("user-name"), false);
});
check("parsePort valid", () => {
  assert.equal(ports.parsePort("1"), 1);
  assert.equal(ports.parsePort(443), 443);
  assert.equal(ports.parsePort("65535"), 65535);
});
check("parsePort invalid", () => {
  assert.equal(ports.parsePort("080"), null);
  assert.equal(ports.parsePort("1.5"), null);
  assert.equal(ports.parsePort(0), null);
  assert.equal(ports.parsePort(65536), null);
});

if (failures.length > 0) {
  console.error("acceptance failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("acceptance passed");

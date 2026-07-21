import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspace = process.argv[2];
const failures = [];

function check(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(label);
}

if (!workspace) {
  failures.push("workspace argument is required");
} else {
  try {
    const moduleUrl = pathToFileURL(resolve(workspace, "src/config.mjs")).href;
    const { parseConfig } = await import(moduleUrl);
    check(
      "values preserve embedded equals",
      parseConfig("TOKEN=header.payload==\nURL=https://example.test/?a=b=c"),
      { TOKEN: "header.payload==", URL: "https://example.test/?a=b=c" },
    );
    check(
      "comments blanks and empty values remain supported",
      parseConfig("# comment\r\n\r\n EMPTY = \r\n MODE = safe \r\n"),
      { EMPTY: "", MODE: "safe" },
    );
    check(
      "later duplicate values win without truncation",
      parseConfig("KEY=old\nKEY=new=value"),
      { KEY: "new=value" },
    );
  } catch {
    failures.push("workspace module could not be evaluated");
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}

export function parseConfig(text) {
  const entries = [];

  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const [key, value = ""] = line.split("=");
    entries.push([key.trim(), value.trim()]);
  }

  return Object.fromEntries(entries);
}

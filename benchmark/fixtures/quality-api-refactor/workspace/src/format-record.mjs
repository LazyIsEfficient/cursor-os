export function formatRecord(record, mode = "compact") {
  if (mode === "compact") {
    const name = String(record.name ?? "").trim();
    const role = String(record.role ?? "").trim();
    return `${name}|${role}`;
  }

  if (mode === "verbose") {
    const name = String(record.name ?? "").trim();
    const role = String(record.role ?? "").trim();
    return `Name: ${name}; Role: ${role}`;
  }

  throw new RangeError(`Unsupported mode: ${mode}`);
}

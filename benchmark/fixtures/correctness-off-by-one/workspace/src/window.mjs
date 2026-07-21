export function centeredWindow(values, center, radius) {
  if (!Number.isInteger(center) || !Number.isInteger(radius) || radius < 0) {
    throw new TypeError("center and radius must be non-negative integers");
  }

  const start = Math.max(0, center - radius);
  const end = Math.min(values.length - 1, center + radius);
  return values.slice(start, end);
}

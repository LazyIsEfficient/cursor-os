export function summarizeRange(values) {
  if (!Array.isArray(values)) throw new TypeError("values must be an array");
  if (values.length === 0) return { min: null, max: null, total: 0, count: 0 };

  return {
    min: values[0],
    max: values.at(-1),
    total: values.reduce((sum, value) => sum + value, 0),
    count: values.length,
  };
}

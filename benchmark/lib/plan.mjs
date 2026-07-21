import { randomUUID } from "node:crypto";

import { invariant, sha256 } from "./util.mjs";

export function deriveRunPlan(loadedManifest, { runId = randomUUID() } = {}) {
  invariant(
    typeof runId === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(runId),
    "runId must be a safe path segment",
  );
  const pairs = [];
  for (const fixtureEntry of loadedManifest.fixtures) {
    const fixtureId = fixtureEntry.manifest.fixtureId;
    for (let repetition = 0; repetition < loadedManifest.manifest.repetitions; repetition += 1) {
      const randomDigest = sha256(`${loadedManifest.manifest.seed}\0${fixtureId}\0${repetition}`);
      const armOrder = Number.parseInt(randomDigest.slice(0, 2), 16) % 2 === 0
        ? "off-then-on"
        : "on-then-off";
      const pairId = `${runId}:${fixtureId}:${repetition + 1}:pair`;
      pairs.push({
        runId,
        pairId,
        fixtureId,
        repetition,
        armOrder,
        fixtureEntry,
        trials: {
          "harness-off": { trialId: `${pairId}:off`, arm: "harness-off" },
          "harness-on": { trialId: `${pairId}:on`, arm: "harness-on" },
        },
      });
    }
  }
  return { runId, pairs };
}

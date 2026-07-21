# Synthetic stream-json fixtures

`SYNTHETIC-stream-json.ndjson` is **hand-written and format-illustrative only**.

It is not captured evidence. No authenticated Cursor CLI run produced it, and it
must never be presented as proof that the plugin loaded. It exists so
`matchComponentsInStream` in `scripts/verify-cli-plugin-loading.mjs` can be
tested without a live CLI: it exercises the documented event types (`system`,
`user`, `assistant`, `result`) and the rule that `user` events — which echo the
prompt — are excluded from component matching.

Real evidence is only produced by `npm run plugin:cli:verify`, which binds the
stream to a plugin digest computed at capture time.

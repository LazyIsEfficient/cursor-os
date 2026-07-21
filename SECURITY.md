# Security

## Support boundary

The shipped command hook is supported for local Cursor Editor and Cursor CLI
workflows in a trusted project workspace. Cloud Agent execution is not
supported or claimed by this repository because it has not been exercised by
the repository's capability probes.

Installing or opening a project that enables project hooks permits local
scripts from that workspace to execute. Review and trust the workspace before
enabling its hooks. Marketplace review or publication is not sufficient
evidence that a plugin or its local scripts are safe.

## Command guard

`plugin/hooks/hooks.json` registers one command-based
`beforeShellExecution` hook using Cursor hook schema version 1. It invokes the
Node-standard-library-only script through the exact safely quoted command
`node "${CURSOR_PLUGIN_ROOT}/scripts/before-shell-execution.mjs"`, with a
five-second timeout and `failClosed: true`. Cursor expands
`CURSOR_PLUGIN_ROOT` to the installed plugin directory; this avoids resolving
the script against the active workspace used as the hook's working directory.
The Node script itself does not inspect environment variables.

The guard denies a deliberately small set of recognizable high-impact
operations:

- recursive forced deletion of high-impact filesystem targets;
- Git worktree/index discard, forced cleaning, branch force-deletion, and
  force-push forms;
- selected remote object and package registry deletion/publication commands;
- direct shell mutation or redirection targeting evaluator or canary paths.

Malformed input is denied with deterministic JSON. The script does not use the
network, execute parsed text, read files, inspect environment variables, or
read credentials.

This hook is a safety interlock, not a shell parser, sandbox, authorization
system, or security boundary. Shell expansion, aliases, generated commands,
alternate binaries, editor tools, and non-shell paths can bypass textual
matching. Cursor rules and LLM instructions are also not security boundaries.
Sensitive operations still require operating-system permissions, repository
protections, least-privilege credentials, and human review.

## Evaluator integrity

Hidden evaluators and canaries must remain outside agent-writable inputs where
possible. The hook rejects obvious shell mutations to paths named for those
assets, but the benchmark harness must independently verify expected digests
and canary values after each run. A hook allow decision is never evidence that
an evaluator remained intact.

See `docs/threat-model.md` for the detailed trust model and residual risks.

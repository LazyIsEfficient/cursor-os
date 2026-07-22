# Security

## Reporting a vulnerability

Do not open a public issue, pull request, or discussion for a suspected
vulnerability. Report it privately through GitHub's private vulnerability
reporting form at
<https://github.com/LazyIsEfficient/cursor-os/security/advisories/new>. Reports
submitted there are visible only to repository maintainers.

Include the affected file or command, what you observed, and the steps to
reproduce it. `npm run probe` output is useful when the issue involves hook
execution, because it is network-free and records what your local Cursor Editor
and CLI actually support.

Expect an acknowledgement from a maintainer. This repository publishes no
response-time commitment, because none has been measured — treat the absence of
a stated window as exactly that, not as a service level.

Read the support boundary below before reporting. Behaviour outside it —
notably Cloud Agent execution — is not a supported configuration, and the
command guard is explicitly not a security boundary.

> **Maintainer note:** this repository publishes no email contact, so GitHub's
> private reporting form is the only private maintainer channel. Replace the URL
> above with a dedicated security address if you prefer email.
>
> **Verify before the repository goes public:** the repository is currently
> private, so neither the advisory URL above nor the `blob/main/...` links in
> `.github/ISSUE_TEMPLATE/` can be confirmed to resolve for an anonymous
> visitor. Confirm that GitHub private vulnerability reporting is enabled
> (Settings → Code security and analysis) before publishing, or this section
> points at a form nobody outside the org can reach.

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

The guard is a default-deny allowlist over tokenized command forms:

- allow only literal path-like command words (no expansion metacharacters in
  command position), with optional safe assignments and common wrappers;
- deny active command substitutions (`$()`, backticks) and process
  substitutions (`<(...)`, `>(...)`) wherever they expand;
- deny `eval` except the exact named forms `eval "$(direnv hook zsh)"` and
  `eval "$(ssh-agent -s)"`;
- deny high-impact resolved shapes even when literal, including recursive
  force `rm`, destructive Git forms, selected `gh` and package-registry
  mutations, and evaluator/canary path mutations or redirects;
- recursively allowlist shell `-c` payloads;
- deny malformed input with deterministic JSON.

The script does not use the network, execute parsed text, read files, inspect
environment variables, or read credentials.

This hook is a safety interlock, not a sandbox, authorization system, or
security boundary. Pipe-into-interpreter forms (`printf … | bash`), aliases,
and non-shell tools are outside the allowlist's claims. Cursor rules and LLM
instructions are also not security boundaries. Sensitive operations still
require operating-system permissions, repository protections, least-privilege
credentials, and human review.

## Evaluator integrity

Hidden evaluators and canaries must remain outside agent-writable inputs where
possible. The hook rejects obvious shell mutations to paths named for those
assets, but the benchmark harness must independently verify expected digests
and canary values after each run. A hook allow decision is never evidence that
an evaluator remained intact.

See `docs/threat-model.md` for the detailed trust model and residual risks.

# Threat model

## Scope and security goals

This model covers the local Cursor Editor and Cursor CLI plugin hook in
`plugin/hooks/hooks.json` and its command guard. Cloud Agent behavior is not
supported by this control because this repository has not verified the hook in
Cloud.

The goals are to:

1. allow only positively recognized safe shell command forms and deny
   everything else, including expansion-based rewrites of what program runs;
2. fail closed when Cursor observes a hook crash, timeout, or invalid output;
3. avoid introducing network, credential, dynamic-code, or configuration
   access into the hook runtime; and
4. make attempted evaluator or canary mutation through obvious shell forms
   visible as denials, with independent harness integrity checks as the
   remaining control.

## Assets

- the user's working tree, uncommitted changes, branches, and Git history;
- remote repositories, releases, and package registry state;
- benchmark evaluators, expected results, canaries, and integrity digests;
- local credentials and Cursor configuration; and
- the availability of normal development commands.

## Trust boundaries

### Workspace to local process

Plugin scripts execute locally with the permissions of the Cursor process.
Project hooks therefore cross from workspace-controlled files into local code
execution. A project workspace must be trusted before its hooks are enabled.
Plugin hook commands execute from the active workspace, so the hook uses
Cursor's `CURSOR_PLUGIN_ROOT` environment variable rather than a bare relative
path to locate its installed script. The shell expands that variable before
starting Node; the guard script never reads credentials, environment
variables, user configuration, or workspace files.

### Agent or user text to shell

The hook receives Cursor's JSON event on standard input. The `command` field is
untrusted text. The guard tokenizes but never executes, evaluates, expands, or
rewrites that text. It emits one deterministic JSON permission decision on
standard output.

### Plugin distribution

Marketplace review can improve discoverability and baseline quality, but it is
not a sufficient security boundary or substitute for reviewing the installed
plugin version. Repository protections and signed or pinned distribution
artifacts remain separate controls.

### Evaluator boundary

Evaluators, canaries, and their expected values are security-sensitive
benchmark controls. They should be unavailable to the evaluated agent and
read-only to the trial workspace where practical. The command hook blocks
obvious shell mutations to path names containing `evaluator` or `canary`.
Post-run digest and canary verification is authoritative because edits can
occur through tools and processes that do not pass through this hook.
Each benchmark trial also snapshots the complete agent-visible workspace
immediately before agent execution and after it returns. Only fixture-declared
`expectedWritePaths` may change. The generated prompt is always protected, and
the generated `.cursor/sandbox.json` and project-overlay files are accepted
only at their exact recorded hashes. Unexpected additions, modifications,
deletions, symbolic links, or snapshot errors invalidate the trial.

Cursor CLI trials invoke the documented `--sandbox enabled` mode and use the
official `CURSOR_CONFIG_DIR` override for isolated CLI configuration. A
protected pre-authenticated config template outside the workspace is validated
for path containment and symlinks, then copied into each fresh config home. The
CLI child receives only allowlisted non-secret operational variables; API keys,
CI/cloud credentials, and token variables are not inherited. The
per-trial sandbox policy grants no extra paths, disables temporary-directory
writes, denies network by default, and denies all IPv4 and IPv6 CIDRs. Cursor's
documented merge contract makes deny rules and the deny default take
precedence: https://cursor.com/docs/reference/sandbox.

## Controls

The hook uses Cursor schema version 1 and a single `beforeShellExecution`
command. Its exact command is
`node "${CURSOR_PLUGIN_ROOT}/scripts/before-shell-execution.mjs"` so the
installed script path remains correct when the active workspace is the working
directory. The plugin-root path is shell-quoted, timeout is five seconds, and
`failClosed` is enabled. Cursor's documented fail-closed behavior is relied on
for crashes, timeouts, and invalid hook output; local tests verify the static
configuration and script contract, not Cursor's enforcement implementation.

The guard is a default-deny allowlist composed as allow named `eval`
exceptions → deny active expansions (including ANSI-C `$'...'` quoting) →
peel known wrappers/launchers → deny high-impact resolved shapes → allow
only safe literal command forms → else deny. Safe forms require a literal
path-like command word with no expansion metacharacters in command position,
optional safe assignments, wrappers, and command launchers (`timeout`,
`nice`, `busybox`, `time`, `stdbuf`), and recursively allowlisted shell `-c`
payloads. It denies active command substitutions (`$()`, backticks), process
substitutions (`<(...)`, `>(...)`), and ANSI-C quotes (`$'...'`) wherever
they expand, denies `eval` except the exact named forms
`eval "$(direnv hook zsh)"` and `eval "$(ssh-agent -s)"`, and denies
malformed JSON, missing or invalid commands, malformed quoting, unterminated
substitutions, and oversized input. High-impact shapes denied even as
literals include recursive force `rm`, destructive Git forms, `git -c`
shell-escape config injection, selected `gh` and package-registry mutations,
and evaluator/canary path mutations. Ordinary single-quoted text remains
inert. Missed expansion mechanisms therefore fail as false denies rather
than silent allows.

The runtime is Node.js standard library only and network-free. It has no
dynamic evaluation, subprocess execution, filesystem access, environment
inspection, credential reads, telemetry, or broad Cursor configuration
replacement.

## Threats and residual risk

| Threat | Control | Residual risk |
|---|---|---|
| Expansion-based command rewrite (`eval`, glob command names, `$()`, `$'...'`, process substitution, launchers) | Default-deny allowlist; deny active expansions including ANSI-C quotes; peel known launchers then re-check; named `eval` exceptions only | Other rewrite mechanisms (aliases, unprobed launchers/interpreters) may still surprise; they fail closed only when they introduce a denied form |
| Accidental mass deletion or work loss | Deny recursive force `rm` and destructive Git forms even as literal argv or after known launchers | Other tools, encodings, and non-shell paths can still discard work |
| Remote history or object destruction | Deny force pushes, selected `gh` deletion forms, and `git -c` shell-escape config injection | Normal pushes and other remote clients remain allowed |
| Package registry mutation | Deny direct npm/pnpm publish and unpublish forms | Other clients, wrappers, or APIs remain outside scope |
| Pipe into interpreter (`printf … \| bash`) | Out of scope; not claimed blocked | Interpreter stdin can still run arbitrary scripts |
| Evaluator or canary tampering | Deny obvious shell path mutation; require post-run integrity checks | Non-shell edits and disguised paths are not intercepted |
| Prompt, seed, or overlay tampering | Before/after workspace snapshots enforce expected writes and recorded overlay hashes | Filesystem metadata and empty-directory changes are outside the file-content snapshot |
| Agent network access | Exact hash-stable per-trial policy plus `--sandbox enabled`; normalized direct network tool attempts, absolute client paths, and common command wrappers are critical violations | A runner whose CLI lacks documented sandbox support cannot execute an eligible trial; model API traffic required by Cursor itself remains outside evaluated tool traffic |
| Malformed or failed hook | Deterministic denial plus Cursor `failClosed` and timeout configuration | Cursor enforcement must still be verified in the actual local client |
| Prompt injection changes policy | Policy is executable deterministic code, not an LLM decision | An actor able to edit or disable the hook can change the policy |
| Credential disclosure | CLI subprocess environment allowlist; per-trial copied config home; sanitized artifact allowlist with exact-canary and credential-pattern scans | The authenticated Cursor process necessarily reads its isolated config; compromise of the trusted runner or Cursor binary remains out of scope |
| Forged local benchmark evidence | Result records are bound to the loaded plan, evaluator contracts, mandatory security outcomes, and integrity hashes | Hashes are not authentication; a local operator controlling files can forge them without external attestation |

## Explicit non-goals

The guard is not a complete shell grammar, endpoint protection product,
sandbox, data-loss-prevention system, or user-consent mechanism. It does not
claim to block pipe-into-interpreter forms, secure Cloud Agents, intercept
non-shell tools, authorize routine shared-state changes, or make LLM rules
enforceable. Operating-system permissions, least-privilege credentials,
branch protections, isolated benchmark workspaces, and deterministic
integrity checks remain required.

## CI and authenticated benchmark operation

Pull-request and push CI runs validation, tests, install-lifecycle coverage,
and the 24-trial deterministic corpus mock without credentials or model calls.
Authenticated 24-trial and 72-trial runs require manual dispatch, an explicit
protected GitHub Environment, confirmation of model calls, and a preconfigured
self-hosted `cursor-benchmark` runner with protected pre-authenticated
config-template and secret-canary-file paths. No API key is passed through
workflow environment variables or arguments. Only a successful sanitized
export is retained for 30 days; raw run roots, workspaces, and Cursor config
homes are never upload paths. The workflow does not publish, release, push, or
modify shared Cursor configuration.
All referenced first-party GitHub Actions are pinned to immutable full commit
SHAs.

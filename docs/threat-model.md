# Threat model

## Scope and security goals

This model covers the local Cursor Editor and Cursor CLI plugin hook in
`plugin/hooks/hooks.json` and its command guard. Cloud Agent behavior is not
supported by this control because this repository has not verified the hook in
Cloud.

The goals are to:

1. stop a small set of unambiguously destructive shell commands before local
   execution;
2. fail closed when Cursor observes a hook crash, timeout, or invalid output;
3. avoid introducing network, credential, dynamic-code, or configuration
   access into the hook runtime; and
4. make attempted evaluator or canary mutation visible and independently
   detectable.

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

The guard itself denies malformed JSON, missing or invalid commands, malformed
shell quoting or command substitutions, oversized input, and recognized
destructive forms, including destructive commands nested in `$()` or
backticks. Single-quoted substitution text remains inert. Recognition also
survives subshell and brace grouping (`(rm -rf /)`, `{ npm publish; }`), a
leading reserved word (`if true; then rm -rf /; fi`), `case` arms
(`case $x in a) rm -rf /;; esac`), and backslash-newline line continuations,
which are joined before tokenizing because the shell removes them entirely.

Command wrappers are resolved from a single table that declares, per wrapper,
which flags consume the following word. That is what keeps a separated flag
value (`timeout -k 10 5 rm -rf /`) from being mistaken for the wrapped
executable; the attached (`-k10`) and `--flag=value` forms resolve identically.
The table currently covers `command`, `builtin`, `nohup`, `time`, `exec`,
`env`, `sudo`, `doas`, `timeout`, `nice`, `ionice`, `setsid`, `stdbuf`, `chrt`,
`taskset`, `chroot`, and `xargs`, plus `script -c` and `sh -c` style shells,
whose command argument is re-inspected recursively. Wrappers that place a
mandatory operand before the command (`timeout` duration, `chroot` directory,
`chrt` priority, `taskset` mask) declare that operand so it is skipped rather
than read as the executable.

High-impact deletion targets are compared in canonical form, so `rm -rf //`,
`rm -rf /.`, and `rm -rf /..` are recognized alongside `rm -rf /`. The
normalization resolves `.`, `..`, duplicate slashes, and trailing slashes as
text only; it never touches the filesystem and never expands variables or
globs, so `rm -rf ${HOME}/scratch` remains a scoped delete.

Writes to protected artifacts are recognized through `>`, `>>`, `>|`, `>&`,
`&>`, and `&>>`, all of which can truncate a file.

Grouping the tokenizer cannot pair — an unbalanced `(`, `)`, `{`, `}`, or an
unterminated `case` — is denied rather than parsed on a guess. The guard allows
commands outside its narrow denylist so ordinary development is not converted
into a broad policy gate.

The `protected-artifact-reference` rule is deliberately coarse. The guard does
not model each tool's argument grammar, so it cannot distinguish a path operand
from pattern text, nor an in-place edit from a read — sniffing `-i` is
unreliable across GNU and BSD variants. Any mutation-capable tool that names a
protected artifact is therefore denied, **including read-only invocations**:
`sed -n 1p evaluators/x.json` is denied even though it only reads, and
`sed -n '/canary/p' notes.txt` is denied because the pattern text matches even
though the file is unprotected. Reading protected artifacts remains possible
with tools that have no mutating mode, such as `cat` and `grep`. The rule is
named for that breadth rather than for mutation alone.

The runtime is Node.js standard library only and network-free. It has no
dynamic evaluation, subprocess execution, filesystem access, environment
inspection, credential reads, telemetry, or broad Cursor configuration
replacement.

## Threats and residual risk

| Threat | Control | Residual risk |
|---|---|---|
| Accidental mass deletion | Deny recursive forced deletion of high-impact targets, compared in canonical path form | Alternate tools, expansions, scripts, encoded commands, and operands arriving from an upstream pipeline segment may bypass matching |
| Loss of local Git work | Deny hard reset, forced clean, and force branch deletion, including nested command substitutions | Other Git or filesystem operations can still discard work |
| Remote history or object destruction | Deny force pushes and selected `gh` deletion forms | Normal pushes and other remote clients remain allowed |
| Package registry mutation | Deny direct npm/pnpm publish and unpublish forms | Other clients, wrappers, or APIs remain outside scope |
| Evaluator or canary tampering | Deny any mutation-capable tool (`cp`, `tee`, `dd`, `ln`, `install`, `sed`, …) naming a protected artifact, and every truncating redirect (`>`, `>>`, `>\|`, `>&`, `&>`, `&>>`); require post-run integrity checks | Non-shell edits and disguised paths are not intercepted; the rule is coarse in the other direction too, denying read-only uses of those tools |
| Prompt, seed, or overlay tampering | Before/after workspace snapshots enforce expected writes and recorded overlay hashes | Filesystem metadata and empty-directory changes are outside the file-content snapshot |
| Agent network access | Exact hash-stable per-trial policy plus `--sandbox enabled`; normalized direct network tool attempts, absolute client paths, and common command wrappers are critical violations | A runner whose CLI lacks documented sandbox support cannot execute an eligible trial; model API traffic required by Cursor itself remains outside evaluated tool traffic |
| Malformed or failed hook | Deterministic denial plus Cursor `failClosed` and timeout configuration | Cursor enforcement must still be verified in the actual local client |
| Prompt injection changes policy | Policy is executable deterministic code, not an LLM decision | An actor able to edit or disable the hook can change the policy |
| Credential disclosure | CLI subprocess environment allowlist; per-trial copied config home; sanitized artifact allowlist with exact-canary and credential-pattern scans | The authenticated Cursor process necessarily reads its isolated config; compromise of the trusted runner or Cursor binary remains out of scope |
| Forged local benchmark evidence | Result records are bound to the loaded plan, evaluator contracts, mandatory security outcomes, and integrity hashes | Hashes are not authentication; a local operator controlling files can forge them without external attestation |

### Known bypasses of the command guard

These are demonstrated, currently unfixed limitations. They are recorded here
so the coverage described above is not read as completeness.

- **Pipeline operand correlation.** Each pipeline segment is inspected
  independently, so a fatal operand supplied by an upstream segment is never
  correlated with the consuming command: `echo / | xargs rm -rf` is allowed.
  Closing this needs dataflow across segments, which the guard does not do. The
  available conservative alternative — denying every `xargs rm -rf` whose target
  is unknown — would also deny the common `find … | xargs rm -rf` idiom, so the
  bypass is disclosed rather than traded for that false-positive rate.
- **Wrapper enumeration is not closed.** Wrappers are recognized by name, and
  the set of programs that can execute another program is open-ended. The table
  above covers the common ones, but an unlisted wrapper (or a locally installed
  one) resolves to itself and its wrapped command is never inspected. Only an
  allowlist of permitted leading commands would terminate, and that would
  convert the guard into the broad policy gate it deliberately is not.
- **Text-level evasion generally.** Variable indirection, aliases, globs that
  expand to a fatal target, encoded or generated command text, and paths that
  reach a protected artifact by a name the pattern does not match all remain
  outside a tokenizer that never executes or expands anything.

The post-run digest and canary verification described under the evaluator
boundary is the authoritative control; the command guard is a fast local
deterrent layered in front of it, not a substitute.

## Explicit non-goals

The guard is not a complete shell grammar, endpoint protection product,
sandbox, data-loss-prevention system, or user-consent mechanism. It does not
claim to secure Cloud Agents, intercept non-shell tools, authorize routine
shared-state changes, or make LLM rules enforceable. Operating-system
permissions, least-privilege credentials, branch protections, isolated
benchmark workspaces, and deterministic integrity checks remain required.

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

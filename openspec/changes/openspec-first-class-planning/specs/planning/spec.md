## ADDED Requirements

### Requirement: Engineering planning artifacts are OpenSpec changes
The orchestrator SHALL store every engineering planning artifact on disk under
`openspec/` in the consumer repository root: proposals at
`openspec/changes/<change-id>/proposal.md`, optional design at `design.md`,
task lists at `tasks.md`, spec deltas at `specs/<domain>/spec.md`, and per-task
dispatch briefs at `dispatch/<task-id>.md`. Chat-only planning blocks (YAML in
conversation) SHALL NOT be the primary artifact for engineering work. Domain
shapers (game-design, marketing, blog, course) are exempt.

#### Scenario: Shaping an engineering request
- **WHEN** an engineering request is shaped for planning
- **THEN** the shaper writes `openspec/changes/<change-id>/proposal.md` and no chat-YAML brief is the primary output

#### Scenario: Domain shaper exemption
- **WHEN** a game-design or marketing request is shaped
- **THEN** the domain shaper keeps its own artifact format

### Requirement: OpenSpec CLI validation gates planning artifacts
The `openspec` CLI SHALL be treated as an external prerequisite like `git` or
`gh` and SHALL NOT be added to package.json dependencies. The orchestrator
SHALL run `openspec validate <change-id> --strict` and MUST NOT dispatch
implementation while validation fails. Format MUST be validated by the CLI,
never by hand.

#### Scenario: CLI missing
- **WHEN** `openspec` is not on PATH
- **THEN** the orchestrator instructs `npm install -g @fission-ai/openspec` and stops until it is available

#### Scenario: Validation failure before dispatch
- **WHEN** `openspec validate <change-id> --strict` exits non-zero after deltas exist
- **THEN** no implementation Task is dispatched until the reported issues are fixed and validation passes

### Requirement: Per-task dispatch briefs live on disk
The planner SHALL write one dispatch brief per task at
`openspec/changes/<change-id>/dispatch/<task-id>.md` containing the
cold-context fields implementation agents require: goal, files_read,
files_write, dependencies, conflicts, acceptance, and verification. Items in
`tasks.md` SHALL reference their brief files.

#### Scenario: Dispatching a task wave
- **WHEN** the orchestrator dispatches an implementation Task
- **THEN** the Task prompt is built from the task's `dispatch/<task-id>.md` brief file

#### Scenario: Task without brief
- **WHEN** a `tasks.md` checklist item has no corresponding dispatch brief file
- **THEN** the task is not dispatchable

### Requirement: Changes are archived after merge
After a change's PR merges, the operator SHALL run
`openspec archive <change-id> -y` so spec deltas merge into `openspec/specs/`
and the change moves to `openspec/changes/archive/`. A change SHALL NOT be
archived before its PR merges.

#### Scenario: Post-merge archive
- **WHEN** the PR implementing a change has merged
- **THEN** `openspec archive <change-id> -y` merges the deltas into the main specs

#### Scenario: Pre-merge archive attempt
- **WHEN** the PR is still open
- **THEN** the change remains active under `openspec/changes/<change-id>/`

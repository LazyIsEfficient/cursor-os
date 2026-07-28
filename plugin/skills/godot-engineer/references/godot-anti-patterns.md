# Godot Anti-Patterns

Catalogue of most common ways Godot projects go wrong. Each anti-pattern real, observable, recoverable. Point of naming: not to shame anyone — every Godot engineer has done some of these — but to recognize in own work and team's so they can be addressed.

Other reference files in this skill all have anti-pattern sections specific to their topic. File collects *cross-cutting* patterns — ones spanning multiple subsystems or describing how project as a whole goes wrong.

## Architectural Anti-Patterns

### The God Scene

**Pattern:** single `.tscn` file contains everything. "Level" scene has player inline, enemies inline, HUD inline, pause menu inline, AI inline, save logic inline. Every change opens this one massive file.

**Why it happens:**

- Starting from tutorial that built small game in one scene.
- Inertia — project grew without anyone factoring it.
- Engineers afraid of refactoring because editor doesn't track scene relationships well.

**Symptoms:**

- `.tscn` file hundreds of lines long.
- Multiple people can't work on it without merge conflicts.
- Things that should be reusable across levels duplicated by hand.
- Adding new feature means adding new top-level nodes to god scene.
- Scene takes seconds to open in editor.

**Fix:** extract reusable parts into own scenes. Level scene becomes thin orchestrator *instancing* other scenes (player, enemies, HUD, pickups). See [scenes-and-instancing.md](scenes-and-instancing.md).

### The God Script

**Pattern:** one `Player.cs` (or whatever) file with 1,500 lines handling movement, animation, sound, UI updates, save state, score tracking, AI behavior, inventory. Every change requires editing this one file.

**Why it happens:**

- Starting with simple player, adding features without restructuring.
- Coming from OO background where putting everything in one class is default.
- Not knowing about node composition.

**Symptoms:**

- Script imports everything.
- Multiple unrelated tests would have to be written for same class.
- Merge conflicts on script constant.
- Refactoring impossible because every method depends on every field.

**Fix:** decompose into focused child nodes. Player has Health node, Movement node, Inventory node, StateMachine node — each with one job. See [nodes-and-architecture.md](nodes-and-architecture.md).

### Tight Coupling via `GetNode` Paths

**Pattern:** scripts reach into other parts of tree with explicit paths.

```csharp
GetNode<Label>("../../../UI/HUD/Score").Text = $"Score: {_score}";
```

**Why it's wrong:**

- Renames break it.
- Reorganization breaks it.
- Script now coupled to specific tree structure.
- Refactoring dangerous.
- Reusing scene in different parent impossible.

**Fix:** use signals to send events outward; let listener subscribe. Or use `[Export]` references for direct assignments via inspector. Or use scene-unique names (`%`) for in-scene lookups. See [signals-and-events.md](signals-and-events.md).

### Autoload Abuse

**Pattern:** every shared concern goes through autoloads. Game state, audio, save manager, scene switcher, level data, settings, achievements, inventory, dialogue, UI manager — all autoloads. Autoloads import each other; accumulate methods over time; soon every node depends on autoloads for everything.

**Why it happens:**

- Autoloads easy to access from anywhere.
- Feel like global namespace, convenient.
- Cost of fragmentation not visible until project is large.

**Symptoms:**

- Autoload list in project settings has 10+ entries.
- Most scripts start with `var gameState = GetNode<GameState>("/root/GameState");`.
- Removing or changing autoload breaks everything.
- Tests impossible because every test requires entire autoload graph.
- New team members can't understand project without learning autoload conventions.

**Fix:** use autoloads sparingly, for *truly global* concerns (game-wide state, scene transitions, audio bus management). Local communication should use signals and direct references. Autoload grows too large → decompose; not every "manager" needs to be singleton.

### Autoload-as-Service-Locator

**Pattern:** autoload exposes registry of "services" that nodes look up by name. Looks decoupled; isn't.

**Why it's wrong:**

- Still singleton with slightly fancier API.
- Runtime lookup hides dependency.
- Tests can't substitute services without monkey-patching.
- Refactoring harder, not easier, because dependencies invisible.

**Fix:** explicit dependencies via `[Export]` references or constructor parameters. Pass services in, don't fetch them.

## Process Anti-Patterns

### Movement in `_Process`

**Pattern:** physics body movement code in `_Process` instead of `_PhysicsProcess`. Often copied from tutorial that didn't understand difference.

**Symptoms:**

- Character moves jittery, especially at non-default framerates.
- Collisions sometimes don't work as expected.
- Game runs differently on faster vs slower machines.

**Fix:** put physics body movement in `_PhysicsProcess`. Always. See [physics-and-collision.md](physics-and-collision.md).

### `_PhysicsProcess` for Visuals

**Opposite pattern:** putting visual smoothing or camera follow in `_PhysicsProcess`. Visual code locked to physics tick rate (often 60Hz) doesn't take advantage of higher frame rates, looks stuttery on 144Hz monitors.

**Fix:** visual smoothing goes in `_Process`. Physics goes in `_PhysicsProcess`.

### Polling in `_Process` Instead of Signals

**Pattern:** updating UI from `_Process` by reading game state every frame.

```csharp
public override void _Process(double delta)
{
    var label = GetNode<Label>("HealthLabel");
    label.Text = $"HP: {Player.Health}";
}
```

**Why it's wrong:**

- UI updates 60 times per second even when nothing changed.
- String allocations every frame trigger GC.
- Script coupled to player's state.

**Fix:** use signal. Player emits `HealthChanged`; UI listens; label updates only when value changes.

### Doing Everything in `_Ready`

**Pattern:** every node's `_Ready` does heavy work — loading resources, instantiating children, building meshes, computing pathfinding grids. Level takes seconds to load.

**Fix:**

- **Defer heavy work.** Use `CallDeferred` or background loading.
- **Show loading screen.** Work has to happen → give player visual feedback.
- **Lazy-initialize** when possible. Don't compute dialog tree until dialog opens.
- **Profile load.** Find which `_Ready` is slow.

### `GetNode` in Tight Loops

**Pattern:** calling `GetNode<T>("path")` inside `_Process` or `_PhysicsProcess` every frame.

**Why it's wrong:** string lookups against scene tree not free. Doing every frame for every node compounds.

**Fix:** cache references in `_Ready`. Or use scene-unique names (`%`) — faster lookup path.

## Code Anti-Patterns

### `new ClassName()` Instead of Instantiating Scenes

**Pattern:** creating nodes with C# constructor instead of `PackedScene.Instantiate<T>()`.

```csharp
// Wrong: misses children, signals, exports
var enemy = new Enemy();
AddChild(enemy);

// Right: creates the full scene with all its parts
var enemy = EnemyScene.Instantiate<Enemy>();
AddChild(enemy);
```

**Why it's wrong:** `new` constructor only creates C# class instance. Scene's children, exports, editor configuration missed.

**Fix:** always instantiate scenes from `PackedScene` references.

### `Free()` Instead of `QueueFree()`

**Pattern:** calling `node.Free()` to immediately destroy node.

**Why it's wrong:** any code still iterating over node's children or holding references → "freed object" error or crash.

**Fix:** `QueueFree()` schedules free for end of frame, after iteration safe. Use 99% of time.

### Mutating `Vector2`/`Vector3` Properties

**Pattern:** trying to mutate struct property in place.

```csharp
// Wrong: doesn't compile, but the spirit is wrong
GetNode<Sprite2D>("Sprite").Position.X += 10;

// What people actually write:
var sprite = GetNode<Sprite2D>("Sprite");
sprite.Position.X = 10; // This compiles in C# but doesn't update the sprite
```

**Why it's wrong:** Godot's vector types are *value types* (structs). Reading `Position` returns copy; modifying copy doesn't propagate.

**Fix:**

```csharp
// Read, modify, write
var pos = sprite.Position;
pos.X += 10;
sprite.Position = pos;

// Or in one line:
sprite.Position += new Vector2(10, 0);
```

### Forgetting `partial`

**Pattern:** writing Godot script class without `partial`.

```csharp
public class Player : CharacterBody2D { ... }  // Wrong
public partial class Player : CharacterBody2D { ... }  // Right
```

**Why it's wrong:** Godot generates source code for class (signal name constants, etc.). Without `partial`, generated code can't merge with yours.

**Fix:** every script class is `partial`. Period.

### String-Based Signal Connections

**Pattern:** using old string-based API for signal connections.

```csharp
// Old/wrong
health.Connect("Damaged", new Callable(this, nameof(OnDamaged)));

// New/right
health.Damaged += OnDamaged;
```

**Why it's wrong:** string-based version isn't compile-checked, doesn't update on rename, less readable.

**Fix:** use typed `+=` syntax for all new code.

### Holding References to Freed Nodes

**Pattern:** keeping C# reference to Godot node that was freed elsewhere. Calling methods on reference produces "object was freed" errors.

**Fix:** check `IsInstanceValid(node)` before using held reference. Or use weak references. Or don't hold references that can outlive node.

### Constructor Logic for Nodes

**Pattern:** doing setup in C# constructor.

```csharp
public Player()
{
    _sprite = GetNode<Sprite2D>("Sprite2D");  // Crashes; not in tree yet
}
```

**Why it's wrong:** constructor runs *before* node added to tree. `GetNode` and other tree-dependent operations don't work.

**Fix:** put setup in `_Ready`, runs after node in tree.

### Synchronous `GD.Load` in Hot Paths

**Pattern:** loading resources by string path in `_Process` or code running frequently.

```csharp
public override void _Process(double delta)
{
    var bullet = GD.Load<PackedScene>("res://bullet.tscn"); // Loads every frame
    // ...
}
```

**Why it's wrong:** `GD.Load` is cached but still has overhead, especially first time.

**Fix:** use `[Export] PackedScene`, assign in inspector. Cache in `_Ready` if loading programmatically.

## Resource Anti-Patterns

### Mutating Shared Resources

**Pattern:** modifying `Resource` at runtime, expecting change to be local — but resource shared between instances, change affects everyone.

```csharp
var weapon = GetNode<Weapon>("Weapon");
weapon.Data.Damage = 100; // Mutates the shared WeaponData resource!
```

**Why it's wrong:** resources reference-counted and shared by default. Two weapons using same `WeaponData` *literally share* it.

**Fix:** need per-instance state → put on *node*, not resource. Or use `Resource.Duplicate()` to create copy.

### Not Using Resources for Data

**Opposite pattern:** hardcoding game data in scripts instead of using resources.

```csharp
public partial class WeaponDatabase : Node
{
    public static readonly Dictionary<string, int> WeaponDamages = new()
    {
        { "sword", 10 },
        { "axe", 15 },
        { "bow", 8 },
        // ... grows forever
    };
}
```

**Why it's wrong:** every change requires code edit and recompile. Designers can't tweak values. Data and code mixed.

**Fix:** use custom `Resource` types with `[Export]` fields. Each weapon is `.tres` file. Designers add and tweak weapons in editor without touching code.

### `.tres` Files Without `[GlobalClass]`

**Pattern:** custom `Resource` types not decorated with `[GlobalClass]`. Editor doesn't know how to create them.

**Fix:** add `[GlobalClass]` to make custom resource types visible in editor's "Create New Resource" dialog.

## Workflow Anti-Patterns

### Editor as Optional

**Pattern:** doing everything in code; treating editor as debugger and runner only.

**Why it's wrong:** Godot's editor is good. Many things (signal connections, instance overrides, animation editing, theme creation) faster in editor. Trying to do them in code slower and harder.

**Fix:** use editor for what it's good at. Use code for what code is good at. Don't be religious about either.

### Hand-Editing `.tscn` Files

**Pattern:** opening `.tscn` or `.tres` files in text editor, editing directly.

**Why it's wrong:** files have specific format Godot expects. Hand edits often produce subtly broken files that work in some cases, crash in others.

**Fix:** use editor. Only legitimate reason to touch `.tscn` directly is bulk find-and-replace or merge conflict resolution — and even then, open file in Godot afterward to verify.

### Mixing GDScript and C# in Same Codebase

**Pattern:** half project in C#, half in GDScript, two interop constantly.

**Why it's wrong:** every interop call has overhead, isn't type-checked, awkward. Refactoring harder. Onboarding harder.

**Fix:** pick one for main codebase. Mix only with specific reason — GDScript editor plugin you're using, quick `@tool` script, etc.

### Not Source-Controlling `.import` Files

**Pattern:** committing `.tscn`, `.cs`, assets but not `.import` files.

**Why it's wrong:** `.import` files contain import settings for each asset. Without them, every developer opening project re-imports with default settings, potentially breaking things.

**Fix:** commit `.import` files. They're source.

### Committing the `.godot/` Folder

**Opposite pattern:** committing auto-generated `.godot/` folder, containing caches and generated files.

**Fix:** add `.godot/` to `.gitignore`. Per-machine cache.

### No Branching for Risky Changes

**Pattern:** working directly on `main`. Risky scene refactor breaks project; rolling back hard because of how Godot handles `.tscn` files.

**Fix:** branch for risky work. Test branch. Merge when stable. Standard software practice; especially important in Godot because `.tscn` files awkward to merge.

### No Backups of Save Files During Development

**Pattern:** dev game writes to `user://`, overwrites valuable test saves.

**Fix:** during development, write to versioned subfolder. Or back up user folder regularly.

## Performance Anti-Patterns

### Optimizing Without Profiling

**Pattern:** rewriting code to be "faster" based on intuition. Often makes things slower or more complex without benefit.

**Fix:** profile first. Optimize bottleneck. Re-measure. See [performance-and-profiling.md](performance-and-profiling.md).

### Allocating in Hot Paths

**Pattern:** creating new objects, lists, strings, collections every frame.

**Why it's wrong:** GC pressure produces visible hitches.

**Fix:** reuse buffers. Cache strings. Avoid `new` in `_Process` for reference types.

### Real-Time Lights for Static Scenes

**Pattern:** lighting outdoor 3D scene with 20 real-time directional and point lights.

**Fix:** bake static lighting. Real-time lights only for dynamic things.

### Custom Shaders That Reinvent Standard Material

**Pattern:** shader doing what `StandardMaterial3D` already does, just because.

**Fix:** use `StandardMaterial3D` unless genuinely needing something it doesn't provide.

## Multiplayer Anti-Patterns

(Covered in detail in [multiplayer-and-websockets.md](multiplayer-and-websockets.md). Highlights:)

- **Trusting client.** Validate everything server-side.
- **Authority on client** in competitive games. Cheating.
- **No reconnection logic.** Network blip = game over.
- **Sending state every frame.** Bandwidth nightmare; use rate limiting and interpolation.
- **No TLS in production.** Plaintext WebSockets.

## UI Anti-Patterns

(Covered in detail in [ui-and-controls.md](ui-and-controls.md). Highlights:)

- **Manually positioning everything.** Containers exist.
- **Hardcoded screen sizes.** Use anchors and stretch settings.
- **Reinventing theme system.** Use Godot's.
- **UI in world space, not `CanvasLayer`.** UI scrolls with camera.

## Save Anti-Patterns

(Covered in detail in [save-load-and-persistence.md](save-load-and-persistence.md). Highlights:)

- **No version field.** Updates break existing saves.
- **No migration code.** Saves crash on load after upgrade.
- **`res://` instead of `user://`.** Doesn't work; read-only.
- **No autosave.** Players lose progress on crash.
- **Direct write to real file.** Mid-write crash corrupts save.

## General Anti-Patterns

### Tutorials as Architecture

**Pattern:** structuring project the way tutorial showed, even when doesn't fit project's needs. Tutorials designed to be simple and self-contained, not to scale.

**Fix:** learn from tutorials, then *think about your specific project's needs*.

### "I'll Refactor Later"

**Pattern:** accumulating technical debt while telling yourself you'll fix after next milestone. Refactor never comes.

**Fix:** allocate time for refactoring as you go. Cost compounds; later always more expensive than now.

### Testing Only the Happy Path

**Pattern:** game works when player does what you expect. Crashes or does weird things when they do anything else.

**Fix:** test unhappy paths. What happens when player tries to interact with two things at once? Pause mid-attack? Alt-tab during cutscene?

### Not Testing on the Target Platform

**Pattern:** developing on high-end PC, exporting to mobile/web/console at end.

**Fix:** test on target platforms continuously. Problems found late more expensive than found early.

### No Crash Reporting in Production

**Pattern:** ship game; players have crashes; you have no idea.

**Fix:** integrate crash reporter. Sentry, Bugsnag, or simple in-game error logger submitting via HTTP.

### Working on `main` Without Branches

**Pattern:** all changes go directly to `main`. Risky refactors break build for everyone.

**Fix:** branches for non-trivial work. Standard practice.

### Treating Godot Like Unity (or Vice Versa)

**Pattern:** importing Unity (or Unreal, or GameMaker) idioms into Godot. Result is Godot project fighting engine.

**Specific manifestations:**

- "MonoBehaviour"-style components attached to one node, instead of node composition.
- "Prefabs" mental model for scenes (close but not same).
- Singleton "managers" everywhere because that was Unity pattern.
- Building custom UI system because "Unity UI is better."

**Fix:** learn Godot's idioms. Different from Unity/Unreal/GameMaker, often *better* for things Godot built for.

## Related

Every other reference file in this skill has own anti-patterns section. This one is cross-cutting overview.

- [godot-fundamentals.md](godot-fundamentals.md) — engine model
- [scenes-and-instancing.md](scenes-and-instancing.md) — god scenes, scene composition
- [nodes-and-architecture.md](nodes-and-architecture.md) — god scripts, composition
- [signals-and-events.md](signals-and-events.md) — signal patterns
- [physics-and-collision.md](physics-and-collision.md) — `_PhysicsProcess` mistakes
- [performance-and-profiling.md](performance-and-profiling.md) — performance anti-patterns
- [save-load-and-persistence.md](save-load-and-persistence.md) — save anti-patterns
- [multiplayer-and-websockets.md](multiplayer-and-websockets.md) — networking anti-patterns
- software-design — broader software design principles

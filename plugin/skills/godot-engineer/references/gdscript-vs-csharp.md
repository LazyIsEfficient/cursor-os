# GDScript vs C#

Skill defaults to **C#** as primary language for Godot 4 work, but GDScript still relevant in places. File explains trade-offs, when to reach for which, how to interoperate when you have to.

Honest summary: **for non-trivial project, C# is better default in Godot 4.** Faster, better tooling, integrates with broader .NET ecosystem, handles complex codebases better. GDScript still useful for tools, editor scripts, plugin development, quick prototypes — but not primary language for serious game work.

This is *change* from Godot 3, where GDScript was de facto standard, C# second-class citizen. Godot 4 with .NET 8 made C# real option; for most production game work, it's right one.

## The Two Languages At a Glance

| Aspect | GDScript | C# |
|---|---|---|
| **Type system** | Dynamic by default; optional static typing | Static, strict |
| **Performance** | Slower (interpreted); fine for most gameplay | Faster (JIT-compiled); better for hot paths |
| **Tooling** | Built into Godot editor; OK | VS Code or Rider; excellent |
| **Hot reload** | Yes, fast | Limited; usually requires restart |
| **Async/await** | No (uses signals/coroutines instead) | Yes |
| **Generics** | Limited | Full |
| **LINQ** | No | Yes |
| **Ecosystem** | Godot-only; small | All of NuGet; massive |
| **Build step** | None | Yes (.NET compile) |
| **Editor scripts / plugins** | Native support | Possible but harder |
| **Engine integration** | Tightest possible | Tight, with some overhead |
| **Iteration speed** | Very fast | Slower (compile step) |
| **Learning curve** | Low (Python-like) | Higher if new to C# |
| **Hiring** | Niche | Wide pool |

## When C# Wins

- **Non-trivial gameplay code.** Anything beyond 10-scene prototype benefits from static typing and better refactoring.
- **Performance-critical paths.** Procedural generation, large-scale simulation, real-time pathfinding, anything looping over thousands of objects per frame.
- **Code shared with non-game systems.** Backend, tool, server — if also .NET, share code.
- **Larger teams.** Multiple engineers benefit from C#'s static checks, refactoring tools, consistent style.
- **Long-lived projects.** Years of iteration easier in typed language.
- **NuGet packages.** Need HTTP client? JSON parser? Compression library? NuGet has it; GDScript would force you to write it.
- **You already know C# / .NET.** No reason to learn GDScript when C# works.

## When GDScript Wins

- **Quick prototypes.** Weekend game jam game; iteration speed matters more than scale.
- **Editor tools and plugins.** GDScript has tighter editor integration; many plugins written in GDScript.
- **Simple shaders + light scripts.** `Sprite2D` needing 5-line wiggle script.
- **Tutorials and learning.** Most Godot tutorials in GDScript; following along easier.
- **Quick scripts attached to specific nodes.** Button doing one thing; particle destroying itself after a second.
- **`@tool` scripts** (scripts running in editor for procedural authoring) — easier in GDScript.

## Mixing Both

You *can* use both GDScript and C# in same project. Interoperate via Godot's `Variant` type — universal value type engine uses internally.

When to mix:

- C#-primary project with few GDScript editor tools or plugins.
- GDScript-primary project dropping to C# for one performance-critical system.
- Imported asset / addon that's GDScript-based — just leave it.

When *not* to mix:

- Throughout gameplay code. Pick one for main codebase or fight constant interop issues.
- For shared core data structures. Cross-language types get awkward.

The interop:

```csharp
// C# calling a GDScript node
var gdNode = GetNode("MyGDScriptNode");
gdNode.Call("DoSomething", 42);
var result = gdNode.Get("someProperty");
```

```gdscript
# GDScript calling a C# node
var cs_node = get_node("MyCSharpNode")
cs_node.do_something(42)
var result = cs_node.some_property
```

Notice conventions: GDScript uses `snake_case`, C# uses `PascalCase`. **Godot translates between them automatically** in interop calls. C# method `DoSomething` callable from GDScript as `do_something`.

Convenient but foot-gun: typos in string-based call don't error at compile time, only runtime when method not found.

## C# Code Conventions in Godot

C# in Godot follows *Godot* conventions, not standard .NET conventions, where engine bridges them:

| Standard C# | Godot C# |
|---|---|
| `void OnReady()` | `public override void _Ready()` (note the underscore) |
| `void Update(float dt)` | `public override void _Process(double delta)` |
| `Vector2 position { get; set; }` | `Position` (PascalCase, no underscore) |
| `event Action OnDamaged` | `[Signal] delegate void DamagedEventHandler()` |

Reason: Godot generates source code for your scripts (the `partial` part) and uses these conventions internally. Following them keeps interop clean.

Typical C# Godot script:

```csharp
using Godot;

public partial class Enemy : CharacterBody2D
{
    [Export] public float Speed { get; set; } = 100.0f;
    [Export] public int MaxHealth { get; set; } = 50;
    [Export] public PackedScene DeathParticles { get; set; }

    [Signal] public delegate void HealthChangedEventHandler(int newHealth);
    [Signal] public delegate void DiedEventHandler();

    private int _currentHealth;
    private AnimationPlayer _anim;

    public override void _Ready()
    {
        _currentHealth = MaxHealth;
        _anim = GetNode<AnimationPlayer>("AnimationPlayer");
    }

    public override void _PhysicsProcess(double delta)
    {
        // Movement and physics here.
    }

    public void TakeDamage(int amount)
    {
        _currentHealth = Mathf.Max(0, _currentHealth - amount);
        EmitSignal(SignalName.HealthChanged, _currentHealth);

        if (_currentHealth == 0)
        {
            EmitSignal(SignalName.Died);
            _anim.Play("die");
            // Spawn particles, queue free, etc.
        }
    }
}
```

Patterns to notice:

- **`partial`** required because Godot generates companion class for script.
- **`[Export]`** with `{ get; set; }` works for properties; bare fields also work but properties more idiomatic in C#.
- **`PackedScene`** is type for instanced scene reference (e.g. for spawning).
- **`SignalName.HealthChanged`** is generated constant for signal name; preferable to raw string `"HealthChanged"` because typos error at compile time.
- **`Mathf`** is Godot's math utility class (not `System.Math` — slightly different functions).

## Subscribing to Signals in C#

C# 4 idiom uses `+=` and `-=` like normal events:

```csharp
public override void _Ready()
{
    var enemy = GetNode<Enemy>("Enemy");
    enemy.HealthChanged += OnEnemyHealthChanged;
    enemy.Died += OnEnemyDied;
}

private void OnEnemyHealthChanged(int newHealth)
{
    // Update HUD
}

private void OnEnemyDied()
{
    // Spawn loot, count score, etc.
}
```

`EventHandler` suffix on delegate name required by Godot's source generator. `+=` connection type-checked by compiler.

Older string-based approach (`Connect("HealthChanged", new Callable(this, nameof(OnEnemyHealthChanged)))`) still works but fragile; avoid in new code.

Always disconnect when connection no longer needed:

```csharp
public override void _ExitTree()
{
    if (IsInstanceValid(_enemy))
    {
        _enemy.HealthChanged -= OnEnemyHealthChanged;
        _enemy.Died -= OnEnemyDied;
    }
}
```

*Emitter* freed first → connection auto-cleans. *Listener* freed first without disconnecting → "memory leak" in sense that Godot keeps connection alive. Defensive habit: disconnect in `_ExitTree`.

## Async/Await with Signals

C# in Godot supports `await`-ing signals:

```csharp
public async void StartCutscene()
{
    GD.Print("Cutscene started");
    var anim = GetNode<AnimationPlayer>("AnimationPlayer");
    anim.Play("cutscene_intro");
    await ToSignal(anim, AnimationPlayer.SignalName.AnimationFinished);
    GD.Print("Intro done; starting next part");
    anim.Play("cutscene_part_2");
    await ToSignal(anim, AnimationPlayer.SignalName.AnimationFinished);
    GD.Print("Cutscene complete");
}
```

Much cleaner than chaining signal callbacks for sequenced events. Use for cutscenes, multi-step animations, dialogue systems, level transitions, anything "do this, then wait, then do next thing."

Caveat: careful with `async void` (example above). Necessary for event handlers but can swallow exceptions. Non-event-handler cases: prefer `async Task`, `await` it from caller.

## Performance Notes

- **C# faster than GDScript** for tight loops, math, procedural code. Often 2-10x.
- **First-call overhead** of C# methods (JIT compile) can show up as small startup hitch.
- **GC pauses real but small**. Godot 4 .NET integration uses CoreCLR; GC well-behaved for typical game workloads but still exists. Pre-allocate hot collections, use `Span<T>` where it helps, don't allocate in `_Process` if avoidable.
- **`Variant` boxing** crosses C#-Godot boundary, has some overhead. Avoid passing C# `int`/`float`/`Vector2` through `Variant` in tight loops; use typed APIs where possible.
- **`GetNode<T>(...)`** has string lookup cost. Cache references in `_Ready` instead of calling every frame.
- **Really hot paths**: drop into `unsafe` C# or even GDExtension (C++ binding mechanism). Most projects never need this.

Deeper performance discussion: [performance-and-profiling.md](performance-and-profiling.md).

## Project Setup for C#

C# Godot project uses **.NET version of Godot** (separate download from standard version, also available as "Mono" build in older releases).

Start C# project:

1. Use **.NET / Mono** version of Godot editor.
2. Create new project.
3. **Project → Tools → C# → Create C# Solution**.
4. Set .NET SDK in project settings.

`.csproj` auto-generated and minimal:

```xml
<Project Sdk="Godot.NET.Sdk/4.2.0">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <EnableDynamicLoading>true</EnableDynamicLoading>
  </PropertyGroup>
</Project>
```

Add NuGet packages like any other .NET project:

```bash
dotnet add package Newtonsoft.Json
dotnet add package System.IO.Hashing
```

NuGet works as expected in Godot 4 — frequent pain point in earlier versions.

## C# Editor Workflow

Most C# Godot devs use one of:

- **VS Code with C# Dev Kit** — lightweight, free, works well.
- **JetBrains Rider** — paid (free for non-commercial), most polished experience for C# work.
- **Visual Studio** (Windows) — works but heavier than needed.

Workflow:

1. Edit scene structure in Godot editor.
2. Edit C# scripts in IDE of choice.
3. Godot editor watches for `.cs` changes, rebuilds on save.
4. Run project from Godot editor (F5).

Hot reload *limited* in Godot 4 with C# — some things changeable at runtime, but most code changes require restarting game. Main downside vs. GDScript, which hot-reloads almost everything instantly.

## Common Gotchas

### `partial` is required

Forgetting `partial` produces confusing errors. Every script class needs it.

```csharp
// Wrong
public class Player : CharacterBody2D { ... }

// Right
public partial class Player : CharacterBody2D { ... }
```

### Constructors run before `_Ready`

C# constructor runs when object created, *before* added to tree. Can't call `GetNode<T>(...)` in constructor — node isn't in tree yet.

```csharp
// Wrong
public Player()
{
    _sprite = GetNode<Sprite2D>("Sprite2D"); // Crashes
}

// Right
public override void _Ready()
{
    _sprite = GetNode<Sprite2D>("Sprite2D");
}
```

### `[Export]` on private fields needs an underscore prefix

Godot convention: private fields start with `_`, but `[Export]` works on them anyway:

```csharp
[Export] private int _maxHealth = 100;
```

Most idiomatic for C# fields. For properties, use PascalCase:

```csharp
[Export] public int MaxHealth { get; set; } = 100;
```

### Don't `new` a node directly

Nodes created via `new ClassName()` only if immediately added to tree. Preferred way to create scenes:

```csharp
[Export] public PackedScene EnemyScene { get; set; }

private void SpawnEnemy()
{
    var enemy = EnemyScene.Instantiate<Enemy>();
    AddChild(enemy);
    enemy.GlobalPosition = new Vector2(100, 100);
}
```

`PackedScene.Instantiate<T>()` gives entire tree (root + all children, with all properties), not just empty class instance.

### `QueueFree` vs `Free`

- `QueueFree()` schedules node to be freed at end of current frame. Almost always what you want.
- `Free()` immediately frees node. Dangerous if any code still iterating over children or holding references.

```csharp
// Right (in 99% of cases)
deadEnemy.QueueFree();
```

### `IsInstanceValid` for orphan checks

Holding reference to node that might have been freed? Check before using:

```csharp
if (IsInstanceValid(_target))
{
    _target.TakeDamage(10);
}
```

Otherwise hit "object was freed" errors when held reference points to freed Godot object.

### `Vector2` is a struct

Godot's `Vector2`, `Vector3`, `Color`, `Rect2`, etc. are *value types*. Mutating property doesn't propagate:

```csharp
// Wrong
GetNode<Sprite2D>("Sprite2D").GlobalPosition.X += 10; // Doesn't compile, but the equivalent doesn't work either

// Right
var sprite = GetNode<Sprite2D>("Sprite2D");
var pos = sprite.GlobalPosition;
pos.X += 10;
sprite.GlobalPosition = pos;
```

Or, more concisely:

```csharp
sprite.GlobalPosition += new Vector2(10, 0);
```

## Anti-Patterns

- **Mixing GDScript and C# in same gameplay code.** Pick one for main codebase; mixing for non-trivial logic produces interop pain.
- **Using string-based signal connections** (`Connect("name", ...)`) when typed `+=` available.
- **Creating nodes with `new ClassName()` instead of instantiating `PackedScene`.** Misses children and exports.
- **Doing setup in C# constructors instead of `_Ready`.** Crashes from `GetNode` calls.
- **Forgetting `partial`.** Constant compilation errors.
- **Calling `GetNode<T>` every frame.** Cache references in `_Ready`.
- **`Free()` instead of `QueueFree()`.** Mid-frame crashes.
- **Mutating `Vector2` properties as if references.** Compiles but doesn't do what you think.
- **Ignoring `IsInstanceValid` for held references.** "Object was freed" errors at random times.
- **Treating C# Godot like normal C#.** Following standard .NET naming conventions where Godot uses different ones; missing `_Process` underscore; etc.
- **Avoiding GDScript entirely** when editor tool or plugin would clearly be faster. Use right tool.
- **Using GDScript for performance-critical code.** Drop to C# (or C++/GDExtension) for hot paths.
- **Picking one language because of tutorial you're following.** Pick based on project's needs.

## Related

- [godot-fundamentals.md](godot-fundamentals.md) — engine model both languages target
- [signals-and-events.md](signals-and-events.md) — signal patterns in C#
- [performance-and-profiling.md](performance-and-profiling.md) — when C# performance matters
- [godot-anti-patterns.md](godot-anti-patterns.md) — broader patterns to avoid

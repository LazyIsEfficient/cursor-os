# Godot Fundamentals

Mental model file. Before other reference files make sense, internalize how Godot 4 thinks — core abstractions, how main loop runs, what "scene" actually is, how editor relates to code. Skip this and rest of skill harder to apply.

Thing most new Godot engineers (especially from Unity or web development) get wrong: **they treat Godot's nodes and scenes as classes and objects in their language of choice**. Not quite that. Nodes are runtime entities in tree; scenes are *templates* for sub-trees that can be instanced. Internalize this, rest of Godot makes sense.

## The Engine Model in Five Sentences

1. A **Node** is basic building block of everything in Godot — every visible thing, every behavior, every UI element is a node.
2. A **Scene** is tree of nodes saved to disk as `.tscn` file, designed to be *instanced* (used multiple times, anywhere in project).
3. Running game is **one big tree of nodes**, built by adding scenes to other scenes; this tree is SceneTree.
4. **Main loop** ticks tree every frame, calling `_Process` (variable timestep) and `_PhysicsProcess` (fixed timestep) on every node defining them.
5. Nodes communicate by **signals** (events), direct method calls, and via **autoloads** (singletons available everywhere).

Understand those five things, you understand engine. Rest is detail.

## Nodes

Node is smallest unit of *anything* in Godot. Hundreds of built-in node types, all inheriting from `Node`. Most important ones:

| Node | Purpose |
|---|---|
| `Node` | Generic, no transform; for non-spatial logic |
| `Node2D` | 2D spatial node with position/rotation/scale |
| `Node3D` | 3D spatial node (was `Spatial` in Godot 3) |
| `Control` | UI element with anchor/margin layout |
| `CanvasLayer` | Holds 2D things (UI, HUD) above the world |
| `Sprite2D` / `Sprite3D` | Display images |
| `MeshInstance3D` | Display 3D meshes |
| `CharacterBody2D` / `CharacterBody3D` | Player/enemy physics body that moves with code |
| `RigidBody2D` / `RigidBody3D` | Physics-driven body |
| `StaticBody2D` / `StaticBody3D` | Non-moving collision |
| `Area2D` / `Area3D` | Detect overlap without collision |
| `CollisionShape2D` / `CollisionShape3D` | Defines collision geometry (child of a body) |
| `AnimationPlayer` | Plays keyframe animations on properties |
| `AnimationTree` | State-machine-driven animation playback |
| `AudioStreamPlayer` / `AudioStreamPlayer2D` / `AudioStreamPlayer3D` | Audio playback |
| `Timer` | Schedules callbacks |
| `Camera2D` / `Camera3D` | View into the world |
| `Label`, `Button`, `LineEdit`, `OptionButton`, etc. | UI controls |
| `Container` (and subclasses: `VBoxContainer`, `HBoxContainer`, `GridContainer`, etc.) | UI layout |

A node has:

- A **type** (its class)
- A **name** (string, unique among siblings)
- A **parent** (or none, if root)
- **Children** (zero or more)
- A **script** (optional — your code attached to this specific node)
- **Properties** (exported in inspector)
- **Signals** (events it emits)
- A **process mode** (always, paused, etc.)

In C#, node is class inheriting from `Node` (or subclass). Attaching script to node in editor: script's class *becomes* that node at runtime.

```csharp
using Godot;

public partial class Player : CharacterBody2D
{
    [Export] public float Speed = 200.0f;
    [Export] public float JumpVelocity = -400.0f;

    public override void _Ready()
    {
        // Called when the node is added to the tree.
    }

    public override void _PhysicsProcess(double delta)
    {
        // Called every physics frame.
    }
}
```

Things to note:

- `partial` required because Godot generates source code for class.
- `[Export]` makes field visible in inspector, tweakable per-instance.
- `_Ready` and `_PhysicsProcess` are *override* methods Godot calls automatically.
- Class name should match file name (Godot convention).

## Scenes

Scene is tree of nodes, saved as `.tscn` file. Simplest scene has one node (root); complex scene might have hundreds. Key insight: **scene is template that can be instanced multiple times**.

Typical player scene:

```
Player (CharacterBody2D)
├── Sprite2D
├── CollisionShape2D
├── AnimationPlayer
├── Camera2D (only on the local player)
└── HitDetection (Area2D)
    └── CollisionShape2D
```

Root node is `CharacterBody2D` named "Player". Child nodes for visuals (sprite, animation), physics (collision shape), camera (camera follows player), hit-detection area. All saved as one `.tscn` file. Drag this scene into level scene → you've added player.

Scenes can contain other scenes. Called **instancing**. Level scene might have:

```
Level (Node2D)
├── TileMap
├── Player (instance of player.tscn)
├── Enemies (Node2D)
│   ├── Goblin (instance of goblin.tscn)
│   ├── Goblin (instance of goblin.tscn, same scene reused)
│   └── Bat (instance of bat.tscn)
├── Pickups (Node2D)
└── HUD (CanvasLayer; instance of hud.tscn)
```

Each instance starts identical but can have position, properties, overrides set per-instance in parent scene. Change `goblin.tscn` → all instances update.

Most powerful feature in Godot. Also where most engineers go wrong — by *not* using it. Signal to split something into own scene: appears more than once, or complex enough to reuse later, or owned by different person/team.

## The SceneTree and the Main Loop

Game runs: Godot loads *main scene* (set in project settings), starts main loop. Main loop:

1. Polls input.
2. Calls `_Process(delta)` on every node defining it. Variable timestep — `delta` is time since last frame, in seconds.
3. Steps physics. Calls `_PhysicsProcess(delta)` on every node defining it. **Fixed timestep** — defaults to 60Hz, so `delta` always `1.0/60.0` (regardless of how fast game runs).
4. Draws frame.
5. Repeats.

Variable-vs-fixed distinction critical:

- `_Process` runs as fast as framerate allows. 120 FPS: runs twice per "physics frame." 30 FPS: runs less often than physics. Use for visual interpolation, UI updates, polling, anything tied to "what user sees this instant."
- `_PhysicsProcess` runs at consistent rate (60Hz default). Physics happens here. Movement interacting with collisions happens here. Determinism easier here because timestep predictable.

Most common Godot bug from misusing these: putting movement in `_Process`. Character moves jittery because physics step doesn't match rendering step. **Movement of physics bodies goes in `_PhysicsProcess`. Always.**

## Lifecycle Methods

Every node can override these:

| Method | When called |
|---|---|
| `_Ready()` | Once, when the node enters the tree and all its children are also ready. |
| `_EnterTree()` | When the node enters the tree (before children). |
| `_ExitTree()` | When the node leaves the tree. |
| `_Process(double delta)` | Every frame (variable timestep). |
| `_PhysicsProcess(double delta)` | Every physics frame (fixed timestep). |
| `_Input(InputEvent ev)` | When an unhandled input event occurs. |
| `_UnhandledInput(InputEvent ev)` | When an input event hasn't been handled by UI. |
| `_Notification(int what)` | For low-level system events. |

`_Ready` is most-used. Equivalent of constructor for node, except runs *after* node is in tree, so you can call `GetNode<T>(...)` on children. Putting initialization in C# constructors is wrong — node isn't in tree yet.

```csharp
public partial class Player : CharacterBody2D
{
    private AnimationPlayer _animPlayer;
    private Sprite2D _sprite;

    public override void _Ready()
    {
        _animPlayer = GetNode<AnimationPlayer>("AnimationPlayer");
        _sprite = GetNode<Sprite2D>("Sprite2D");
    }
}
```

Pattern of grabbing references to children in `_Ready` is *common but brittle*. Better patterns covered in [nodes-and-architecture.md](nodes-and-architecture.md) — using `[Export]` to assign references in inspector, or groups/signals to avoid path-based lookup entirely.

## Signals

Signals are Godot's event system. Node *emits* signal when something happens; other nodes *connect* to react.

In C#, signals declared with `[Signal]` attribute on delegate type:

```csharp
public partial class Health : Node
{
    [Signal] public delegate void DamagedEventHandler(int amount, int newHealth);
    [Signal] public delegate void DiedEventHandler();

    [Export] public int MaxHealth = 100;
    private int _currentHealth;

    public override void _Ready()
    {
        _currentHealth = MaxHealth;
    }

    public void TakeDamage(int amount)
    {
        _currentHealth = Math.Max(0, _currentHealth - amount);
        EmitSignal(SignalName.Damaged, amount, _currentHealth);
        if (_currentHealth == 0)
        {
            EmitSignal(SignalName.Died);
        }
    }
}
```

Somewhere else (often parent scene's script) connects to signal:

```csharp
public override void _Ready()
{
    var health = GetNode<Health>("Health");
    health.Damaged += OnPlayerDamaged;
    health.Died += OnPlayerDied;
}

private void OnPlayerDamaged(int amount, int newHealth)
{
    // Update HUD, play hit animation, screen shake, etc.
}

private void OnPlayerDied()
{
    // Game over flow.
}
```

Note: C# Godot 4 signals are *strongly typed* via generated `SignalName` class and `EventHandler` delegate naming convention. Connect with `+=`, disconnect with `-=`, just like normal C# events. Much better than string-based approach in GDScript and earlier C# versions.

Why signals matter: nodes communicate **without knowing about each other**. Health node doesn't know about HUD; HUD subscribes from outside. Foundation of decoupled scene design.

Deeper signal patterns: [signals-and-events.md](signals-and-events.md).

## Autoloads (Singletons)

Autoload is node (or script) Godot loads automatically at startup, keeps available globally. Set in **Project Settings → Autoload**.

Common uses:

- **Global game state** — current level, score, settings.
- **Audio bus controllers** — global SFX/music systems.
- **Scene switchers** — handling transitions between scenes.
- **Save manager** — load and save game from anywhere.
- **Event bus** — central hub for global events.

Example:

```csharp
// GameState.cs (autoloaded as "GameState")
public partial class GameState : Node
{
    public int Score { get; private set; }
    public int Level { get; private set; } = 1;

    [Signal] public delegate void ScoreChangedEventHandler(int newScore);

    public void AddScore(int amount)
    {
        Score += amount;
        EmitSignal(SignalName.ScoreChanged, Score);
    }
}
```

Anywhere in code:

```csharp
var gameState = GetNode<GameState>("/root/GameState");
gameState.AddScore(10);
```

Autoloads powerful and *easily abused*. Temptation: put everything in autoloads because easy to access. Result: god-singleton knowing everything; project where every node depends on autoload for everything. Same anti-pattern as god class in OO design.

Discipline: use autoloads for *truly global* concerns (game state, audio, scene transitions, saves). Local communication between nodes: signals and direct references, not autoloads.

Deeper patterns: [signals-and-events.md](signals-and-events.md).

## The Editor

Godot's editor is part of workflow, not just tool to launch scenes. Design scenes in editor visually:

- **Scene panel** — node tree of current scene.
- **Inspector** — properties of selected node.
- **Filesystem panel** — files in project.
- **Output / Debugger** — logs and debugging.
- **2D / 3D viewport** — visual editing of scene.
- **Script editor** — code editor (or use VS Code / Rider for C#).

Many things configured in inspector rather than code:

- Initial property values
- Signal connections
- Resource references
- Group memberships
- Process modes

*Good* for things varying per-instance (particular enemy's health), *good* for designer-tweakable values. *Bad* for anything needing source-control diffability or that should be same everywhere — those go in code.

For **C# specifically**, editor experience slightly weaker than GDScript: scripts must be compiled, editor needs to find .NET assembly, hot-reload doesn't always work. Most C# Godot developers use **VS Code** or **JetBrains Rider** for actual code editing, Godot editor for scene design.

## Resources

**Resource** is piece of data saved to disk, shareable between nodes. Examples: textures, audio streams, fonts, materials, scripts, scenes themselves.

Resources are reference-counted and shared. Two `Sprite2D` nodes using same texture share underlying `Texture2D` resource — no duplication.

Create **custom resources** by inheriting from `Resource`:

```csharp
[GlobalClass]
public partial class WeaponData : Resource
{
    [Export] public string WeaponName { get; set; }
    [Export] public int Damage { get; set; }
    [Export] public float AttackSpeed { get; set; }
    [Export] public Texture2D Icon { get; set; }
    [Export] public AudioStream HitSound { get; set; }
}
```

`[GlobalClass]` makes type available in editor's "Create New Resource" dialog. Now create `.tres` files per weapon, edit in inspector, assign to nodes via `[Export]`. Godot equivalent of "data files" in other engines; *the* idiomatic way to handle game data (item stats, ability definitions, level configs, etc.).

```csharp
public partial class Weapon : Node
{
    [Export] public WeaponData Data { get; set; }
}
```

In editor, assign `.tres` resource to `Data` field. Runtime: weapon has data without code knowing specific weapon names. Pattern scales to thousands of items without code changes.

## Project Structure

New Godot project starts with just `project.godot` file. Add folders as you go. Common conventions (more in [assets/project-structure-template.md](../assets/project-structure-template.md)):

```
project.godot
.godot/                  ← Generated; gitignore this
addons/                  ← Third-party plugins
scenes/                  ← .tscn files
  ├── player/
  ├── enemies/
  ├── levels/
  └── ui/
scripts/                 ← .cs files (or .gd)
  ├── player/
  ├── enemies/
  ├── managers/
  └── utils/
resources/               ← Custom .tres data files
  ├── weapons/
  ├── enemies/
  └── items/
assets/                  ← Raw assets (textures, audio, models)
  ├── sprites/
  ├── audio/
  ├── fonts/
  └── models/
shaders/                 ← .gdshader files
exports/                 ← Generated; gitignore this
```

Structure flexible — Godot doesn't enforce. Pick something scaling with project, stick to it.

## C# Specifics

Things every C# Godot engineer should know up-front:

- **`Godot.NET.Sdk`** is project SDK. `.csproj` auto-generated by Godot.
- **`partial` is required** on every class with Godot generated code (most node classes).
- **`[Export]` attribute** exposes field/property to editor's inspector.
- **`[Signal]` attribute** declares signal; convention is `EventHandler` suffix on delegate.
- **Naming conventions differ from C# norms**: Godot uses `PascalCase` for methods and properties (`_Process`, not `_process`; `GlobalPosition`, not `globalPosition`). Follow Godot's conventions in Godot code.
- **`GD.Print(...)`** is equivalent of `Console.WriteLine`. `GD.PrintErr(...)` for errors.
- **`Tween` and `SignalAwaiter`** can be `await`ed, integrating with async/await.
- **`ToSignal(node, "name")`** lets you await a signal.

Most important thing about C# in Godot 4: **first-class citizen now**. Earlier versions had clunky C# story; Godot 4 with .NET 8 much better. Performance, tooling, ergonomics all reasonable. Most of what you'd want from C# (LINQ, async/await, generics, modern syntax) just works.

## Common Mistakes Coming In

Things tripping up new Godot engineers, especially from Unity:

- **Treating editor as optional.** Trying to do everything in code. Godot's editor is good; using it is faster.
- **Confusing nodes with components.** `Sprite2D` is node, not component on "player" object. Player *is* tree of nodes; sprite is child of player. No MonoBehaviour-style component model.
- **Putting movement in `_Process`.** Jitter follows.
- **Not using signals.** Direct method calls everywhere; tightly coupled mess.
- **Autoload abuse.** Everything in singletons; god-bus pattern.
- **Thinking GDScript and C# are interchangeable.** They are *not*. Different semantics, different performance characteristics, different ecosystem support. Pick one for project.
- **Path-based `GetNode` everywhere.** Brittle. Use `[Export]` references or `%UniqueName` syntax.
- **Custom UI systems.** Godot's `Control` system is powerful; learning takes a day; reinventing takes weeks, produces worse results.
- **Treating `_Ready` like constructor for C# class.** Actual C# constructors run *before* node is in tree; most setup belongs in `_Ready`.

Rest of skill's references go deep on each. Start with this file as mental model, then read references matching today's work.

## Related

- [scenes-and-instancing.md](scenes-and-instancing.md) — how scenes compose and instance
- [nodes-and-architecture.md](nodes-and-architecture.md) — node hierarchy as architecture
- [signals-and-events.md](signals-and-events.md) — signal patterns
- [gdscript-vs-csharp.md](gdscript-vs-csharp.md) — language choice and interop
- [godot-anti-patterns.md](godot-anti-patterns.md) — what not to do

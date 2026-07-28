# Scenes and Instancing

Scenes are most powerful and most misused feature in Godot. How you compose game out of reusable, self-contained pieces. Also where most projects collapse into chaos when not used well — too many scenes and project fragmented; too few and you've built god-scene.

This file is playbook for getting scene composition right.

## What a Scene Actually Is

Scene is tree of nodes saved as `.tscn` file. Root node is "type" of scene; children are its parts. Whole tree is *template* — instancing gives copy of entire tree, with overrides applied at root.

Scene has three properties that matter:

1. **It's a template.** Instancing gives fresh copy.
2. **It's editable in inspector** at instance level. Override values; change properties; add child nodes.
3. **Changes to source `.tscn` propagate to all instances.** Update player scene; every level using player scene gets update.

Third property is what makes scenes powerful and dangerous. Change to heavily-used scene affects every place it's used; sometimes exactly what you want, sometimes breaks four levels you forgot about.

## When to Make Something a Scene

Useful test: would you ever want to use this exact tree of nodes more than once, or have designer reuse it without engineering's help?

Yes → it's a scene.

No → just child node of parent, no separate scene needed.

Concrete examples:

| Thing | Scene? | Why |
|---|---|---|
| Player character | Yes | Reused across levels; complex; deserves its own file |
| Enemy type (e.g., goblin) | Yes | Many instances; reused across levels |
| Bullet | Yes | Spawned dynamically, many instances |
| Pickup item | Yes | Many instances |
| HUD root | Yes | Reused across levels (or at least loaded as one unit) |
| A specific button in the HUD | No | One instance, only meaningful inside the HUD scene |
| A particular level | Yes (it *is* a scene) | Loaded by name |
| A unique boss with one instance | Maybe | Yes if you want it editable separately; no if it lives only in one level |
| A door | Yes | Many instances likely |
| A specific door in a specific level | No | Just a door instance with overrides |
| A reusable AI behavior | Yes | If multiple enemies share it |
| A one-off cutscene trigger | No | Inline child of the level |

Bias should be **toward more scenes**. Few too many fine; few too few becomes god-scene problem fast.

## The God Scene Anti-Pattern

Most common scene-design failure: single scene containing everything. "Level" scene has player inline, enemies inline, HUD inline, pause menu inline, 50 other things. Every change requires opening one massive scene; merge conflicts on `.tscn` constant.

Symptoms of god scene:

- `.tscn` file hundreds of lines long.
- Multiple people can't work without merge conflicts.
- Things that should be reusable across levels duplicated by hand.
- Adding new feature means adding new top-level nodes to god scene.
- Scene takes long time to open in editor.

Fix: extract reusable parts into own scenes. Level scene becomes thin orchestrator *instancing* other scenes (player, enemies, HUD, pickups). Each piece owned by own file.

Healthy level scene might look like:

```
Level1 (Node2D)
├── TileMap (level-specific geometry; can stay inline)
├── Player (instance of player.tscn)
├── Enemies (Node2D)
│   ├── Goblin (instance of goblin.tscn)
│   ├── Goblin (instance of goblin.tscn)
│   └── BossEntrance (Area2D — level-specific)
├── Pickups (Node2D)
│   ├── HealthPotion (instance of health_potion.tscn)
│   └── Coin (instance of coin.tscn)
├── HUD (CanvasLayer; instance of hud.tscn)
└── PauseMenu (CanvasLayer; instance of pause_menu.tscn)
```

Level scene is small. Says "this level has these things, in these positions, with these values." Doesn't define what player, enemy, or HUD *is*.

## Instancing in Code

Instance scene two ways:

### In the editor

Right-click node → "Instance Child Scene" → pick `.tscn` file. Instance appears with chain icon, indicating it came from another scene.

### In code

Load scene as `PackedScene` resource, call `Instantiate()`:

```csharp
public partial class EnemySpawner : Node2D
{
    [Export] public PackedScene EnemyScene { get; set; }
    [Export] public int SpawnCount = 5;

    public override void _Ready()
    {
        for (int i = 0; i < SpawnCount; i++)
        {
            var enemy = EnemyScene.Instantiate<Enemy>();
            AddChild(enemy);
            enemy.GlobalPosition = GlobalPosition + new Vector2(i * 50, 0);
        }
    }
}
```

Things to notice:

- **`PackedScene` is resource type.** Assign via `[Export]` in inspector — much cleaner than `GD.Load<PackedScene>("res://path/to/scene.tscn")` scattered through code.
- **`Instantiate<T>()`** returns root node typed as `T`. Scene's root right type → type-safe; if not, returns `null` or throws.
- **`AddChild(enemy)`** adds new instance to tree. Until you do this, instance exists in memory but isn't part of running game.
- **Setting position after `AddChild`** is correct — many nodes initialize properties on entering tree; setting before sometimes overridden.

## Inspector Overrides

Instancing scene: instance starts with all values from source. Then *override* any of them in parent scene:

- Position enemy differently than default
- Set different sprite
- Change maximum health
- Connect signal to different handler
- Add new child nodes

Overrides stored in parent `.tscn` file as deltas — only changed values saved, so instance stays small. Source scene changes → unchanged properties update; changed (overridden) properties keep override.

What makes scenes real composition system. Base behavior from scene; per-use customization from parent.

## Scene Inheritance

Godot supports scene *inheritance* — scene inheriting from another scene, overriding parts. Different from scene instancing.

When to use scene inheritance:

- "Base enemy" scene with shared behavior; "specific enemy" scenes inheriting and overriding visuals and stats.
- "Menu page" scene with shared layout; specific pages inheriting, adding page-specific content.

When *not* to use scene inheritance:

- Most cases. Composition (instancing reusable child scenes) simpler and more flexible.
- Inheritance hierarchy deep. Two levels usually fine; three suspect; four is smell.

Classic guideline: **prefer composition over inheritance**. Inheritance has uses but composition scales better, breaks less.

Create inherited scene: in editor, **Scene → New Inherited Scene** → pick parent. New scene has parent's tree visible but locked; can override properties, add children, can't modify parent's structure.

## Unique Names and the `%` Syntax

Common pain point in scenes: holding references to deeply-nested nodes. Brittle way:

```csharp
var label = GetNode<Label>("UI/Container/InfoPanel/StatusLabel");
```

Move "InfoPanel" out of "Container" → path breaks. Move "StatusLabel" anywhere → path breaks.

Fix: **scene-unique names**. Right-click node in editor → "Access as Scene Unique Name". Node now has `%` prefix in scene panel, accessible by short name from anywhere in same scene:

```csharp
var label = GetNode<Label>("%StatusLabel");
```

Works regardless of where `StatusLabel` is in tree, as long as same scene. Move it; reference still works.

Trade-offs:

- **Pros:** robust to refactoring; clean code; works across deeply nested trees.
- **Cons:** names must be unique within scene; you don't see path in code so slightly harder to find.

Most cases: scene-unique names are right call. Use for any node referenced from script.

## Saving and Loading Scenes

Full machinery for runtime scene loading:

```csharp
// Load a scene from disk into a PackedScene
var scene = GD.Load<PackedScene>("res://scenes/levels/level_2.tscn");

// Instantiate it
var levelInstance = scene.Instantiate<Level>();

// Add it to the tree
GetTree().Root.AddChild(levelInstance);
```

Or, more idiomatic pattern: change current scene entirely:

```csharp
GetTree().ChangeSceneToFile("res://scenes/levels/level_2.tscn");
```

`ChangeSceneToFile` unloads current scene at end of frame, replaces with new one. Standard way to transition between levels, menus, main game.

```csharp
// Or, with a pre-loaded PackedScene:
var nextScene = GD.Load<PackedScene>("res://scenes/levels/level_2.tscn");
GetTree().ChangeSceneToPacked(nextScene);
```

Common pattern: autoload handling scene changes with transitions:

```csharp
// SceneSwitcher.cs (autoload)
public partial class SceneSwitcher : Node
{
    public async void SwitchScene(string path)
    {
        // Fade to black, await tween
        var tween = CreateTween();
        tween.TweenProperty(GetNode<ColorRect>("Fade"), "color:a", 1.0f, 0.5f);
        await ToSignal(tween, Tween.SignalName.Finished);

        // Change the scene
        GetTree().ChangeSceneToFile(path);

        // Fade back in
        tween = CreateTween();
        tween.TweenProperty(GetNode<ColorRect>("Fade"), "color:a", 0.0f, 0.5f);
    }
}
```

More transition patterns: [animation-and-tweens.md](animation-and-tweens.md).

## Communicating Between Scenes

Frequent question: scene needs to react to something happening in *another* scene. How?

Several patterns, in order of preference:

### 1. Signal up, command down

Most idiomatic Godot pattern. Child scene emits signal; parent connects, decides what to do (often passing information to other children).

```
Level
├── Player (emits Damaged signal)
└── HUD (receives information from Level, displays it)
```

Level scene's script:

```csharp
public override void _Ready()
{
    var player = GetNode<Player>("Player");
    var hud = GetNode<HUD>("HUD");
    player.HealthChanged += hud.OnPlayerHealthChanged;
}
```

Player doesn't know about HUD. HUD doesn't know about Player. Level wires them together.

Pattern scales well — each scene only knows about own children.

### 2. Event bus (autoload)

Truly global events not fitting parent-child structure: singleton autoload holding signals.

```csharp
// EventBus.cs (autoload)
public partial class EventBus : Node
{
    [Signal] public delegate void PlayerDiedEventHandler();
    [Signal] public delegate void LevelCompletedEventHandler(int levelNumber);
    [Signal] public delegate void ScoreChangedEventHandler(int newScore);
}
```

Any node can emit:

```csharp
GetNode<EventBus>("/root/EventBus").EmitSignal(EventBus.SignalName.PlayerDied);
```

Any node can subscribe:

```csharp
public override void _Ready()
{
    var bus = GetNode<EventBus>("/root/EventBus");
    bus.PlayerDied += OnPlayerDied;
}
```

Use *sparingly*. Event bus convenient but can become god-singleton if everything goes through it. Reserve for events genuinely global or cross-cutting multiple unrelated systems.

### 3. Groups

Godot has built-in "groups" — string tags attachable to nodes. Then send method call or fetch list of all nodes in group.

```csharp
// In an enemy:
public override void _Ready()
{
    AddToGroup("enemies");
}

// Elsewhere:
foreach (var enemy in GetTree().GetNodesInGroup("enemies"))
{
    if (enemy is Enemy e)
    {
        e.OnPlayerSpotted();
    }
}

// Or, broadcast a method call:
GetTree().CallGroup("enemies", "OnPlayerSpotted");
```

Groups useful for "all of these things at once" patterns. Avoid for one-to-one communication where signals work better.

### 4. Direct references via `[Export]`

Parent needing long-lived reference to child of another sibling scene: parent can hold reference exported in inspector:

```csharp
public partial class HUD : CanvasLayer
{
    [Export] public Player Player { get; set; }

    public override void _Ready()
    {
        Player.HealthChanged += UpdateHealthBar;
    }
}
```

In editor, drag Player node onto HUD's `Player` field. Now HUD has typed reference, no path lookup needed.

Brittle if Player node renamed or moved, but editor catches it: field becomes empty, you re-assign. Better than string path.

## Refactoring a Scene Into Reusable Parts

Common task: scene grown too big. Workflow to extract sub-scene:

1. **Identify subtree** that should be own scene. Logical unit; clear boundaries.
2. **Right-click root of subtree** → "Save Branch as Scene" → name it.
3. Original scene now contains *instance* of new scene where subtree used to be.
4. Open new scene independently; verify it still works.
5. Update references in code to use scene-unique names or `[Export]` references.

Godot handles most bookkeeping. Script attached to subtree's root moves with subtree into new scene.

**Caveat**: signal connections from outside extracted subtree into inside will break. Re-wire at new boundary (often by emitting new signal at root of extracted scene, connecting from parent).

## Resource References vs Scene References

Don't confuse:

- **`PackedScene`** is reference to scene `.tscn` file. Instantiate to get tree of nodes.
- **`Resource`** is reference to any other resource (texture, audio, custom data).

Both assignable via `[Export]`. Both loadable with `GD.Load<T>(...)`. Different types, not interchangeable.

```csharp
[Export] public PackedScene BulletScene { get; set; } // For spawning
[Export] public Texture2D IconTexture { get; set; }    // For displaying
[Export] public AudioStream HitSound { get; set; }     // For playing
```

## Anti-Patterns

- **God scene.** Everything in one `.tscn`. Merge conflicts; long load times; impossible to reuse.
- **Scenes per node.** Opposite extreme: every individual node its own scene. Excessive fragmentation; project hard to navigate.
- **Path-based `GetNode` everywhere.** Brittle; breaks on every refactor. Use `[Export]` references or `%UniqueName`.
- **Reaching across tree** (e.g., `GetNode("../../UI/HUD/Score")`). Couples child to parent's structure. Use signals or pass references.
- **Modifying scene state via global state.** Scene depending on autoload values for initial state can't be tested or reused independently.
- **Inheritance instead of composition.** 3-level deep scene inheritance hierarchy. Hard to reason about; refactor into composed scenes.
- **Hand-duplicating instead of instancing.** Two enemies that should be same scene type, copy-pasted. Next change touches both files.
- **Loading scenes with `GD.Load` in `_Process`.** Slow; allocates; scene should be `[Export] PackedScene` cached at `_Ready`.
- **`Free()` instead of `QueueFree()` when removing instances.** Crashes if anyone iterating.
- **Forgetting to disconnect signals** between scenes spanning lifetimes. Memory leaks.
- **Editing `.tscn` files by hand.** Text format, you *can*, but editor is right tool. Hand-edits often produce subtly broken scenes.

## Related

- [godot-fundamentals.md](godot-fundamentals.md) — what scenes are, foundationally
- [nodes-and-architecture.md](nodes-and-architecture.md) — node hierarchy as architecture
- [signals-and-events.md](signals-and-events.md) — communication between scenes
- [godot-anti-patterns.md](godot-anti-patterns.md) — broader patterns to avoid

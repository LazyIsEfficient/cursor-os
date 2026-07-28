# Nodes and Architecture

In Godot, scene tree *is* architecture of game. No separate "framework layer" to design — how you arrange nodes determines how code communicates, how state flows, what's reusable, what's coupled. Get this wrong → codebase fights you forever; get right → Godot's strengths carry you long way.

File is about thinking architecturally in Godot's idiom — composition with nodes, not inheritance with classes.

## The Core Principle: Composition With Nodes

Coming from typical OO background, instinct is model game entities with class hierarchies. `Player` class inherits from `Character` which inherits from `Entity` which inherits from `GameObject`. Then `Player` has `Sprite`, `AnimationController`, `InputHandler`, etc. as fields.

In Godot, you do this differently. Compose player out of *nodes*:

```
Player (CharacterBody2D)
├── Sprite2D
├── CollisionShape2D
├── AnimationPlayer
├── StateMachine (Node, custom script)
├── HitBox (Area2D)
│   └── CollisionShape2D
├── HurtBox (Area2D)
│   └── CollisionShape2D
└── Camera2D
```

Player class is just `CharacterBody2D` with script. Script handles physics, but visual, audio, animation, hit detection, camera are all separate child nodes handling own concerns. Each child configurable in inspector or replaceable with different implementation.

This is *composition*, right Godot idiom. Don't model player as god-class with everything inlined; model as tree of focused, reusable nodes.

## Inheritance Has a Place — A Small Place

Inheritance in Godot fine for *narrow* cases:

- **Specialized nodes**: custom `EnemyBase` deriving from `CharacterBody2D`, adding health/damage methods; `Goblin`, `Bat`, `Skeleton` derive from `EnemyBase`. Hierarchy one or two levels deep; shared behavior real.
- **Custom resources**: `WeaponData` resource type, with `MeleeWeaponData` and `RangedWeaponData` subclasses if needed.
- **Editor plugins**: tooling code where shared base behavior makes sense.

Inheritance *wrong* when:

- Hierarchy more than 2 levels deep.
- Inheriting to "share code" rather than express "is-a" relationship.
- Tempted to use inheritance just because that's how you'd do it in class-based language.
- Shared behavior could be child node instead.

Useful test: if "share code" is only reason for considering inheritance, prefer child node. Child node more flexible, swappable at runtime, doesn't lock parent into hierarchy.

## What Goes in a Node Script

Each node script should have **one job**. Whole point of composing nodes: keep each node focused.

### Good: focused nodes

```csharp
// Player.cs - movement and physics only
public partial class Player : CharacterBody2D
{
    [Export] public float Speed { get; set; } = 200.0f;
    [Export] public float JumpVelocity { get; set; } = -400.0f;

    private const float Gravity = 980.0f;

    public override void _PhysicsProcess(double delta)
    {
        var velocity = Velocity;

        if (!IsOnFloor())
            velocity.Y += Gravity * (float)delta;

        if (Input.IsActionJustPressed("jump") && IsOnFloor())
            velocity.Y = JumpVelocity;

        var direction = Input.GetAxis("move_left", "move_right");
        velocity.X = direction * Speed;

        Velocity = velocity;
        MoveAndSlide();
    }
}
```

```csharp
// Health.cs - health state only
public partial class Health : Node
{
    [Export] public int MaxHealth { get; set; } = 100;
    public int Current { get; private set; }

    [Signal] public delegate void HealthChangedEventHandler(int current, int max);
    [Signal] public delegate void DiedEventHandler();

    public override void _Ready()
    {
        Current = MaxHealth;
    }

    public void TakeDamage(int amount)
    {
        Current = Math.Max(0, Current - amount);
        EmitSignal(SignalName.HealthChanged, Current, MaxHealth);
        if (Current == 0) EmitSignal(SignalName.Died);
    }

    public void Heal(int amount)
    {
        Current = Math.Min(MaxHealth, Current + amount);
        EmitSignal(SignalName.HealthChanged, Current, MaxHealth);
    }
}
```

These two scripts each have one responsibility. Don't know about each other. Reusable.

### Bad: god script

```csharp
// Player.cs (god version) - DON'T DO THIS
public partial class Player : CharacterBody2D
{
    public int Health = 100;
    public int Mana = 50;
    public int Score = 0;
    public int Level = 1;

    private AnimationPlayer _anim;
    private Sprite2D _sprite;
    private AudioStreamPlayer _hitSound;
    private AudioStreamPlayer _deathSound;
    private Label _healthLabel;
    private Label _scoreLabel;

    public override void _PhysicsProcess(double delta)
    {
        // Movement
        // Animation
        // Sound effects
        // Health regen
        // UI updates
        // Score tracking
        // ... 200 lines of mixed concerns
    }
}
```

God script is same anti-pattern as god class. Every change requires editing one file; nothing reusable; testing impossible; merge conflicts constant.

Fix: extract each concern to child node with own script.

## Patterns for Common Architectures

### State Machines

Game entities often have *states* changing behavior: idle, walking, jumping, attacking, dying. Naive way: giant `if/else` in `_PhysicsProcess` checking current state. Works for two states; falls apart at five.

Godot idiom: **state machine as child node**. Each state is own script. State machine node holds current state, forwards `_Process` / `_PhysicsProcess` calls to it.

```
Player (CharacterBody2D)
├── Sprite2D
├── AnimationPlayer
└── StateMachine (Node)
    ├── IdleState (Node)
    ├── WalkState (Node)
    ├── JumpState (Node)
    └── AttackState (Node)
```

```csharp
// StateMachine.cs
public partial class StateMachine : Node
{
    [Export] public State InitialState { get; set; }
    public State CurrentState { get; private set; }

    public override void _Ready()
    {
        // Initialize after the parent is ready
        CallDeferred(MethodName.InitState);
    }

    private void InitState()
    {
        CurrentState = InitialState;
        CurrentState?.Enter();
    }

    public override void _Process(double delta)
    {
        CurrentState?.Update(delta);
    }

    public override void _PhysicsProcess(double delta)
    {
        CurrentState?.PhysicsUpdate(delta);
    }

    public void TransitionTo(State newState)
    {
        if (newState == CurrentState) return;
        CurrentState?.Exit();
        CurrentState = newState;
        CurrentState?.Enter();
    }
}

// State.cs - base class
public partial class State : Node
{
    [Export] public StateMachine StateMachine { get; set; }

    public virtual void Enter() { }
    public virtual void Exit() { }
    public virtual void Update(double delta) { }
    public virtual void PhysicsUpdate(double delta) { }
}

// IdleState.cs
public partial class IdleState : State
{
    public override void Enter()
    {
        // Play idle animation
        var player = GetParent<StateMachine>().GetParent<Player>();
        player.GetNode<AnimationPlayer>("AnimationPlayer").Play("idle");
    }

    public override void PhysicsUpdate(double delta)
    {
        var player = GetParent<StateMachine>().GetParent<Player>();
        var input = Input.GetAxis("move_left", "move_right");
        if (input != 0)
        {
            StateMachine.TransitionTo(GetNode<WalkState>("../WalkState"));
        }
        else if (Input.IsActionJustPressed("jump"))
        {
            StateMachine.TransitionTo(GetNode<JumpState>("../JumpState"));
        }
    }
}
```

One valid pattern. Many state-machine patterns exist; key is each state is *contained*, *testable*, *replaceable*.

More elaborate animation state machines: Godot has `AnimationTree` with built-in state machine — see [animation-and-tweens.md](animation-and-tweens.md).

### Manager Nodes

Several systems needing coordination? "Manager" node often right answer. Examples:

- `GameManager` — tracks game state, score, progression
- `AudioManager` — plays sounds, manages bus volumes
- `UIManager` — handles transitions between menus
- `SaveManager` — handles save/load

Can live as children of main scene, or as autoloads if needing to persist across scene changes.

Manager is *not* god-class. Coordinates but delegates actual work to other nodes. `GameManager` doesn't *play* sounds — tells `AudioManager` to play one. Separation is the point.

### Service Nodes

Sometimes you want node providing service multiple other nodes use, but service doesn't need to live in scene tree of consumers. Example: `DamageNumberSpawner` spawning floating text whenever any enemy hit.

Pattern: service node lives in known location (often manager autoload or known child of main scene). Other nodes signal it when needing service.

```csharp
// DamageNumberSpawner.cs
public partial class DamageNumberSpawner : Node2D
{
    [Export] public PackedScene DamageNumberScene { get; set; }

    public void Spawn(int amount, Vector2 position)
    {
        var number = DamageNumberScene.Instantiate<DamageNumber>();
        AddChild(number);
        number.GlobalPosition = position;
        number.SetAmount(amount);
    }
}
```

Enemies use via signal connection or autoload pattern. Enemy doesn't know how to spawn damage number; spawner doesn't know about specific enemies; connection happens at scene level (or via signal bus).

### Spawner / Pool Patterns

Spawning many short-lived things (bullets, particles, damage numbers)? Use object pooling instead of `Instantiate`/`QueueFree` cycles to reduce GC pressure.

```csharp
public partial class BulletPool : Node
{
    [Export] public PackedScene BulletScene { get; set; }
    [Export] public int InitialSize = 50;

    private Queue<Bullet> _available = new Queue<Bullet>();

    public override void _Ready()
    {
        for (int i = 0; i < InitialSize; i++)
        {
            var bullet = BulletScene.Instantiate<Bullet>();
            AddChild(bullet);
            bullet.SetPhysicsProcess(false);
            bullet.Visible = false;
            bullet.OnReturned += () => Return(bullet);
            _available.Enqueue(bullet);
        }
    }

    public Bullet Spawn(Vector2 position, Vector2 direction)
    {
        Bullet bullet;
        if (_available.Count > 0)
        {
            bullet = _available.Dequeue();
        }
        else
        {
            // Pool exhausted; create a new one (or fail, depending on policy)
            bullet = BulletScene.Instantiate<Bullet>();
            AddChild(bullet);
            bullet.OnReturned += () => Return(bullet);
        }

        bullet.GlobalPosition = position;
        bullet.Direction = direction;
        bullet.SetPhysicsProcess(true);
        bullet.Visible = true;
        return bullet;
    }

    private void Return(Bullet bullet)
    {
        bullet.SetPhysicsProcess(false);
        bullet.Visible = false;
        _available.Enqueue(bullet);
    }
}
```

More code than `QueueFree`/`Instantiate`, but for things spawned dozens of times per second, real performance difference. See [performance-and-profiling.md](performance-and-profiling.md) for when pooling worth it.

## Holding References to Children

Most common architectural friction in Godot: holding references to child nodes from parent script. Several patterns; some brittle, some robust.

### Path-based (brittle)

```csharp
public override void _Ready()
{
    _sprite = GetNode<Sprite2D>("Sprite2D");
    _anim = GetNode<AnimationPlayer>("AnimationPlayer");
    _statusLabel = GetNode<Label>("UI/Container/InfoPanel/StatusLabel");
}
```

First two fine because shallow. Third brittle — moving any parent node breaks path.

### Scene-unique names (good)

Mark node with `%` in editor (right-click → "Access as Scene Unique Name"), reference by short name:

```csharp
public override void _Ready()
{
    _statusLabel = GetNode<Label>("%StatusLabel");
}
```

Lookup by name within scene, regardless of where in tree node lives. Robust to moving node around.

### `[Export]` references (best for cross-scene)

References spanning scene boundaries: drag target node onto `[Export]` field:

```csharp
[Export] public Player Target { get; set; }
[Export] public Label HealthLabel { get; set; }
```

In editor, drag target nodes onto fields. References typed, resolved when scene loads. Renaming target doesn't break anything.

Downside: must remember to wire up in editor; forget → null reference errors at runtime. Set field in `_Ready` with null check to fail loudly:

```csharp
public override void _Ready()
{
    if (Target == null)
    {
        GD.PrintErr($"{Name} has no Target assigned!");
    }
}
```

### `[Export(PropertyHint.NodePath)]` (between)

Node references within same scene: use `NodePath`:

```csharp
[Export] public NodePath TargetPath { get; set; }
private Player _target;

public override void _Ready()
{
    _target = GetNode<Player>(TargetPath);
}
```

Editor lets you pick node from scene tree. Useful when target in same scene but you don't want scene-unique names.

## "Wire It Up From the Top"

Useful general principle: **wiring happens at level above where wired things live**.

Two siblings needing to communicate → their parent wires them up:

```csharp
// Player and HUD are siblings; Level wires them
public partial class Level : Node2D
{
    public override void _Ready()
    {
        var player = GetNode<Player>("Player");
        var hud = GetNode<HUD>("HUD");
        player.HealthChanged += hud.UpdateHealthBar;
        player.Died += hud.ShowGameOver;
    }
}
```

Keeps Player and HUD ignorant of each other. Either removable; either reusable in different scene wiring them differently.

Opposite (player reaching out to find HUD) couples them, makes both less reusable.

## Nodes vs Resources for Data

Common confusion: when should something be node vs. custom resource?

**Nodes** are runtime entities. Lifecycle, in tree, participate in `_Process`/`_PhysicsProcess`, emit signals.

**Resources** are data. Inert. Live on disk and in memory; don't process, no transforms, don't respond to physics.

| Thing | Node or Resource? |
|---|---|
| The player character | Node (has lifecycle, processing, transform) |
| The player's stats (max HP, attack power) | Could be either; usually a resource if shared between instances |
| A specific weapon definition | Resource (data shared between weapon instances) |
| A weapon equipped by the player | Node (or a property of the player that holds a reference to a weapon resource) |
| A level | Scene (which is a special tree of nodes) |
| A level's ambient music | Resource (`AudioStream`) |
| A particle effect template | Resource (`ParticleProcessMaterial`) or scene |
| A spawned particle effect | Node |
| A sprite frame | Resource (`Texture2D`, `AtlasTexture`, or `SpriteFrames`) |
| A sprite displaying a frame | Node (`Sprite2D`) |

In doubt: ask "does it have position in world or lifecycle?" Yes → node. Pure data → resource.

## Signals as Architecture

Well-architected Godot project: signals are how *most* communication happens. Direct method calls for parent-to-child commands; signals for child-to-parent (and broader) events.

Signal patterns:

- **Child emits, parent listens.** Most common pattern. Child doesn't know who's listening.
- **Sibling-to-sibling via parent.** Parent connects sibling A's signal to sibling B's method. Neither sibling knows about other.
- **Global event bus (autoload).** Events not fitting parent-child structure; reserved for truly global concerns.

Direct call patterns:

- **Parent commands child.** `enemy.TakeDamage(10)`. Parent knows which child to command.
- **Method call up the tree.** Generally avoided; use signals.

More on signals: [signals-and-events.md](signals-and-events.md).

## Anti-Patterns

- **God script.** All player logic in one 800-line file.
- **God scene.** Single `.tscn` containing everything.
- **Deep inheritance.** Custom node classes 4 levels deep. Refactor to composition.
- **Mixed concerns.** "Player" script also handling UI, audio, score tracking, save state, pathfinding.
- **Tight coupling via paths.** `GetNode("../../UI/HUD/Score")`. Brittle on every refactor.
- **Manager-as-god.** `GameManager` doing *everything*. Split by responsibility.
- **Direct cross-scene access.** Node in one scene reaching into another scene's children. Use signals or events.
- **Inheritance for code reuse.** "I'll make `BaseEnemy` so I don't repeat code." Often child node would do.
- **State-as-flags.** Booleans for `isJumping`, `isAttacking`, `isDying`. State machine pattern cleaner.
- **Mutable shared state in resources.** Resources loaded once and shared; mutating affects every instance silently. Need per-instance state? Put on node, not resource.
- **`new ClassName()` for nodes that should come from scenes.** Misses children, signals, exports. Use `PackedScene.Instantiate<T>()`.
- **Manager autoloads instead of properly-rooted scenes.** Sometimes manager belongs in active scene's tree, not as autoload.

## Related

- [godot-fundamentals.md](godot-fundamentals.md) — engine model
- [scenes-and-instancing.md](scenes-and-instancing.md) — scene composition
- [signals-and-events.md](signals-and-events.md) — signal patterns
- software-design — broader principles (SOLID, cohesion/coupling) that apply
- [godot-anti-patterns.md](godot-anti-patterns.md) — broader patterns to avoid

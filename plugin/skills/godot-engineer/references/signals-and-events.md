# Signals and Events

Signals are Godot's event system, single most important architectural tool engine gives you. Used well, nodes communicate without knowing about each other; result is project where scenes reusable, refactoring safe, adding features doesn't require touching unrelated code.

Used badly — or not at all — Godot projects collapse into spaghetti where every node holds direct references to every other node. Codebase becomes impossible to refactor, impossible to test.

File is about signal patterns in C# Godot 4: when to use them, how to structure them, when to reach for autoload event bus instead.

## What a Signal Is

Signal is event node can *emit*. Other nodes can *connect* to event, receive callback when it fires. Emitter doesn't know who's listening; listener has typed connection to emitter.

In C# Godot 4, signals declared as delegate types with `[Signal]` attribute, ending in `EventHandler` (naming required by source generator):

```csharp
public partial class Health : Node
{
    [Signal] public delegate void DamagedEventHandler(int amount, int currentHealth);
    [Signal] public delegate void HealedEventHandler(int amount, int currentHealth);
    [Signal] public delegate void DiedEventHandler();

    [Export] public int MaxHealth { get; set; } = 100;
    public int Current { get; private set; }

    public override void _Ready()
    {
        Current = MaxHealth;
    }

    public void TakeDamage(int amount)
    {
        var newHealth = Math.Max(0, Current - amount);
        var actualDamage = Current - newHealth;
        Current = newHealth;

        EmitSignal(SignalName.Damaged, actualDamage, Current);

        if (Current == 0)
            EmitSignal(SignalName.Died);
    }

    public void Heal(int amount)
    {
        var newHealth = Math.Min(MaxHealth, Current + amount);
        var actualHeal = newHealth - Current;
        Current = newHealth;
        EmitSignal(SignalName.Healed, actualHeal, Current);
    }
}
```

Patterns:

- **`SignalName.Damaged`** is generated constant for signal name. Preferable to raw string `"Damaged"` — typos caught at compile time.
- **Multiple parameters** passed in `EmitSignal` after signal name.
- **Same emitter can emit different signals** for different events.

## Connecting Signals

Two ways: in editor, or in code.

### In the editor

Select emitter node, look at **Node** panel (next to Inspector), find signal in list, double-click. Pick receiver node and method name.

Convenient for quick connections, connections that should be visible to designers. Downside: connection lives in `.tscn` file rather than code — not greppable; refactor of receiver method name doesn't update connection.

### In code (the C# 4 idiom)

Use `+=` and `-=` like normal C# events:

```csharp
public partial class HUD : CanvasLayer
{
    [Export] public Health PlayerHealth { get; set; }

    public override void _Ready()
    {
        PlayerHealth.Damaged += OnPlayerDamaged;
        PlayerHealth.Died += OnPlayerDied;
    }

    public override void _ExitTree()
    {
        if (IsInstanceValid(PlayerHealth))
        {
            PlayerHealth.Damaged -= OnPlayerDamaged;
            PlayerHealth.Died -= OnPlayerDied;
        }
    }

    private void OnPlayerDamaged(int amount, int currentHealth)
    {
        // Update health bar
        var healthBar = GetNode<ProgressBar>("%HealthBar");
        healthBar.Value = currentHealth;

        // Flash red, screen shake, etc.
    }

    private void OnPlayerDied()
    {
        var gameOver = GetNode<Control>("%GameOverScreen");
        gameOver.Visible = true;
    }
}
```

Right pattern for new code. It's:

- **Type-safe** — compiler checks parameter types match.
- **Refactor-friendly** — renaming method updates reference.
- **Greppable** — finding all connections to signal easy.
- **Idiomatic C#** — uses `+=` like every other event in .NET world.

Older string-based approach (`Connect("Damaged", new Callable(this, nameof(OnPlayerDamaged)))`) still works but avoid in new code.

## Disconnecting Signals

Always disconnect signals when connection no longer needed. Standard place is `_ExitTree`.

```csharp
public override void _ExitTree()
{
    if (IsInstanceValid(_emitter))
    {
        _emitter.SomeSignal -= OnSomeSignal;
    }
}
```

`IsInstanceValid` check defensive: emitter freed first → connection auto-cleans; disconnecting from freed object errors.

Both emitter and listener freed at same time (same scene unloaded) → no manual disconnect needed. Lifetimes can differ (one in autoload, other in temporary scene) → disconnect explicitly.

Useful rule of thumb: **always disconnect what you connect**, in symmetric lifecycle method:

| Connect in | Disconnect in |
|---|---|
| `_Ready` | `_ExitTree` |
| Constructor | Destructor / `Dispose` (rarely needed; nodes don't usually use this) |
| A specific method | Either explicitly when done, or in `_ExitTree` defensively |

## Signal Patterns

### Pattern 1: Child Emits, Parent Listens

Most common pattern. Child node emits signal when something happens. Parent script connects, decides what to do (often passing information to other children).

```
Player (Node2D)
├── Health (emits HealthChanged)
├── HealthBar (Control, listens)
└── HitFlash (AnimationPlayer, listens)
```

```csharp
public partial class Player : Node2D
{
    public override void _Ready()
    {
        var health = GetNode<Health>("Health");
        var bar = GetNode<HealthBar>("HealthBar");
        var flash = GetNode<HitFlash>("HitFlash");

        health.Damaged += (amount, current) =>
        {
            bar.UpdateValue(current);
            flash.Play();
        };

        health.Died += () =>
        {
            // Game over, etc.
        };
    }
}
```

Health node has no idea anyone listening. HealthBar has no idea where updates come from. Player wires them together. Each child removable or replaceable without touching others.

### Pattern 2: Sibling-to-Sibling via Parent

Same as above, but wiring between specific siblings rather than parent-and-child. Parent is matchmaker.

```csharp
public override void _Ready()
{
    var enemy = GetNode<Enemy>("Enemy");
    var loot = GetNode<LootDropper>("LootDropper");

    enemy.Died += (position) => loot.DropAt(position);
}
```

Enemy doesn't know about loot dropping. Loot dropper doesn't know about enemies. Level wires them together — could just as easily wire *different* loot dropper to *different* enemy.

### Pattern 3: Lambda Connections for Simple Cases

One-off connections not needing disconnect: lambdas are concise:

```csharp
GetNode<Button>("StartButton").Pressed += () => GetTree().ChangeSceneToFile("res://levels/level_1.tscn");
GetNode<Button>("QuitButton").Pressed += () => GetTree().Quit();
```

Downside: lambdas can't be disconnected by reference (need to store lambda first). Long-lived connections needing explicit disconnect: use named methods.

### Pattern 4: Signal Bus (Autoload Event Bus)

Events *truly global*, not fitting parent-child structure: autoload event bus is right tool. Examples: "player died" (everything in game might want to know), "level completed", "achievement unlocked".

```csharp
// EventBus.cs (set as autoload "EventBus")
public partial class EventBus : Node
{
    [Signal] public delegate void PlayerDiedEventHandler();
    [Signal] public delegate void PlayerLeveledUpEventHandler(int newLevel);
    [Signal] public delegate void LevelCompletedEventHandler(int levelNumber);
    [Signal] public delegate void AchievementUnlockedEventHandler(string achievementId);
    [Signal] public delegate void ItemPickedUpEventHandler(string itemId, int quantity);
}
```

Anywhere in game, emit:

```csharp
GetNode<EventBus>("/root/EventBus").EmitSignal(EventBus.SignalName.PlayerDied);
```

Or, more typed:

```csharp
public partial class Player : CharacterBody2D
{
    private EventBus _bus;

    public override void _Ready()
    {
        _bus = GetNode<EventBus>("/root/EventBus");
    }

    private void OnDied()
    {
        _bus.EmitSignal(EventBus.SignalName.PlayerDied);
    }
}
```

Anywhere else in game, listen:

```csharp
public override void _Ready()
{
    var bus = GetNode<EventBus>("/root/EventBus");
    bus.PlayerDied += OnPlayerDied;
}
```

Event bus powerful pattern. Also most-abused. Temptation: put *every* signal through it because easy. Result: god-singleton — single file listing hundreds of signals, every node depending on it for everything.

**Use bus only for events genuinely global** (cross-cut multiple unrelated systems, no clear parent-child relationship, or need to be received by code in completely different scenes). Local communication: direct signal connections.

Useful test: signal logically belongs to one specific node (player's health, enemy's death, button press) → on that node. Signal is *fact about world* many systems might react to (player died, level changed) → might belong on bus.

### Pattern 5: Signal With Awaiter

C# in Godot supports `await`-ing signals via `ToSignal`. Great for sequenced logic.

```csharp
public async void StartTutorial()
{
    var dialog = GetNode<DialogBox>("DialogBox");
    var anim = GetNode<AnimationPlayer>("AnimationPlayer");

    dialog.Show("Welcome to the game!");
    await ToSignal(dialog, DialogBox.SignalName.Dismissed);

    anim.Play("highlight_player");
    await ToSignal(anim, AnimationPlayer.SignalName.AnimationFinished);

    dialog.Show("Use arrow keys to move.");
    await ToSignal(dialog, DialogBox.SignalName.Dismissed);

    // Wait for the player to actually move
    var player = GetNode<Player>("Player");
    await ToSignal(player, Player.SignalName.Moved);

    dialog.Show("Great! Now try jumping.");
    // ...
}
```

Much cleaner than chains of nested signal callbacks for sequenced events. Use for tutorials, cutscenes, dialogue trees, multi-step animations, anything "do this, then wait, then do next thing."

## Direct Method Calls vs Signals

Frequent question: when to use signal vs. just calling method directly?

| Use a method call when... | Use a signal when... |
|---|---|
| The caller naturally has a reference to the callee | The caller doesn't and shouldn't need a reference |
| The caller is *commanding* the callee to do something | The caller is *announcing* something happened |
| The relationship is parent-to-child or owner-to-owned | The relationship is observer/subscriber |
| There's exactly one receiver | There might be zero, one, or many receivers |
| The flow is "I want this to happen" | The flow is "this happened; whoever cares can react" |

Examples:

```csharp
// Method call: parent commands child
enemy.TakeDamage(10);
spawner.Spawn();
audio.PlaySound(SoundType.Hit);

// Signal: child announces; observers react
playerHealth.Damaged += UpdateHud;        // Player doesn't know about HUD
playerHealth.Damaged += FlashScreen;      // Player doesn't know about screen flash
playerHealth.Damaged += LogToTelemetry;   // Player doesn't know about telemetry
```

Discipline: methods for *commands*, signals for *events*. Want to tell specific node "do this thing"? Call its method. Want to announce "this thing happened"? Emit signal.

## Custom Resource as Event Carrier

Complex events with many parameters: consider custom resource as event payload:

```csharp
[GlobalClass]
public partial class DamageEvent : Resource
{
    [Export] public int Amount { get; set; }
    [Export] public DamageType Type { get; set; }
    [Export] public Node2D Source { get; set; }
    [Export] public Vector2 HitPoint { get; set; }
    [Export] public bool IsCritical { get; set; }
}

[Signal] public delegate void DamageDealtEventHandler(DamageEvent ev);
```

More verbose than individual parameters but it's:

- **Extensible**: adding new field doesn't break existing handlers.
- **Self-documenting**: type is schema.
- **Reusable**: same event type usable by multiple signals.

Use when event has more than ~3 parameters or parameters might grow.

## Signal Chains and Order

Multiple handlers connected to same signal: called in order connected. Don't depend on order — fragile. Need ordering? Use intermediate signals or explicit sequencing.

```csharp
// Fragile: depends on connection order
health.Damaged += OnDamageHandler1;
health.Damaged += OnDamageHandler2;  // Runs after OnDamageHandler1

// Robust: handler1 emits a signal that handler2 listens to
health.Damaged += OnDamageHandler1;
// In OnDamageHandler1, after doing the work:
EmitSignal("DamageHandled");
// And:
this.DamageHandled += OnDamageHandler2;
```

Most cases: just don't depend on order. Each handler self-contained.

## Signal Propagation

Godot signals don't propagate up tree automatically. Child emits signal → only nodes explicitly *connected* receive it. Different from DOM events in web programming.

Want "bubble up" pattern? Wire manually: parent listens to child's signal, re-emits own signal grandparents can listen to.

```csharp
// Child:
[Signal] public delegate void ButtonClickedEventHandler();

// Parent:
public override void _Ready()
{
    var button = GetNode<MyButton>("Button");
    button.ButtonClicked += () => EmitSignal(SignalName.ChildButtonClicked);
}

[Signal] public delegate void ChildButtonClickedEventHandler();
```

Verbose. Most cases: direct connection from grandparent to child (using `[Export]` references or scene-unique names) cleaner. Only re-emit when grandparent really shouldn't know about child.

## Anti-Patterns

- **String-based connection** (`Connect("name", ...)`) when typed `+=` available. Loses compile-time checking.
- **Forgetting to disconnect** when listener might outlive emitter. Memory leaks.
- **Disconnecting in wrong place.** `_Ready` connects, `_ExitTree` disconnects. Don't connect twice without disconnecting.
- **God event bus.** Every signal through one autoload. Hides which node owns which event; coupling pretends to be decoupling.
- **Signals as substitute for direct calls.** Parent commanding child? Use method call. Signals are for *events*, not indirection for its own sake.
- **Direct method calls when signal would do.** Child needs to tell parent something? Emit signal — don't call up tree.
- **`GetParent<T>()` to call method up tree.** Couples child to parent's type.
- **Lambda connections to long-lived nodes** without storing lambda. Can't disconnect later.
- **Connecting to node in `_EnterTree` instead of `_Ready`.** Node's children might not be ready yet.
- **Multiple connections to same handler.** Easy accidentally; produces duplicate calls. Disconnect first if reconnecting.
- **Signal with too many parameters.** Passing 6 things? Make resource event payload.
- **Depending on connection order.** Fragile.
- **Propagating signals manually up many levels.** Need it? Restructure: listener probably wants direct access via `[Export]` or scene-unique name.
- **Using signals where method call is fine, just because "decoupling is good".** Signals have small overhead; hot paths: direct method calls faster and clearer.
- **Forgetting `EventHandler` suffix on delegate.** Won't compile.
- **Forgetting `[Signal]`.** Just delegate type, not signal.

## Related

- [godot-fundamentals.md](godot-fundamentals.md) — what signals are, foundationally
- [scenes-and-instancing.md](scenes-and-instancing.md) — wiring scenes together
- [nodes-and-architecture.md](nodes-and-architecture.md) — broader architectural patterns
- [godot-anti-patterns.md](godot-anti-patterns.md) — broader patterns to avoid

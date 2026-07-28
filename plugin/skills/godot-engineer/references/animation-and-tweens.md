# Animation and Tweens

Godot has three different ways to animate things; most common Godot mistake is picking wrong one. Each tool has specific job; using `AnimationPlayer` when `Tween` would do is overengineering; using `Tween` when `AnimationTree` is right call is underengineering.

File is practical guide to picking right animation tool, using each well.

## The Three Tools

| Tool | Best for | Key trait |
|---|---|---|
| **`Tween`** | Short, code-driven, one-off animations: button hover, screen shake, UI fade-in | Created in code; runs once; auto-frees |
| **`AnimationPlayer`** | Authored animations: sprite frames, complex movements, cutscenes, anything you'd want a designer to edit | Lives in the scene; visual editor; reusable |
| **`AnimationTree`** | State-machine-driven animation playback: character animation with states (idle, run, jump, attack) and blending | Wraps `AnimationPlayer`; handles transitions |

Decision tree:

1. **One-shot effect triggered by code (button hover, damage flash, panel sliding in)?** → `Tween`.
2. **Authored animation edited in editor (cutscene, complex sequence, sprite animation)?** → `AnimationPlayer`.
3. **Character with multiple animation states needing blending (idle → walk → run, with crossfades)?** → `AnimationTree` driving `AnimationPlayer`.

In doubt: start with `Tween`. Simplest; upgrade later.

## `Tween`

`Tween` interpolates property from current value to target value over time. Right tool for code-driven animation.

### Basic usage

```csharp
public override void _Ready()
{
    var tween = CreateTween();
    tween.TweenProperty(this, "position", new Vector2(500, 300), 1.0f);
}
```

Creates tween moving node's position from current value to (500, 300) over 1 second.

Things to notice:

- **`CreateTween()`** is method on `Node`. Returns `Tween` parented to this node, auto-frees when node freed.
- **`TweenProperty(target, property, value, duration)`** most common method. Property name is string ("position", "modulate", "scale").
- **Tween runs immediately** — no `Play()` call needed.

### Easing and transitions

Default: linear interpolation. More natural animations: set easing curve and transition type:

```csharp
var tween = CreateTween();
tween.TweenProperty(this, "position", target, 1.0f)
    .SetEase(Tween.EaseType.Out)
    .SetTrans(Tween.TransitionType.Cubic);
```

Available transition types: `Linear`, `Sine`, `Quint`, `Quart`, `Quad`, `Expo`, `Elastic`, `Cubic`, `Circ`, `Bounce`, `Back`, `Spring`. Each combinable with easing direction (`In`, `Out`, `InOut`).

Useful default for most game animations: `EaseType.Out` with `TransitionType.Cubic` — snappy but natural.

### Sequencing and parallel

Tweens chain steps:

```csharp
var tween = CreateTween();
tween.TweenProperty(panel, "position:x", 100, 0.5f);  // Move right
tween.TweenInterval(0.2f);                             // Wait 0.2s
tween.TweenProperty(panel, "modulate:a", 0, 0.3f);     // Fade out
tween.TweenCallback(Callable.From(() => panel.QueueFree())); // Cleanup
```

Default: steps run sequentially. Parallel: mark tween as parallel or use `Parallel()`:

```csharp
var tween = CreateTween();
tween.SetParallel(true);
tween.TweenProperty(node, "position:x", 100, 1.0f);
tween.TweenProperty(node, "modulate:a", 0.5f, 1.0f);
tween.TweenProperty(node, "rotation", Mathf.Pi, 1.0f);
// All three run simultaneously
```

Or, mix parallel and sequential:

```csharp
var tween = CreateTween();
tween.TweenProperty(node, "position:x", 100, 1.0f);  // Sequential
tween.Parallel().TweenProperty(node, "modulate", new Color(1, 0, 0), 1.0f); // Parallel with the previous
tween.TweenProperty(node, "scale", new Vector2(2, 2), 0.5f); // Sequential after both finish
```

### Sub-properties

Tween sub-property of property using colon:

```csharp
tween.TweenProperty(sprite, "modulate:a", 0.0f, 1.0f); // Fade alpha to 0
tween.TweenProperty(sprite, "position:x", 100, 0.5f);  // Move only X
tween.TweenProperty(sprite, "scale:y", 2.0f, 0.3f);    // Scale only Y
```

### Awaiting tweens

Tweens emit `Finished` signal when complete. With `await`, wait for them:

```csharp
public async void DoSequence()
{
    var tween = CreateTween();
    tween.TweenProperty(this, "position:x", 100, 1.0f);
    await ToSignal(tween, Tween.SignalName.Finished);

    // Continue after the tween finishes
    GD.Print("Tween done");
}
```

### Callbacks

`TweenCallback` calls method as part of sequence:

```csharp
tween.TweenProperty(door, "rotation", Mathf.Pi / 2, 1.0f);
tween.TweenCallback(Callable.From(() => GetNode<AudioStreamPlayer>("DoorOpen").Play()));
tween.TweenInterval(0.5f);
tween.TweenCallback(Callable.From(() => doorOpened = true));
```

### Killing tweens

Node freed mid-tween → tween auto-freed too (`CreateTween` parents it to calling node). Explicit cleanup: `tween.Kill()`.

Common pitfall: calling `CreateTween()` repeatedly (e.g., every button press) without killing previous tweens → stack tweens, all try to set same property. Result: jittery or wrong animation.

Fix:

```csharp
private Tween _currentTween;

private void OnHover()
{
    _currentTween?.Kill();
    _currentTween = CreateTween();
    _currentTween.TweenProperty(this, "scale", new Vector2(1.1f, 1.1f), 0.1f);
}
```

### Common Tween patterns

**Screen shake:**

```csharp
public async void Shake(float intensity, float duration)
{
    var camera = GetNode<Camera2D>("Camera2D");
    var startPos = camera.Offset;
    var elapsed = 0.0f;

    while (elapsed < duration)
    {
        camera.Offset = startPos + new Vector2(
            GD.RandRange(-intensity, intensity),
            GD.RandRange(-intensity, intensity)
        );
        await ToSignal(GetTree(), SceneTree.SignalName.ProcessFrame);
        elapsed += (float)GetProcessDeltaTime();
    }

    camera.Offset = startPos;
}
```

**Hit flash:**

```csharp
public void Flash()
{
    var tween = CreateTween();
    tween.TweenProperty(_sprite, "modulate", new Color(2, 2, 2), 0.05f);
    tween.TweenProperty(_sprite, "modulate", Colors.White, 0.1f);
}
```

**Slide-in panel:**

```csharp
public void Show()
{
    Visible = true;
    Position = new Vector2(-Size.X, Position.Y);
    var tween = CreateTween();
    tween.TweenProperty(this, "position:x", 0, 0.4f).SetTrans(Tween.TransitionType.Cubic).SetEase(Tween.EaseType.Out);
}
```

**Damage number popup:**

```csharp
public override void _Ready()
{
    var tween = CreateTween();
    tween.SetParallel(true);
    tween.TweenProperty(this, "position:y", Position.Y - 50, 0.6f).SetEase(Tween.EaseType.Out);
    tween.TweenProperty(this, "modulate:a", 0, 0.6f).SetDelay(0.2f);
    tween.Chain().TweenCallback(Callable.From(QueueFree));
}
```

## `AnimationPlayer`

`AnimationPlayer` plays *authored* animations — created in editor's animation panel. Animations can target any property of any node, with keyframes, curves, even method calls.

### When to use

- **Sprite frame animations** (though `AnimatedSprite2D` often easier)
- **Complex movement sequences** (chest opening, flag waving, NPC's idle gestures)
- **Cutscenes** with multiple things happening
- **Anything you want non-coder to edit**

### Setting up

Add `AnimationPlayer` node as child of whatever you want to animate. Open animation panel (bottom of editor; click `AnimationPlayer` node first to enable it). Click "Animation → New" to create animation.

While recording enabled (red dot button on animation panel), tweak properties of nodes in scene. Each tweak creates keyframe.

### Playing animations from code

```csharp
public partial class Player : CharacterBody2D
{
    private AnimationPlayer _anim;

    public override void _Ready()
    {
        _anim = GetNode<AnimationPlayer>("AnimationPlayer");
    }

    public override void _PhysicsProcess(double delta)
    {
        // ... movement code ...

        if (Velocity.X != 0)
            _anim.Play("walk");
        else
            _anim.Play("idle");
    }
}
```

`Play("name")` is idempotent — calling repeatedly with same name doesn't restart animation. Force restart: `Stop()` then `Play()`, or `Seek(0); Play()`.

### Method tracks

`AnimationPlayer` can call methods on nodes as part of animation. How you trigger sound effects, particle spawns, anything else at specific moment in animation.

Animation panel: right-click → "Add Track" → "Method Call Track" → pick node and method.

Useful for "play hit sound at frame 5 of attack animation" — timing authored in animation, not hardcoded in script.

### Awaiting animations

```csharp
_anim.Play("attack");
await ToSignal(_anim, AnimationPlayer.SignalName.AnimationFinished);
GD.Print("Attack animation finished");
```

Great for cutscene-style sequencing.

### Animation libraries

Projects with many animations across many characters: `AnimationLibrary` organizes animations into reusable libraries assignable to multiple `AnimationPlayer`s. Useful for project with 20 enemy types sharing animation set.

## `AnimationTree`

`AnimationTree` is state-machine-driven layer on top of `AnimationPlayer`. Handles transitions between animations with blending, parameters, visual state machine editor.

### When to use

- **Character animation with multiple states**: idle, walk, run, jump, attack, hurt, die — smooth blending between them.
- **Animations parameterized by inputs**: blend between walk-forward, walk-left, walk-right based on input direction.
- **Complex animation logic** that would be mess of `if/else` calls to `AnimationPlayer.Play()`.

### Setting up

1. Add `AnimationPlayer` with all individual animations (idle, walk, etc.).
2. Add `AnimationTree` node as sibling.
3. Set `AnimationTree`'s `Anim Player` to point at `AnimationPlayer`.
4. Set `Tree Root` to new `AnimationNodeStateMachine`.
5. Click `Active → True`.
6. Open `AnimationTree` in editor (tree icon at bottom). See visual state machine editor.

In state machine editor: add states (each state plays animation), connect with transitions, set transition conditions and parameters.

### Playing states from code

```csharp
public partial class Enemy : CharacterBody2D
{
    private AnimationTree _animTree;
    private AnimationNodeStateMachinePlayback _stateMachine;

    public override void _Ready()
    {
        _animTree = GetNode<AnimationTree>("AnimationTree");
        _stateMachine = (AnimationNodeStateMachinePlayback)_animTree.Get("parameters/playback");
    }

    public void StartAttack()
    {
        _stateMachine.Travel("attack");
    }

    public void StartIdle()
    {
        _stateMachine.Travel("idle");
    }
}
```

`Travel("state_name")` tells state machine to transition to named state, going through intermediate states required by transition graph. `Start("state_name")` immediately starts state without transitions.

### Blend trees

Within state, use blend trees to mix animations based on parameters. Most common: `BlendSpace2D` for directional blending.

Example: 2D blend space with `idle` at center, `walk_up`, `walk_down`, `walk_left`, `walk_right` at edges. Set blend position based on input:

```csharp
public override void _PhysicsProcess(double delta)
{
    var input = Input.GetVector("move_left", "move_right", "move_up", "move_down");
    _animTree.Set("parameters/movement/blend_position", input);
    Velocity = input * Speed;
    MoveAndSlide();
}
```

Animation smoothly blends between directional animations as input changes.

### `AnimationTree` vs hand-rolled state machine

Have hand-rolled state machine (see [nodes-and-architecture.md](nodes-and-architecture.md)) driving `AnimationPlayer`? Wonder whether to switch to `AnimationTree`.

| Use `AnimationTree` when... | Use hand-rolled when... |
|---|---|
| Animation transitions are the core of the state machine | The state machine governs more than just animations (gameplay logic, AI decisions) |
| You want a visual editor for transitions | You want full control in code |
| Blending between animations matters | Discrete animation playback is fine |
| The state machine is complex enough to benefit from a graph | The state machine is simple |

Many games use both: hand-rolled state machine for gameplay state, `AnimationTree` for animation state, gameplay state machine telling `AnimationTree` what to do.

## Other Animation Patterns

### `AnimatedSprite2D`

Simple sprite-frame animations (4-frame walk cycle, 6-frame idle): `AnimatedSprite2D` with `SpriteFrames` is easiest path. No `AnimationPlayer` needed.

```csharp
var sprite = GetNode<AnimatedSprite2D>("AnimatedSprite2D");
sprite.Play("walk");
```

Frames configured in inspector with `SpriteFrames` editor.

### `Particles2D` and `Particles3D`

Particle effects: use particle nodes. Not animations exactly but handle large numbers of moving sprites efficiently.

### Manual interpolation

Trivial cases: interpolate manually:

```csharp
public override void _Process(double delta)
{
    Position = Position.Lerp(_target, (float)delta * 5.0f);
}
```

Fine for simple smoothing (camera follow, UI smoothing). Anything more complex: prefer `Tween`.

## Animation Anti-Patterns

- **Using `Tween` for sprite frame animation.** Use `AnimatedSprite2D` or `AnimationPlayer`.
- **Using `AnimationPlayer` for hit flashes and screen shake.** Overkill — `Tween` is right.
- **Hand-coding state transitions** when `AnimationTree` would handle them with visual editor.
- **Calling `Play("idle")` every frame.** Idempotent for same animation, but flipping rapidly between two animations → unpredictable playback state.
- **Stacking tweens on same property** without killing previous one. Jittery results.
- **Tweens not parented to node.** `var tween = new Tween()` instead of `CreateTween()` → must add to tree manually, free manually.
- **Interpolating in `_PhysicsProcess` for visual effects.** Use `_Process` for visuals.
- **Animation method tracks calling methods that don't exist.** Silent failure; animation looks broken.
- **`AnimationPlayer` for cutscenes that never re-play.** Sometimes `Tween` sequence in code is fine.
- **Forgetting to set `AnimationTree.Active = true`.** Nothing plays.
- **Mixing `Tween` and `AnimationPlayer` on same property.** They fight; result unpredictable.
- **Not awaiting animations** when sequencing matters. Async/await with `ToSignal` much cleaner than callback chains.
- **Hardcoding animation timing in code** when it should be in animation file. Designers can't tweak without bothering engineer.

## Related

- [godot-fundamentals.md](godot-fundamentals.md) — `Node` lifecycle
- [nodes-and-architecture.md](nodes-and-architecture.md) — state machines
- [signals-and-events.md](signals-and-events.md) — awaiting tween/animation completion
- [godot-anti-patterns.md](godot-anti-patterns.md) — broader patterns to avoid

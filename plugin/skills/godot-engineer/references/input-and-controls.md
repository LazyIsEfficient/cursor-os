# Input and Controls

Input handling in Godot built around **Input Map** — indirection layer letting you define abstract "actions" (jump, attack, move_left), bind them to physical inputs (keys, mouse buttons, controller buttons, touch). Always go through actions, never key codes directly. What makes rebinding, controller support, touch control possible.

File is practical guide to input in Godot 4 with C#: setting up input map, polling vs event-driven input, controllers, touch, custom rebinding, gotchas.

## The Input Map

Define actions in **Project Settings → Input Map**.

Each action: give it name (`move_left`, `jump`, `attack`, `pause`), add inputs triggering it. Multiple inputs per action allowed: keyboard *and* gamepad button *and* mouse button. Action fires when *any* triggered.

Naming conventions:

- **`snake_case`** for action names. Godot's Input class GDScript-flavored; convention even in C# code.
- **Verbs for one-shot actions**: `jump`, `attack`, `interact`, `pause`.
- **Direction names for axes**: `move_left`, `move_right`, `move_up`, `move_down`. Use four directions even for 2D side-scrollers; thank yourself when adding menu navigation.
- **`ui_*` prefix for menu actions**: Godot has built-in UI actions (`ui_accept`, `ui_cancel`, `ui_left`, `ui_right`, `ui_up`, `ui_down`, `ui_focus_next`, `ui_focus_prev`). Use for menu and UI navigation; `Control` system handles automatically.

## Polling vs Event-Driven Input

Godot supports both styles; know when to use each.

### Polling (in `_PhysicsProcess` or `_Process`)

```csharp
public override void _PhysicsProcess(double delta)
{
    // Held key check
    var direction = Input.GetAxis("move_left", "move_right");

    // Just-pressed (one-shot) check
    if (Input.IsActionJustPressed("jump") && IsOnFloor())
    {
        Velocity = new Vector2(Velocity.X, JumpVelocity);
    }

    // Released this frame check
    if (Input.IsActionJustReleased("jump") && Velocity.Y < 0)
    {
        Velocity = new Vector2(Velocity.X, Velocity.Y * 0.5f); // Variable jump height
    }

    // Currently held check
    if (Input.IsActionPressed("crouch"))
    {
        // Crouching
    }
}
```

Four common methods:

- **`Input.IsActionPressed("name")`** — `true` if action currently held.
- **`Input.IsActionJustPressed("name")`** — `true` for one frame when action transitions released → pressed.
- **`Input.IsActionJustReleased("name")`** — `true` for one frame when released.
- **`Input.GetAxis("negative", "positive")`** — returns `-1`, `0`, or `1` (or between for analog input) based on which actions pressed.

Also **`Input.GetVector("left", "right", "up", "down")`** returning `Vector2`, useful for movement input — handles both keyboard and analog stick automatically.

### Event-driven (in `_Input` or `_UnhandledInput`)

```csharp
public override void _UnhandledInput(InputEvent @event)
{
    if (@event.IsActionPressed("jump"))
    {
        // Handle jump
    }
    else if (@event.IsActionPressed("interact"))
    {
        // Handle interact
    }
}
```

Two methods:

- **`_Input(event)`** — receives every input event, before UI processes it.
- **`_UnhandledInput(event)`** — receives input events not yet handled by UI nodes.

Most gameplay code: use `_UnhandledInput` so UI gets first dibs (player pressing Escape in menu shouldn't also pause game).

### When to use which

| Use polling when... | Use events when... |
|---|---|
| You're checking input every frame anyway (player movement, held actions) | The action only matters when it happens (one-shot triggers, menu input) |
| The check is part of physics or processing logic | The action is rare or unpredictable |
| You want continuous response (running, charging) | You're handling text input or special device events |

Player movement: **polling in `_PhysicsProcess`** right choice. One-off actions in menus: event-driven cleaner.

## Why Always Use Actions

Don't poll keys directly:

```csharp
// Wrong
if (Input.IsKeyPressed(Key.Space)) { ... }

// Right
if (Input.IsActionPressed("jump")) { ... }
```

Reasons:

- **Rebinding impossible** if code references specific keys. Players will want to rebind.
- **Controllers don't work** with key-based code.
- **Touch input doesn't fit** into key-based code.
- **Different keyboards** have different layouts; AZERTY users hit different key for "Space".
- **Action layer is one line of indirection** costing nothing, gaining everything.

Only legitimate use of `IsKeyPressed` directly: tools or debug code (developer key combo to spawn debug entities). Shipped gameplay: always actions.

## Movement Input Patterns

### 4-direction (top-down)

```csharp
public override void _PhysicsProcess(double delta)
{
    var input = Input.GetVector("move_left", "move_right", "move_up", "move_down");
    Velocity = input * Speed;
    MoveAndSlide();
}
```

### Side-scroller (with jump)

```csharp
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
```

### 3D first-person

```csharp
public override void _PhysicsProcess(double delta)
{
    var inputDir = Input.GetVector("move_left", "move_right", "move_forward", "move_back");
    var direction = (Transform.Basis * new Vector3(inputDir.X, 0, inputDir.Y)).Normalized();

    var velocity = Velocity;
    if (direction != Vector3.Zero)
    {
        velocity.X = direction.X * Speed;
        velocity.Z = direction.Z * Speed;
    }
    else
    {
        velocity.X = Mathf.MoveToward(velocity.X, 0, Speed);
        velocity.Z = Mathf.MoveToward(velocity.Z, 0, Speed);
    }

    if (!IsOnFloor())
        velocity.Y -= Gravity * (float)delta;

    if (Input.IsActionJustPressed("jump") && IsOnFloor())
        velocity.Y = JumpVelocity;

    Velocity = velocity;
    MoveAndSlide();
}
```

### Mouse look (3D)

```csharp
public override void _Ready()
{
    Input.MouseMode = Input.MouseModeEnum.Captured;
}

public override void _UnhandledInput(InputEvent @event)
{
    if (@event is InputEventMouseMotion motion && Input.MouseMode == Input.MouseModeEnum.Captured)
    {
        var camera = GetNode<Camera3D>("Camera3D");
        RotateY(-motion.Relative.X * MouseSensitivity);
        camera.RotateX(-motion.Relative.Y * MouseSensitivity);

        // Clamp pitch
        var rot = camera.Rotation;
        rot.X = Mathf.Clamp(rot.X, -Mathf.Pi / 2, Mathf.Pi / 2);
        camera.Rotation = rot;
    }

    if (@event.IsActionPressed("ui_cancel"))
    {
        Input.MouseMode = Input.MouseModeEnum.Visible;
    }
}
```

`Input.MouseMode = Captured` locks mouse to window, lets you read relative motion from `InputEventMouseMotion.Relative`. `Visible` releases it.

## Controller Support

Godot has good gamepad support out of box. Once actions defined and gamepad inputs added, code automatically works with controllers.

Specifics:

### Detecting connected controllers

```csharp
public override void _Ready()
{
    Input.JoyConnectionChanged += OnJoyConnectionChanged;

    // Check existing
    for (int i = 0; i < 4; i++)
    {
        if (Input.IsJoyKnown(i))
        {
            GD.Print($"Controller {i} connected: {Input.GetJoyName(i)}");
        }
    }
}

private void OnJoyConnectionChanged(long device, bool connected)
{
    if (connected)
        GD.Print($"Controller {device} connected: {Input.GetJoyName((int)device)}");
    else
        GD.Print($"Controller {device} disconnected");
}
```

### Analog stick deadzone

Adding joypad axis to action in input map: set **Deadzone** to about 0.2-0.3. Otherwise drift on analog sticks triggers action.

More precise control: use `Input.GetVector` with deadzone parameter:

```csharp
var input = Input.GetVector("move_left", "move_right", "move_up", "move_down", deadzone: 0.2f);
```

### Detecting input device for prompts

Common need: showing right button prompt depending on keyboard vs controller.

Track last input device used:

```csharp
public partial class InputDeviceTracker : Node
{
    public enum DeviceType { KeyboardMouse, Gamepad }
    public DeviceType LastDevice { get; private set; } = DeviceType.KeyboardMouse;

    [Signal] public delegate void DeviceChangedEventHandler(DeviceType newDevice);

    public override void _Input(InputEvent @event)
    {
        DeviceType? newDevice = @event switch
        {
            InputEventKey or InputEventMouseButton => DeviceType.KeyboardMouse,
            InputEventJoypadButton or InputEventJoypadMotion => DeviceType.Gamepad,
            _ => null
        };

        if (newDevice.HasValue && newDevice.Value != LastDevice)
        {
            LastDevice = newDevice.Value;
            EmitSignal(SignalName.DeviceChanged, (int)LastDevice);
        }
    }
}
```

UI prompts change based on latest device. Most games show keyboard prompts by default, switch to controller prompts when controller input detected.

## Touch Input

Mobile: Godot supports touch via `InputEventScreenTouch` and `InputEventScreenDrag`. Also enable **Project Settings → Input Devices → Pointing → Emulate Mouse from Touch** to map touches to mouse events automatically — useful for desktop UI ported to mobile.

Multi-touch detected by `index` on events:

```csharp
public override void _Input(InputEvent @event)
{
    if (@event is InputEventScreenTouch touch)
    {
        if (touch.Pressed)
            GD.Print($"Finger {touch.Index} touched at {touch.Position}");
        else
            GD.Print($"Finger {touch.Index} lifted at {touch.Position}");
    }
}
```

Most mobile games: right pattern is virtual on-screen controls — touch joysticks, touch buttons — implemented as `Control` nodes with own input handling. Or, with **Emulate Mouse from Touch** enabled, regular UI controls work.

## Custom Rebinding

Letting players rebind controls is non-trivial feature but important — accessibility, preference, competitive players all need it. Godot's input map designed to support it.

Basic pattern: player wants to rebind → capture next input event, replace action's bindings.

```csharp
public partial class RebindButton : Button
{
    [Export] public string ActionName { get; set; }
    private bool _waitingForInput = false;

    public override void _Ready()
    {
        UpdateLabel();
        Pressed += OnPressed;
    }

    private void OnPressed()
    {
        _waitingForInput = true;
        Text = "Press any key...";
    }

    public override void _UnhandledInput(InputEvent @event)
    {
        if (!_waitingForInput) return;

        if (@event is InputEventKey key && key.Pressed)
        {
            // Replace the action's bindings
            InputMap.ActionEraseEvents(ActionName);
            InputMap.ActionAddEvent(ActionName, key);

            _waitingForInput = false;
            UpdateLabel();
            GetViewport().SetInputAsHandled();
        }
        else if (@event is InputEventJoypadButton joy && joy.Pressed)
        {
            InputMap.ActionEraseEvents(ActionName);
            InputMap.ActionAddEvent(ActionName, joy);

            _waitingForInput = false;
            UpdateLabel();
            GetViewport().SetInputAsHandled();
        }
    }

    private void UpdateLabel()
    {
        var events = InputMap.ActionGetEvents(ActionName);
        if (events.Count > 0)
        {
            Text = events[0].AsText();
        }
    }
}
```

Save and load bindings as part of player's settings file (see [save-load-and-persistence.md](save-load-and-persistence.md)).

Real-world considerations:

- **Allow multiple bindings per action.** Players want both WASD and arrow keys bound to movement.
- **Detect conflicts.** Two actions bound to same key produces ambiguity; warn player.
- **Allow restoring defaults.** "Reset to default" button.
- **Don't allow rebinding `ui_*` actions.** Needed for menu navigation; player rebinds `ui_cancel` away → can't get back to menu.
- **Save bindings per device.** Rebinding gamepad shouldn't affect keyboard.

## Input in UI

`Control` nodes have own input handling. `_GuiInput` method called when input event targeted at this UI node:

```csharp
public partial class CustomButton : Control
{
    public override void _GuiInput(InputEvent @event)
    {
        if (@event is InputEventMouseButton mouse && mouse.Pressed && mouse.ButtonIndex == MouseButton.Left)
        {
            GD.Print("Custom button clicked");
            AcceptEvent();
        }
    }
}
```

UI focus and `ui_*` actions handle most things automatically (Tab between controls, Enter to activate, arrow keys to navigate). Use `_GuiInput` only for custom handling.

## Common Gotchas

### `ui_cancel` is `Escape` by default

Pressing Escape closes mouse capture, shows menu, etc. — because triggers `ui_cancel`. Don't override lightly.

### Held vs just-pressed

`IsActionPressed` returns `true` every frame action held, *including frame just pressed*. `IsActionJustPressed` is `true` for *exactly one frame*. Mixing up causes either missed inputs (just-pressed when you wanted continuous) or repeated inputs (just-pressed when you wanted one-shot).

### `_Process` vs `_PhysicsProcess` for input polling

Polling input in `_Process` fine for most things; `_PhysicsProcess` fine for things affecting physics. Catch: checking `IsActionJustPressed` in `_Process` *and* also doing something in `_PhysicsProcess` → might miss just-pressed frame because they don't run at same time.

Fix: poll input in *one* function, use from both contexts via member variable, or just consistently use `_PhysicsProcess` for input driving gameplay.

### Mouse position vs viewport coordinates

`InputEventMouseMotion.Position` in window coordinates. Game has non-default viewport (e.g. pixel art with integer scaling) → mouse position might not match world coordinates. Use `viewport.GetMousePosition()` or transform appropriately.

### Input handled by UI

`Control` node consumes input event → `_UnhandledInput` won't see it. This is *correct* — pressing button in menu shouldn't also fire player's attack. But confuses if debugging why action isn't reaching player.

Use `_Input` (sees everything) for debugging; check whether event being consumed by `Control`.

### Multiple input events per frame

Single physics frame can have multiple input events. Player presses and releases key within one frame (rare but possible) → you'll see both events. Don't assume one event per frame.

## Anti-Patterns

- **Polling raw keys** (`Input.IsKeyPressed`) instead of actions. Breaks rebinding and controller support.
- **Hardcoding controller layouts.** Different controllers have different button positions; use action names.
- **No deadzone on analog sticks.** Drift triggers actions constantly.
- **Mixing `IsActionPressed` and `IsActionJustPressed`** confusingly. Pick right one for each case.
- **Custom touch controls without considering desktop.** Or vice versa: desktop controls not working on touch.
- **Forgetting to call `AcceptEvent()`** when handling input in `Control`. Event propagates, handled twice.
- **No way to rebind.** Ships with hardcoded controls; players can't customize.
- **Rebinding without persistence.** Player rebinds, restarts game, has to do again.
- **No conflict detection in rebinding.** Two actions bound to same key.
- **Rebinding `ui_*` actions.** Player can't navigate menus.
- **Mouse capture without escape.** Player can't get cursor back; has to alt-tab.
- **Not handling controller disconnect.** Player unplugs controller mid-game; game crashes or freezes.
- **`_Input` for things that should be `_UnhandledInput`.** Conflicts with UI.
- **`_UnhandledInput` for global hotkeys.** Should be `_Input` so they can't be eaten by UI.
- **`Input.GetActionStrength` for digital input.** Returns 0 or 1; use `IsActionPressed`. `GetActionStrength` for analog.
- **Handling input in non-active scenes.** Paused scene whose `_PhysicsProcess` still runs (because `ProcessMode` wrong) still polls input.

## Related

- [godot-fundamentals.md](godot-fundamentals.md) — `_Input`, `_UnhandledInput`, and lifecycle
- [physics-and-collision.md](physics-and-collision.md) — physics-driven input handling
- [ui-and-controls.md](ui-and-controls.md) — `Control` input and `ui_*` actions
- [save-load-and-persistence.md](save-load-and-persistence.md) — saving keybinds
- [godot-anti-patterns.md](godot-anti-patterns.md) — broader patterns to avoid

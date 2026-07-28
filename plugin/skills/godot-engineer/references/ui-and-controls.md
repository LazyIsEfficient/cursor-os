# UI and Controls

Godot's UI system is one of its strengths and one of its most-misunderstood subsystems. `Control` node, with anchors and containers, powerful enough to build complex interfaces — and confusing enough that many engineers spend hours fighting it before learning patterns.

File is practical guide to building UI in Godot 4 with C#. Most important thing to internalize: **don't fight the engine**. Godot's container system is good, anchor system is good, reinventing them almost always wrong.

## The Control System

`Control` is base class for all UI elements: buttons, labels, text inputs, panels, sliders, etc. Has properties most other nodes don't:

- **Position** and **size** in screen space (or relative to parent)
- **Anchors** (how it's positioned relative to parent)
- **Margins** / **offsets** (actual position computed from anchors and absolute offsets)
- **Min size** (minimum size layout system will give it)
- **Layout direction** (LTR/RTL for internationalization)
- **Theme** (visual styling)
- **Focus** (for keyboard/gamepad navigation)
- **Mouse filter** (whether it intercepts mouse events)

System built around idea you can lay out UI by:

1. Setting **anchors** describing where in parent the control sticks to
2. Setting **margins** describing offset from those anchors
3. Or, using **containers** (described below) laying out children automatically

First approach for free-floating UI elements; second for grids, lists, structured layouts. Both have place.

## Anchors and Margins

Anchor system best understood with picture, but verbal version: every `Control` has four anchor values (left, top, right, bottom), each between 0 and 1. Describe what *fraction* of parent the control's edges anchored to.

| Anchors | What it does |
|---|---|
| `left=0, top=0, right=0, bottom=0` | Top-left corner; size is fixed |
| `left=1, top=1, right=1, bottom=1` | Bottom-right corner; size is fixed |
| `left=0, top=0, right=1, bottom=1` | Stretches to fill the parent |
| `left=0.5, top=0.5, right=0.5, bottom=0.5` | Centered point; size is fixed |
| `left=0, top=0, right=1, bottom=0` | Stretches horizontally at the top |

**Layout** menu in inspector (icon at top of Control inspector) has presets: "Center", "Top Left", "Full Rect", "Center Top", etc. Set anchors for you. **Use presets** unless specific reason not to.

**Margins** (now called **offsets** in Godot 4) are absolute pixel offsets from anchor point. Anchors `(0, 0, 0, 0)` with offsets `(50, 50, 100, 80)` produces control 50 pixels from top-left, 50 pixels wide, 30 pixels tall.

In code:

```csharp
var control = GetNode<Control>("MyControl");
control.SetAnchorsPreset(Control.LayoutPreset.Center);
control.Position = new Vector2(0, 0);
control.Size = new Vector2(200, 100);
```

`SetAnchorsPreset` is equivalent of clicking layout preset in editor.

## Containers

`Container` is `Control` laying out children automatically. Container types:

| Container | Layout |
|---|---|
| **`HBoxContainer`** | Children in a horizontal row |
| **`VBoxContainer`** | Children in a vertical column |
| **`GridContainer`** | Children in a grid (configurable column count) |
| **`PanelContainer`** | Single child with a styled background |
| **`MarginContainer`** | Single child with configurable margins |
| **`CenterContainer`** | Centers a single child |
| **`AspectRatioContainer`** | Maintains an aspect ratio |
| **`HSplitContainer` / `VSplitContainer`** | Two children with a draggable split |
| **`ScrollContainer`** | Children that can scroll |
| **`TabContainer`** | Tabbed interface |
| **`HFlowContainer` / `VFlowContainer`** | Children that wrap |

Put `Control` inside container → container takes over its layout. Don't set anchors or position — set `Custom Minimum Size`, container does rest.

Typical menu:

```
PauseMenu (CanvasLayer)
└── Center (CenterContainer; full rect)
    └── Background (PanelContainer)
        └── VBox (VBoxContainer)
            ├── Title (Label)
            ├── ResumeButton (Button)
            ├── SettingsButton (Button)
            ├── HSeparator (HSeparator)
            └── QuitButton (Button)
```

Produces centered panel with column of buttons, regardless of screen size. No manual positioning. `VBoxContainer` lays out buttons; `PanelContainer` gives background; `CenterContainer` centers whole thing.

Single most useful UI insight: **stop manually positioning things; use containers**.

## Size Flags

Child in container has **Size Flags** controlling how container treats it:

- **Fill** — fill available space
- **Expand** — claim share of leftover space
- **Shrink Center / Begin / End** — alignment within cell

Example: `HBoxContainer` with label and button, default they take minimum size, sit on left. Want label to grow, button stay tight? Set label's `Horizontal Size Flags` to `Fill | Expand`, leave button at default.

Size flags confusing at first; experiment in editor to see effect.

## The Theme System

`Theme` system is Godot's CSS equivalent — way to style controls consistently across project.

### Setting up a theme

1. Create new `Theme` resource (`Resource → New Theme`).
2. In theme editor, add control type (e.g., `Button`).
3. Set styles for each state (Normal, Hovered, Pressed, Disabled, Focus).
4. Save theme to disk.
5. Apply to project in **Project Settings → GUI → Theme → Custom**, or to specific scenes by setting `Theme` property of root `Control`.

### Theme overrides

Individual controls can override theme for specific properties:

```csharp
var button = GetNode<Button>("MyButton");
button.AddThemeColorOverride("font_color", Colors.Red);
```

Use overrides sparingly. Per-instance; don't update when theme changes.

### What goes in a theme

- **Colors** — text colors, accent colors, background colors
- **Fonts** — fonts for different control types
- **Font sizes** — base size, header size, etc.
- **Constants** — spacing, margins, separator widths
- **Styleboxes** — backgrounds, borders, hover effects
- **Icons** — control-specific icons

Well-organized theme separates Godot game looking polished from one looking like raw default UI.

## StyleBox

`StyleBox` is styled rectangle used as background for controls. Two main types:

- **`StyleBoxFlat`** — flat color with optional border and corner radius. Most common.
- **`StyleBoxTexture`** — textured background using 9-slice. Good for stylized UI.

Theme editor: assign `StyleBox` to each state of each control type. Button's "Normal" state might have dark gray `StyleBoxFlat`; "Hovered" state slightly lighter; "Pressed" state darker again.

```csharp
// Creating a StyleBoxFlat in code (rarely needed; usually done in the editor)
var stylebox = new StyleBoxFlat
{
    BgColor = new Color(0.2f, 0.2f, 0.2f),
    BorderWidthLeft = 2,
    BorderWidthRight = 2,
    BorderWidthTop = 2,
    BorderWidthBottom = 2,
    BorderColor = new Color(0.5f, 0.5f, 0.5f),
    CornerRadiusTopLeft = 4,
    CornerRadiusTopRight = 4,
    CornerRadiusBottomLeft = 4,
    CornerRadiusBottomRight = 4,
};
```

## Common UI Components

### Buttons

```csharp
var button = GetNode<Button>("MyButton");
button.Pressed += OnButtonPressed;

private void OnButtonPressed()
{
    GD.Print("Clicked");
}
```

`Button` has variants: `TextureButton` (textures for each state), `CheckBox`, `CheckButton`, `OptionButton` (dropdown), `MenuButton` (dropdown menu).

### Labels

```csharp
var label = GetNode<Label>("ScoreLabel");
label.Text = "Score: 100";
```

Rich text (colors, font sizes, links within text): `RichTextLabel` with BBCode:

```csharp
var label = GetNode<RichTextLabel>("RichLabel");
label.Text = "[color=red]Critical hit![/color] [b]100[/b] damage";
label.BbcodeEnabled = true; // (Default in Godot 4)
```

### Inputs

`LineEdit` for single-line text input, `TextEdit` for multi-line.

```csharp
var input = GetNode<LineEdit>("NameInput");
input.TextSubmitted += OnNameSubmitted;
input.TextChanged += OnNameChanged;

private void OnNameSubmitted(string newText) { ... }
private void OnNameChanged(string newText) { ... }
```

### Sliders

```csharp
var volumeSlider = GetNode<HSlider>("VolumeSlider");
volumeSlider.MinValue = 0;
volumeSlider.MaxValue = 1;
volumeSlider.Step = 0.01;
volumeSlider.Value = 0.5;
volumeSlider.ValueChanged += OnVolumeChanged;

private void OnVolumeChanged(double newValue)
{
    AudioServer.SetBusVolumeDb(0, Mathf.LinearToDb((float)newValue));
}
```

### Progress bars

```csharp
var healthBar = GetNode<ProgressBar>("HealthBar");
healthBar.MinValue = 0;
healthBar.MaxValue = 100;
healthBar.Value = currentHealth;
```

Custom-styled health bar (gradient, animated, etc.): often `TextureProgressBar` right choice.

## Focus and Keyboard Navigation

Godot's `Control` system has built-in focus management. Keyboard or controller: player can `Tab` between focusable controls, press `Enter` to activate, etc. Works automatically — but requires UI set up correctly.

`ui_*` actions handle navigation by default:

- `ui_focus_next` (Tab) — focus next control
- `ui_focus_prev` (Shift+Tab) — focus previous control
- `ui_accept` (Enter, Space) — activate focused control
- `ui_cancel` (Escape) — back / dismiss
- `ui_left`, `ui_right`, `ui_up`, `ui_down` — directional navigation

Each control has **Focus** properties:

- **Focus Mode** — None, Click, All. "All" means focusable via Tab.
- **Focus Neighbor** properties (Top, Left, Bottom, Right) — explicitly set next focusable control in each direction.

Controller-friendly menus: set focus neighbors so directional input always lands somewhere sensible.

```csharp
public override void _Ready()
{
    GetNode<Button>("ResumeButton").GrabFocus();
}
```

`GrabFocus()` puts focus on control programmatically. Common use: menu opens → focus first item.

## Connecting Game Logic to UI

Common pattern: game state changes; UI should update. Naive approach: game state knows about UI, updates it directly. Better approach: signals.

```csharp
// PlayerHealth.cs
public partial class PlayerHealth : Node
{
    [Signal] public delegate void HealthChangedEventHandler(int current, int max);

    [Export] public int Max { get; set; } = 100;
    public int Current { get; private set; }

    public override void _Ready()
    {
        Current = Max;
        EmitSignal(SignalName.HealthChanged, Current, Max);
    }

    public void TakeDamage(int amount)
    {
        Current = Math.Max(0, Current - amount);
        EmitSignal(SignalName.HealthChanged, Current, Max);
    }
}

// HUD.cs
public partial class HUD : CanvasLayer
{
    [Export] public PlayerHealth Health { get; set; }

    public override void _Ready()
    {
        Health.HealthChanged += OnHealthChanged;
        OnHealthChanged(Health.Current, Health.Max); // Initial update
    }

    private void OnHealthChanged(int current, int max)
    {
        var bar = GetNode<ProgressBar>("%HealthBar");
        bar.MaxValue = max;
        bar.Value = current;
    }
}
```

`PlayerHealth` doesn't know HUD exists. HUD subscribes to changes. Either replaceable or removable without touching other.

## Custom Drawing

Sometimes need `Control` drawing something custom — radar display, custom progress visualization, non-standard widget. Override `_Draw`:

```csharp
public partial class CustomBar : Control
{
    [Export] public float Value { get; set; } = 0.5f;

    public override void _Draw()
    {
        var size = Size;
        var fillRect = new Rect2(Vector2.Zero, new Vector2(size.X * Value, size.Y));
        DrawRect(new Rect2(Vector2.Zero, size), Colors.DarkGray);
        DrawRect(fillRect, Colors.Green);
    }

    public void SetValue(float value)
    {
        Value = Math.Clamp(value, 0, 1);
        QueueRedraw(); // Triggers _Draw to be called next frame
    }
}
```

`_Draw` only called when `QueueRedraw()` called — not running every frame for nothing. Available draw methods: `DrawRect`, `DrawCircle`, `DrawLine`, `DrawTexture`, `DrawString`, `DrawPolygon`, etc.

## Resolution and Scaling

Game needs to look right on multiple screen sizes. Godot supports via project-level stretch settings.

In **Project Settings → Display → Window**:

- **Viewport Width / Height** — your "base" resolution. Pick appropriate for your art.
- **Stretch Mode**:
  - `disabled` — no scaling; UI scales with window
  - `canvas_items` — UI scales smoothly to fit window (vector-friendly)
  - `viewport` — render at base resolution and scale (pixel-art-friendly, integer scaling possible)
- **Stretch Aspect**:
  - `ignore` — stretch to fit; can distort
  - `keep` — letterbox or pillarbox to maintain aspect ratio
  - `keep_width` / `keep_height` — extend in other dimension
  - `expand` — extend in both dimensions; UI must handle variable size

Typical 2D game with designed resolution (say, 1920x1080), want scaling to other resolutions: **stretch_mode = `canvas_items`, aspect = `keep`**.

Pixel art game at 320x180: **stretch_mode = `viewport`, aspect = `keep`**.

## Internationalization (i18n)

Godot has built-in i18n support via `tr()` (GDScript) or `Tr()` (C#):

```csharp
label.Text = Tr("MAIN_MENU_PLAY");
```

Translation key `"MAIN_MENU_PLAY"` looked up in project's translation files (CSV or PO format). Set active locale via `TranslationServer.SetLocale("fr")`.

UI supporting multiple languages:

- **Use translation keys, not literal strings.** Even if only shipping English now.
- **Allow space for translation expansion.** German 30% longer than English; some languages double length. Don't design buttons fitting "OK" exactly.
- **Right-to-left layout support.** `Control` has `Layout Direction` property. Some languages need this set.
- **Test with "long string" locale** during development to catch overflow issues.

## Common UI Patterns

### Dialog box

```
Dialog (CanvasLayer)
└── Background (ColorRect, full rect, dark transparent)
    └── Center (CenterContainer)
        └── Box (PanelContainer)
            └── Margin (MarginContainer)
                └── VBox (VBoxContainer)
                    ├── Title (Label)
                    ├── Message (Label)
                    └── Buttons (HBoxContainer)
                        ├── OK (Button)
                        └── Cancel (Button)
```

### HUD

```
HUD (CanvasLayer)
├── TopLeft (Control, layout: Top Left)
│   └── HealthBar (ProgressBar)
├── TopRight (Control, layout: Top Right)
│   └── ScoreLabel (Label)
└── BottomCenter (Control, layout: Center Bottom)
    └── ObjectiveLabel (Label)
```

### Settings menu

```
Settings (PanelContainer)
└── VBox (VBoxContainer)
    ├── Title (Label)
    ├── TabContainer
    │   ├── Audio (VBoxContainer)
    │   │   ├── MasterVolume (HSlider)
    │   │   └── MusicVolume (HSlider)
    │   ├── Video (VBoxContainer)
    │   │   ├── Fullscreen (CheckBox)
    │   │   └── Resolution (OptionButton)
    │   └── Controls (VBoxContainer)
    │       └── (rebind buttons)
    └── HBox (HBoxContainer)
        ├── Cancel (Button)
        └── Apply (Button)
```

## Anti-Patterns

- **Manually positioning everything.** Containers exist for reason.
- **Hardcoding screen sizes.** Use anchors, containers, stretch settings.
- **Reinventing theme system.** Use Godot's; covers most cases.
- **Reinventing controls** (custom buttons, custom labels) when built-ins would do.
- **Per-instance theme overrides everywhere** instead of theme types. Theme becomes irrelevant.
- **Plain text strings** instead of translation keys. Ships in one language only.
- **Mixing units.** Some controls in pixels, others in percentages. Confusing layout.
- **No focus mode for controller-friendly menus.** Player can't navigate with gamepad.
- **`MouseFilter` set to `Pass` on big invisible panels.** They block clicks to controls beneath.
- **`MouseFilter` set to `Stop` on labels that should be clickable through.** They eat clicks meant for buttons.
- **UI in world space, not in `CanvasLayer`.** UI scrolls with camera.
- **Multiple `CanvasLayer`s with same layer index.** Order unpredictable.
- **`get_node` paths in UI scripts.** Use `[Export]` references or `%UniqueName`.
- **Animating UI in `_PhysicsProcess`.** Use `_Process` or `Tween`.
- **Updating UI from `_Process`** when event would do. Polling wastes work.
- **Tightly coupling game logic to UI.** Use signals; game state shouldn't know about HUD.
- **Custom drawing every frame** without `QueueRedraw`. `_Draw` only called when needed.
- **Long strings** overflowing buttons in other languages. Test with longer text.

## Related

- [godot-fundamentals.md](godot-fundamentals.md) — `Control`, `CanvasLayer`, focus
- [signals-and-events.md](signals-and-events.md) — connecting game state to UI via signals
- [animation-and-tweens.md](animation-and-tweens.md) — animating UI elements
- [input-and-controls.md](input-and-controls.md) — input handling in UI
- ux-design — broader UX principles applying to game UI
- [godot-anti-patterns.md](godot-anti-patterns.md) — broader patterns to avoid

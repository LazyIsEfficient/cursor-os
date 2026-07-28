# Rendering and Shaders

Godot 4 introduced new renderer (Vulkan with three profiles: Forward+, Mobile, Compatibility), substantial improvement over Godot 3's GLES backend. File covers how Godot renders things, major concepts you need to engineer with, basics of shader work.

*Not* a graphics programming course. Practical level Godot engineer needs: how to use renderer well, how to write basic shaders when needed, how to avoid common performance and visual pitfalls.

## The Three Renderers

Godot 4 ships three rendering backends:

| Renderer | Best for | Limitations |
|---|---|---|
| **Forward+** (default) | Desktop, mid-to-high-end hardware, complex 3D scenes | Heavy on lower-end hardware; not great for mobile |
| **Mobile** | Mobile, lower-end hardware, simpler 3D scenes | Fewer rendering features (no global illumination, fewer lights, etc.) |
| **Compatibility** (formerly GLES2/3) | Web, very old hardware, when Vulkan isn't available | Most limited; older shading model |

Pick renderer in **Project Settings → Rendering → Renderer**. Per-platform overrides allowed — Forward+ on desktop, Mobile on mobile, Compatibility on web.

2D game: renderer choice mostly doesn't matter — 2D works similarly across all three. 3D: choice has real consequences. Pick based on target platforms.

## 2D Rendering

2D renderer conceptually simple: every visible 2D node drawn in sorted order based on `z_index` and tree position. No real "depth buffer" — sorting based on layer and order.

Key concepts for 2D:

### `CanvasItem` and the draw order

Everything visible in 2D inherits from `CanvasItem` (`Sprite2D`, `Label`, `Polygon2D`, `Line2D`, etc.). Drawn in tree order — earlier siblings under later siblings — with `z_index` as override.

Common pitfall: UI element drawn under sprite because sprite later in tree. Use `z_index` to control layering, or restructure scene.

### `CanvasLayer`

`CanvasLayer` creates *separate* drawing layer ignoring camera. Use for:

- HUD and UI (don't move with camera)
- Pause menus and overlays
- Transition effects
- Anything in screen space, not world space

```
Level (Node2D)
├── World (Node2D, contains the game world)
│   ├── Player
│   ├── Enemies
│   └── TileMap
└── HUD (CanvasLayer)
    └── Container (Control)
        ├── HealthBar
        └── ScoreLabel
```

### Sprites and atlases

Pixel art and 2D games with many sprites: **texture atlases** dramatically improve performance by reducing draw calls. Godot's importer can pack textures into atlases automatically, or use sprite sheets manually with `AtlasTexture`.

```csharp
[Export] public Texture2D Atlas { get; set; }

public override void _Ready()
{
    var atlasTexture = new AtlasTexture
    {
        Atlas = Atlas,
        Region = new Rect2(0, 0, 32, 32) // First 32x32 frame
    };
    var sprite = GetNode<Sprite2D>("Sprite2D");
    sprite.Texture = atlasTexture;
}
```

Animated sprites: `AnimatedSprite2D` with `SpriteFrames` (can use atlas) is standard.

### Pixel art settings

Pixel art games:

- **Project Settings → Rendering → Textures → Default Texture Filter → Nearest** (or per-texture in import settings)
- **Project Settings → Display → Window → Stretch → Mode → `viewport`** for integer scaling
- **Stretch → Aspect → `keep`** to preserve aspect ratio
- Set project's base resolution to target pixel art resolution (e.g., 320x180)

`viewport` stretch mode renders game at base resolution, scales result to window, giving crisp pixels. Right setup for any pixel art game.

### Lighting in 2D

Godot 4 has 2D lighting system: `PointLight2D`, `DirectionalLight2D`, `LightOccluder2D` for shadows. To use:

1. Set sprites' textures to have "normal map" if wanting directional lighting effects.
2. Add `PointLight2D` nodes for light sources.
3. Add `LightOccluder2D` nodes (with `OccluderPolygon2D` shape) where shadows should be cast.
4. Sprites and `CanvasItem`s have `Light Mask` property determining which lights affect them.

Simpler "darkness" effect: black `ColorRect` with `BackBufferCopy` and circular mask shader often faster than full 2D lighting.

## 3D Rendering

3D in Godot built around `Node3D` (formerly `Spatial`), familiar concepts:

- **`MeshInstance3D`** — displays 3D mesh.
- **`Material`** — how mesh's surface looks (color, texture, roughness, etc.).
- **`Light3D`** — light sources (`DirectionalLight3D`, `OmniLight3D`, `SpotLight3D`).
- **`Camera3D`** — what player sees.
- **`Environment`** — global rendering settings (sky, ambient, fog, post-processing).

Minimal 3D scene:

```
Main (Node3D)
├── Camera3D
├── DirectionalLight3D
├── WorldEnvironment (Node)
│   └── Environment (Sky, ambient, fog)
└── Floor (MeshInstance3D)
    └── BoxMesh
```

### Materials

Godot's `StandardMaterial3D` is PBR material with usual settings: albedo, metallic, roughness, normal, emission, etc. Assign textures to each property, tweak parameters in inspector.

More control: `ShaderMaterial` with custom shader (more on shaders below).

### Lighting models and global illumination

Godot 4's Forward+ renderer supports:

- **Real-time lights** with shadows (directional, omni, spot).
- **Voxel GI** (`VoxelGI` node) — global illumination via voxelization. Good quality, moderate cost.
- **SDFGI** (Signed Distance Field GI) — large-scale dynamic GI; good for outdoor scenes.
- **LightmapGI** — pre-baked lightmaps. Best quality, no runtime cost, only for static geometry.
- **Reflection probes** for local reflections.

Most projects: baked lightmaps right choice — best visual quality, lowest runtime cost. Real-time lights only for dynamic things.

### Environment

`WorldEnvironment` node holds `Environment` resource controlling:

- **Sky** — procedural sky, panorama, or solid color
- **Ambient light** — global ambient term
- **Fog** — distance-based fog
- **Tonemap** — color grading
- **Glow** (bloom) — emissive bloom
- **SSAO** — screen-space ambient occlusion
- **SSR** — screen-space reflections

Usually one `WorldEnvironment` per level. Tweak `Environment` resource for level's mood.

### Camera basics

```csharp
public partial class FollowCamera : Camera3D
{
    [Export] public Node3D Target { get; set; }
    [Export] public Vector3 Offset = new(0, 5, 10);
    [Export] public float Smoothness = 5.0f;

    public override void _Process(double delta)
    {
        if (Target == null) return;
        var desired = Target.GlobalPosition + Offset;
        GlobalPosition = GlobalPosition.Lerp(desired, (float)delta * Smoothness);
        LookAt(Target.GlobalPosition);
    }
}
```

Common camera bug: camera updates in `_PhysicsProcess` → stutter when framerate doesn't match physics rate. Camera updates belong in `_Process` for smooth visuals.

## Viewports

`Viewport` (or `SubViewport` in Godot 4) is separate rendering target. Use cases:

- **Render-to-texture** — render world to texture for use in materials or UI.
- **Split screen** — multiple viewports for multiplayer.
- **Mini-maps** — render level from above to `SubViewport`, display in HUD.
- **Cameras for cutscenes** — switch between cameras in different viewports.
- **Post-processing chains** — render to viewport, apply shader, render again.

Basic setup:

```
SubViewportContainer (Control, sizes the viewport)
└── SubViewport (Viewport)
    ├── Camera2D (or Camera3D)
    └── (the things to render)
```

`SubViewportContainer` displays rendered viewport as UI element.

## Shaders — The Basics

Godot's shading language (`gdshader`) similar to GLSL but with engine-specific extensions. Shaders written in `.gdshader` files (or inline in `ShaderMaterial.code`).

### When to write a shader

Most of time: don't need to. Standard materials handle most cases. Reach for shader when:

- Need *visual effect* standard material can't do (water ripples, dissolve, outline, etc.)
- Need *performance optimization* via custom rendering
- Need *procedural content* (procedural sky, procedural texture)
- Need *post-processing effect*

### Shader types

| Type | Used by | Purpose |
|---|---|---|
| **`spatial`** | `MeshInstance3D` materials | 3D rendering |
| **`canvas_item`** | `CanvasItem` materials (2D) | 2D rendering |
| **`particles`** | Particle systems | Per-particle logic |
| **`sky`** | `Sky` material | Procedural sky |
| **`fog`** | Volumetric fog | Volumetric fog |

### A simple 2D shader

Shader tinting sprite based on time:

```glsl
shader_type canvas_item;

uniform vec4 tint_color : source_color = vec4(1.0);
uniform float speed : hint_range(0.0, 10.0) = 1.0;

void fragment() {
    vec4 tex_color = texture(TEXTURE, UV);
    float pulse = sin(TIME * speed) * 0.5 + 0.5;
    COLOR = tex_color * mix(vec4(1.0), tint_color, pulse);
}
```

Save as `pulse.gdshader`. Apply in editor: select `Sprite2D` → Material → New ShaderMaterial → assign shader.

Language notes:

- **`shader_type canvas_item`** declares shader type. Required.
- **`uniform`** declares parameters settable from inspector or code.
- **`hint_range(min, max)`** is hint for editor (gives slider).
- **`source_color`** hint marks uniform as color (gets color picker).
- **`TIME`** is built-in: time since shader started.
- **`TEXTURE`** is sprite's texture (built-in for `canvas_item`).
- **`UV`** is texture coordinate (built-in).
- **`COLOR`** is output color (built-in).

### A simple 3D shader

Custom material with Fresnel rim light:

```glsl
shader_type spatial;

uniform vec4 albedo : source_color = vec4(1.0);
uniform vec4 rim_color : source_color = vec4(1.0);
uniform float rim_power : hint_range(0.0, 10.0) = 2.0;

void fragment() {
    ALBEDO = albedo.rgb;

    vec3 view_dir = normalize(VIEW);
    float fresnel = pow(1.0 - dot(NORMAL, view_dir), rim_power);
    EMISSION = rim_color.rgb * fresnel;
}
```

Shader gives 3D mesh rim light effect — edges glow more strongly than surfaces facing camera.

### Setting shader parameters from code

```csharp
public partial class ShimmerEffect : Sprite2D
{
    public override void _Ready()
    {
        var material = (ShaderMaterial)Material;
        material.SetShaderParameter("tint_color", new Color(1, 0.5f, 0));
        material.SetShaderParameter("speed", 3.0f);
    }

    public override void _Process(double delta)
    {
        var material = (ShaderMaterial)Material;
        material.SetShaderParameter("speed", Mathf.Sin((float)Time.GetTicksMsec() / 1000.0f) + 1.5f);
    }
}
```

### Common 2D shader effects

Shaders worth keeping around:

**Outline:**

```glsl
shader_type canvas_item;

uniform vec4 outline_color : source_color = vec4(1.0);
uniform float outline_width : hint_range(0.0, 10.0) = 2.0;

void fragment() {
    vec2 size = TEXTURE_PIXEL_SIZE * outline_width;
    float alpha = texture(TEXTURE, UV).a;
    if (alpha == 0.0) {
        float a = 0.0;
        a += texture(TEXTURE, UV + vec2(size.x, 0)).a;
        a += texture(TEXTURE, UV + vec2(-size.x, 0)).a;
        a += texture(TEXTURE, UV + vec2(0, size.y)).a;
        a += texture(TEXTURE, UV + vec2(0, -size.y)).a;
        if (a > 0.0) {
            COLOR = outline_color;
            return;
        }
    }
    COLOR = texture(TEXTURE, UV);
}
```

**Hit flash:**

```glsl
shader_type canvas_item;

uniform float flash_strength : hint_range(0.0, 1.0) = 0.0;
uniform vec4 flash_color : source_color = vec4(1.0);

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    COLOR = mix(tex, flash_color, flash_strength * tex.a);
}
```

Animate `flash_strength` with `Tween` for hit feedback.

**Dissolve:**

```glsl
shader_type canvas_item;

uniform sampler2D noise_texture;
uniform float dissolve : hint_range(0.0, 1.0) = 0.0;
uniform vec4 edge_color : source_color = vec4(1.0, 0.5, 0.0, 1.0);
uniform float edge_width : hint_range(0.0, 0.1) = 0.05;

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    float n = texture(noise_texture, UV).r;

    if (n < dissolve) {
        discard;
    } else if (n < dissolve + edge_width) {
        COLOR = edge_color;
    } else {
        COLOR = tex;
    }
}
```

Dissolving-into-particles effect: animate `dissolve` from 0 to 1.

## Performance Considerations

### 2D performance

- **Use atlases.** Dramatically reduces draw calls.
- **Use `MultiMeshInstance2D`** for many copies of same mesh (grass, debris).
- **Limit `Light2D` count.** Each adds cost; for darkness, shader often cheaper.
- **`Polygon2D` and `Line2D` slower than sprites.** Use sprites where possible.
- **`TileMap` highly optimized.** Use for tile-based 2D, not individual sprite nodes.

### 3D performance

- **Bake lighting** for static scenes. Real-time lights expensive; baked lighting free at runtime.
- **Use LODs** (`Level of Detail`). `MeshInstance3D` supports automatic LOD generation in Godot 4.
- **Use `MultiMeshInstance3D`** for many copies of same mesh (trees, rocks, bullets).
- **Frustum culling automatic** but only works if meshes have correct bounds. Set `Visibility AABB` if needed.
- **Avoid transparent surfaces** where possible. Transparency requires sorting, disables some optimizations.
- **Watch draw call count.** Use **Visual Profiler** to see draw calls per frame; keep low.

### Shader performance

- **`fragment` runs per pixel.** Keep cheap.
- **`vertex` runs per vertex.** Cheaper if you can move work there.
- **Texture lookups expensive.** Each `texture(...)` call costs.
- **`if` statements in shaders slow.** Prefer `mix`, `step`, `clamp` for branchless code.
- **`discard` disables some optimizations.** Use sparingly.

Deeper performance discussion: [performance-and-profiling.md](performance-and-profiling.md).

## Anti-Patterns

- **Default texture filter for pixel art.** Defaults to linear; pixel art needs nearest. Set per-import or in project settings.
- **Camera in `_PhysicsProcess`.** Stutters when framerate ≠ physics rate. Use `_Process`.
- **No `CanvasLayer` for HUD.** HUD scrolls with camera; looks broken.
- **Sprites without atlases** in project with hundreds of sprites. Massive draw call count.
- **Real-time lights everywhere in 3D.** Bake static ones.
- **Custom shaders when standard material would do.** Standard materials often more performant, cover most cases.
- **Heavy logic in `fragment` shader.** Move to vertex shader or CPU where possible.
- **Texture loads in shader uniforms changed every frame.** Sets new texture sampler; expensive. Pre-load and reuse.
- **`Polygon2D` for things that should be sprites.** Slower; use sprites.
- **No frustum culling on large meshes.** Set `Visibility AABB` correctly.
- **Transparent objects with wrong sort order.** Half-transparent things look broken.
- **Rendering world to `SubViewport` every frame** when it doesn't change. Cache result.
- **Multiple `WorldEnvironment` nodes.** Only one active; others wasted.
- **Forgetting to set rendering backend per platform.** Forward+ on mobile too heavy; Mobile on desktop unnecessarily limited.
- **Hand-writing shaders for things Godot's `StandardMaterial3D` already does.** Reinventing.

## Related

- [godot-fundamentals.md](godot-fundamentals.md) — `CanvasItem`, `Node3D`, viewports
- [animation-and-tweens.md](animation-and-tweens.md) — animating shader parameters
- [ui-and-controls.md](ui-and-controls.md) — UI rendering with `Control`
- [performance-and-profiling.md](performance-and-profiling.md) — rendering performance
- [exporting-and-platforms.md](exporting-and-platforms.md) — per-platform renderer choice
- [godot-anti-patterns.md](godot-anti-patterns.md) — broader patterns to avoid

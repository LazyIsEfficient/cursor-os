# Performance and Profiling

Game performance constrained by **frame budget**: time engine has to do everything between two consecutive frames shown to player. 60 FPS: 16.67ms. 120 FPS: 8.33ms. 30 FPS (often floor for "playable"): 33ms.

Inside budget, do *everything*: input, physics, AI, animation, rendering, audio, scripting, garbage collection. Over budget → dropped frame; consistently → visible stutter, unhappy players.

File is about working within budget — how to measure, where time goes, what to optimize, what *not* to optimize.

## The Cardinal Rule

> **Don't optimize what you haven't measured.**

Instinct of every engineer: "make it fast" by intuition. Instinct is wrong. Performance work without measurements is gambling: you spend time on things that *feel* slow, actual bottleneck stays unmeasured and unfixed.

Discipline:

1. **Establish measurement.** Before optimizing, know what frame time you have and what it should be.
2. **Profile to find bottleneck.** Don't guess. Profiler tells you where time goes.
3. **Optimize bottleneck.** Not second-most expensive thing. Actual bottleneck.
4. **Re-measure.** Confirm optimization actually helped, in real workload conditions.
5. **Stop when under budget.** Don't optimize past target; wasted time.

Engineers skipping step 2 — guessing instead of profiling — almost always optimize wrong thing.

## Frame Budget Math

Pick target framerate. Budget per frame is `1000 / target_fps` milliseconds.

| Target | Budget per frame |
|---|---|
| 30 FPS | 33.3ms |
| 60 FPS | 16.7ms |
| 120 FPS | 8.3ms |
| 144 FPS | 6.9ms |

Inside budget, time goes to (rough breakdown for typical 60 FPS game):

- **CPU game logic** (~5-8ms): scripts, AI, gameplay code
- **Physics step** (~1-3ms): collisions, body updates
- **Rendering setup** (~2-4ms): culling, draw call submission
- **GPU rendering** (~3-6ms): actual GPU drawing frame
- **Audio, input, OS overhead** (~1-2ms)

Not strict; different games have very different distributions. Heavy 3D scene: 10ms rendering, 2ms logic; heavy procedural generator: opposite.

Point: any single thing eating 5ms consumes third of frame budget. Get familiar with orders of magnitude.

## The Godot Profiler

Godot's built-in profiler is primary tool. Open in **Debugger → Profiler** while game running.

### What it shows

- **Frame time** — total time per frame, broken into segments
- **Function time** — how long each script function took
- **Process time** vs **Physics process time** — split by process function
- **Static memory** — memory used by Godot's static allocations
- **Dynamic memory** — memory allocated per frame

### How to use it

1. **Run game**. Reach situation you want to profile (complex scene, specific gameplay moment).
2. **Open profiler**. Click "Start" to begin profiling.
3. **Capture some frames**. Run ~10 seconds in situation of interest.
4. **Click "Stop"**. Scroll through captured frames.
5. **Sort by time**. Find worst frames; click into them.
6. **Drill down**. Profiler shows tree of function calls and costs. Find expensive ones.

Things to look for:

- **Functions taking a lot of time per call.** 5ms function called once a frame = bottleneck.
- **Functions called many times per frame.** 0.1ms function called 100 times = also bottleneck.
- **Variability between frames.** Function usually fast but sometimes slow → GC, allocations, or hitches.
- **Physics vs process split.** Physics dominant → optimize physics. Process dominant → optimize gameplay code.

## The Visual Profiler

Rendering performance: **Debugger → Visual Profiler** shows:

- **Render frame time**
- **Vertex count, draw calls, primitives drawn**
- **Sky / fog / SSAO / SSR cost**
- **Shadow rendering cost**

Game GPU-bound (rendering is bottleneck)? Visual profiler tells where GPU spends time. Fixes different from CPU optimizations: reduce draw calls, simplify shaders, reduce overdraw, bake lighting.

## Common CPU Bottlenecks

### Too much in `_Process` / `_PhysicsProcess`

Every node with `_Process` or `_PhysicsProcess` method costs time per frame. Hundreds or thousands of nodes → adds up.

Fix: **don't process when you don't need to**. Use `SetProcess(false)` and `SetPhysicsProcess(false)` on inactive nodes.

```csharp
public override void _Ready()
{
    SetProcess(false); // Off by default; turn on when needed
}

public void Activate()
{
    SetProcess(true);
}
```

Example: enemy far from player doesn't need AI processing every frame. Disable processing when out of range; re-enable when near.

### Allocation in hot paths

C# heap allocations trigger garbage collection. GC pauses short (~1-5ms typically) but visible. Allocations in `_Process` particularly bad — accumulate.

```csharp
// Bad: allocates a new array every frame
public override void _Process(double delta)
{
    var nearby = new List<Enemy>();
    foreach (var enemy in _allEnemies)
    {
        if (Position.DistanceTo(enemy.Position) < Range)
            nearby.Add(enemy);
    }
    UseNearby(nearby);
}

// Good: reuse a member array
private List<Enemy> _nearbyBuffer = new();

public override void _Process(double delta)
{
    _nearbyBuffer.Clear();
    foreach (var enemy in _allEnemies)
    {
        if (Position.DistanceTo(enemy.Position) < Range)
            _nearbyBuffer.Add(enemy);
    }
    UseNearby(_nearbyBuffer);
}
```

Other allocation sources to watch:

- **Lambda captures** that allocate
- **String concatenation** in loops (use `StringBuilder` or `string.Format`)
- **Boxing** (passing value type to method taking `object`)
- **`new Vector2(...)`** in hot paths fine (struct), but `new SomeReferenceClass(...)` not

### `GetNode<T>` in hot paths

`GetNode<T>("path")` does string lookup against scene tree. Once in `_Ready` fine; every frame in `_Process` wasteful.

```csharp
// Bad
public override void _Process(double delta)
{
    var label = GetNode<Label>("UI/Container/Label");
    label.Text = $"Score: {_score}";
}

// Good
private Label _label;

public override void _Ready()
{
    _label = GetNode<Label>("UI/Container/Label");
}

public override void _Process(double delta)
{
    _label.Text = $"Score: {_score}";
}
```

### String operations

String allocation in `_Process` common GC source. Update labels only when value changes:

```csharp
// Bad: allocates every frame
public override void _Process(double delta)
{
    _scoreLabel.Text = $"Score: {_score}";
}

// Good: only update when score changes
private int _lastScore = -1;

public override void _Process(double delta)
{
    if (_score != _lastScore)
    {
        _scoreLabel.Text = $"Score: {_score}";
        _lastScore = _score;
    }
}
```

Even better: don't poll. Use signal so label only updates when something actually changes.

### Inefficient algorithms

Sometimes bottleneck just O(n²) algorithm that should be O(n) or O(n log n). Examples:

- **Pairwise checks**: every entity checking every other entity for proximity, every frame.
- **Path search per frame**: re-running A* every frame instead of caching path.
- **Frequent sorting**: sorting large list every frame instead of maintaining sorted order.

Fix is algorithm-level: spatial partitioning, caching, different data structures. Profile first to confirm actually bottleneck before rewriting.

### Spatial partitioning

"Find nearby things" queries: spatial data structure (quadtree, grid, octree) dramatically faster than checking every entity:

```csharp
// O(n²) — checking every pair
foreach (var a in entities)
foreach (var b in entities)
    if (a.Position.DistanceTo(b.Position) < range)
        ...

// O(n) with a grid — only check nearby cells
foreach (var a in entities)
{
    var cell = (int)(a.Position.X / CellSize);
    foreach (var b in grid.GetNeighborsOf(a))
        if (a.Position.DistanceTo(b.Position) < range)
            ...
}
```

Godot has built-in spatial structures: `AStarGrid2D` for grid-based pathfinding, navigation server for navmesh pathfinding. Custom proximity queries: `Area2D`/`Area3D` with collision masks often right tool.

## Common GPU Bottlenecks

### Too many draw calls

Each visible thing typically generates one or more draw calls. Hundreds per frame fine; thousands starts to hurt.

Reductions:

- **Texture atlases** for 2D — one draw call per atlas instead of per sprite.
- **`MultiMeshInstance2D`/`3D`** for many copies of same mesh.
- **Static mesh batching** — Godot does some automatically; check visual profiler.
- **Instancing** for repeated geometry (trees, grass, debris).
- **TileMaps** for tile-based 2D — highly optimized.

### Overdraw

Overdraw = same pixel drawn multiple times in frame (transparent thing on top of opaque thing). High overdraw on mobile major performance hit.

Reductions:

- **Avoid stacked transparencies.** Each transparent layer is overdraw.
- **Use opaque rendering where possible.** Discard transparent pixels with `discard;` rather than blending.
- **Mind particles.** Particle systems with many overlapping transparent quads = overdraw nightmares.

### Expensive shaders

Shader complexity matters, especially fragment shaders running per pixel.

- **Texture lookups expensive.** Each `texture(...)` call costs.
- **Branching slow.** Use `mix`, `step`, `clamp` instead of `if`.
- **Loops slow.** Bounded loops OK; data-dependent loops bad.
- **Trigonometry expensive.** Pre-compute, use lookup tables, or cheaper approximations.

Complex effects: profile shader specifically — sometimes single expensive shader on full-screen quad is entire bottleneck.

### Shadow rendering

Shadows expensive. Each shadow-casting light costs ~as much as another full pass of scene.

- **Limit shadow-casting lights** to few key ones.
- **Use baked shadows for static scenes.**
- **Use shadow LOD** (lower-resolution shadows for distant objects).
- **Disable shadows** on small or unimportant objects.

### Post-processing

Each post-processing effect (SSAO, SSR, glow, FXAA) adds full-screen passes. Cheap individually but accumulate.

- **Disable on lower-quality settings.**
- **Use deliberately, not as defaults.**
- **Profile each one** to know cost on target hardware.

## Object Pooling

Things spawned and destroyed frequently (bullets, particles, damage numbers): object pooling avoids cost of `Instantiate`/`QueueFree` cycles and GC pressure.

```csharp
public partial class BulletPool : Node
{
    [Export] public PackedScene BulletScene { get; set; }
    [Export] public int InitialSize { get; set; } = 100;

    private Queue<Bullet> _available = new();

    public override void _Ready()
    {
        for (int i = 0; i < InitialSize; i++)
        {
            CreatePooled();
        }
    }

    private Bullet CreatePooled()
    {
        var bullet = BulletScene.Instantiate<Bullet>();
        AddChild(bullet);
        DeactivateBullet(bullet);
        bullet.LifetimeEnded += () => Return(bullet);
        return bullet;
    }

    public Bullet Spawn(Vector2 position, Vector2 direction)
    {
        Bullet bullet;
        if (_available.Count > 0)
            bullet = _available.Dequeue();
        else
            bullet = CreatePooled(); // Pool exhausted; grow

        ActivateBullet(bullet, position, direction);
        return bullet;
    }

    private void ActivateBullet(Bullet bullet, Vector2 position, Vector2 direction)
    {
        bullet.GlobalPosition = position;
        bullet.Direction = direction;
        bullet.SetProcess(true);
        bullet.SetPhysicsProcess(true);
        bullet.Visible = true;
    }

    private void DeactivateBullet(Bullet bullet)
    {
        bullet.SetProcess(false);
        bullet.SetPhysicsProcess(false);
        bullet.Visible = false;
    }

    private void Return(Bullet bullet)
    {
        DeactivateBullet(bullet);
        _available.Enqueue(bullet);
    }
}
```

When pooling pays off:

- **Many short-lived instances**: bullets, particles, debris, damage numbers.
- **High spawn rate**: dozens per second.
- **Measured GC pressure**: profile shows GC pauses correlated with spawning.

When pooling doesn't pay off:

- **Long-lived instances**: enemies living for minutes.
- **Low spawn rate**: few per second.
- **Different configurations**: each instance wildly different setup; pooling adds complexity without much win.

## When to Drop to Native Code

Really hot paths where C# isn't fast enough, options:

- **`unsafe` C#** — pointer arithmetic, manual memory layout, faster but harder.
- **`Span<T>` and `Memory<T>`** — zero-allocation slicing of arrays.
- **GDExtension (C++)** — native module exposing types to Godot. Fastest option, highest complexity.

Rarely needed. Considering them? Profile first to confirm C# code really is bottleneck. Often algorithmic improvement gives more speedup than dropping to C++.

## Mobile Performance

Mobile much more constrained than desktop. Things to know:

- **Frame budget same** (16.7ms at 60 FPS) but hardware slower → less to work with.
- **Thermal throttling**: mobile devices throttle when hot. Performance drops over long session.
- **Battery considerations**: minimize CPU/GPU work; consider 30 FPS instead of 60 to save power.
- **Renderer choice**: use Mobile renderer, not Forward+.
- **Texture compression**: use ASTC or ETC2 for mobile textures (not desktop's BC7).
- **Draw call budget smaller**: aim for hundreds, not thousands.
- **Overdraw more painful**: mobile GPUs tile-based; overdraw kills them.
- **Memory constrained**: aim under 1GB peak RAM.

Always test on real low-end device, not just dev phone. Cheap Android device is actual target for many players.

## Web Performance

Godot's web export real but constrained:

- **No threading** (mostly): web target limited multithreading support.
- **Memory capped**: ~2GB hard limit; less in practice.
- **Initial load time real**: WASM and assets all download. Keep project small.
- **Audio glitches**: web audio known weak spot.
- **Fewer rendering features**: use Compatibility renderer.

Web: optimize aggressively for size and load time. 200MB web game too large; aim under 50MB if possible.

## Profiling Workflow

Productive performance workflow:

1. **Define target framerate** and platform(s) it must hit.
2. **Build representative test scene** — level with realistic counts of enemies, particles, etc.
3. **Run on target hardware**. Not dev machine; real target.
4. **Establish baseline**. Current frame time? Where does it go?
5. **Identify bottleneck**. CPU vs GPU? Which function or pass?
6. **Make one change**. Targeted at bottleneck.
7. **Re-measure**. Helped? By how much?
8. **Repeat** until under budget.

Most common failure: making many changes at once, not knowing which helped. Always change one thing, measure, then change next.

## Anti-Patterns

- **Optimizing without measuring.** Wastes time on wrong things.
- **"Optimize as you go".** Don't know what's slow yet. Build it, profile it, then optimize.
- **Premature optimization.** Hours on micro-optimizations of code running once a minute.
- **`GetNode` in hot paths.** Cache references in `_Ready`.
- **Allocating in `_Process`.** GC pressure; visible hitches.
- **String operations in `_Process` without caching.** Allocates per frame.
- **Updating UI every frame** when event would do.
- **Processing inactive nodes.** Use `SetProcess(false)` to disable.
- **Real-time lights everywhere in 3D.** Bake static ones.
- **No texture atlases for 2D.** Massive draw call counts.
- **Shadows on every light.** Each shadow caster doubles render cost.
- **Custom shaders re-implementing what `StandardMaterial3D` does.** Reinventing for no reason.
- **Object pooling things that don't need it.** Adds complexity without measurable benefit.
- **Optimizing GPU when CPU is bottleneck (or vice versa).** Profile to find out which.
- **Targeting 60 FPS on 144 Hz monitor.** Vsync at 144 means smaller budget; target 144 or accept tearing.
- **Ignoring mobile/web performance until ship.** Discover problems too late to fix.
- **Different optimization on every commit.** Many small wins, no clear story; impossible to bisect regressions.
- **Optimizing past budget.** Wasted time; player doesn't notice.
- **Performance budgets nobody enforces.** Set number; check it; reject changes blowing it.

## Related

- [godot-fundamentals.md](godot-fundamentals.md) — `_Process` vs `_PhysicsProcess` budgets
- [physics-and-collision.md](physics-and-collision.md) — physics performance
- [rendering-and-shaders.md](rendering-and-shaders.md) — rendering performance
- [exporting-and-platforms.md](exporting-and-platforms.md) — per-platform performance
- [godot-anti-patterns.md](godot-anti-patterns.md) — broader patterns to avoid

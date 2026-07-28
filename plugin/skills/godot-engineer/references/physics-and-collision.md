# Physics and Collision

Godot's physics system is one of most-used parts of engine and one of most-misused. Get body type wrong, layer setup wrong, or process function wrong → jitter, missed collisions, falling through floors, bodies ignoring each other for no apparent reason.

File is about Godot 4's physics, in C#, both 2D and 3D — body types, collision system, right process function, patterns avoiding common pitfalls.

## The Three Physics Body Types

Godot has three main physics body types, in both 2D and 3D variants:

| Type | When to use | Movement |
|---|---|---|
| **`StaticBody2D` / `StaticBody3D`** | Things that don't move and other things collide with: walls, floors, static obstacles | None |
| **`RigidBody2D` / `RigidBody3D`** | Physics-driven objects: barrels, debris, ragdolls, anything that obeys physics laws naturally | Forces, impulses, gravity (engine controls) |
| **`CharacterBody2D` / `CharacterBody3D`** | Things you control programmatically with collision: players, most enemies, projectiles when you want precise control | Manual `MoveAndSlide()` (you control) |

Also `Area2D` / `Area3D` for detecting overlaps without solid collision (triggers, hit detection zones, pickup areas).

Single most common physics confusion: which body type for player. Answer almost always **`CharacterBody2D` / `CharacterBody3D`** — you want precise, programmatic control over player movement, not physics engine deciding when to slide and when to bounce.

## `CharacterBody2D` (and 3D)

Bread and butter of Godot character movement. Set `Velocity`, call `MoveAndSlide()`, engine handles collision response — sliding along walls, stopping at obstacles, etc.

Complete 2D player example:

```csharp
using Godot;

public partial class Player : CharacterBody2D
{
    [Export] public float Speed { get; set; } = 200.0f;
    [Export] public float JumpVelocity { get; set; } = -400.0f;
    [Export] public float Gravity { get; set; } = 980.0f;

    public override void _PhysicsProcess(double delta)
    {
        var velocity = Velocity;

        // Gravity
        if (!IsOnFloor())
            velocity.Y += Gravity * (float)delta;

        // Jump
        if (Input.IsActionJustPressed("jump") && IsOnFloor())
            velocity.Y = JumpVelocity;

        // Horizontal movement
        var direction = Input.GetAxis("move_left", "move_right");
        if (direction != 0)
            velocity.X = direction * Speed;
        else
            velocity.X = Mathf.MoveToward(velocity.X, 0, Speed);

        Velocity = velocity;
        MoveAndSlide();
    }
}
```

3D version structurally identical but uses `Vector3`:

```csharp
public partial class Player3D : CharacterBody3D
{
    [Export] public float Speed { get; set; } = 5.0f;
    [Export] public float JumpVelocity { get; set; } = 4.5f;

    public override void _PhysicsProcess(double delta)
    {
        var velocity = Velocity;

        if (!IsOnFloor())
            velocity.Y -= 9.8f * (float)delta;

        if (Input.IsActionJustPressed("jump") && IsOnFloor())
            velocity.Y = JumpVelocity;

        var inputDir = Input.GetVector("move_left", "move_right", "move_forward", "move_back");
        var direction = (Transform.Basis * new Vector3(inputDir.X, 0, inputDir.Y)).Normalized();

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

        Velocity = velocity;
        MoveAndSlide();
    }
}
```

Critical things to notice:

- **Everything in `_PhysicsProcess`**, not `_Process`. Wrong choice causes jitter.
- **`Velocity` is property of body**; `MoveAndSlide()` uses it.
- **`MoveAndSlide()` uses `delta` internally** — set `Velocity` in units per second, engine multiplies by physics delta. Don't multiply velocity by delta yourself.
- **Acceleration toward zero with `MoveToward`** gives smooth deceleration when input stops.
- **`IsOnFloor()`** is correct way to check if body grounded — not manually checking velocity.

## `_PhysicsProcess` vs `_Process`

Most consequential and most-misunderstood distinction in Godot.

| Method | Frequency | Purpose | Examples |
|---|---|---|---|
| **`_PhysicsProcess(delta)`** | Fixed (60Hz default) | Anything that interacts with physics or needs deterministic stepping | `MoveAndSlide`, `MoveAndCollide`, applying forces, raycasting against the physics world, AI decisions that affect movement |
| **`_Process(delta)`** | Variable (frame rate) | Anything visual or input-related that doesn't touch physics | UI updates, visual interpolation, polling input that doesn't affect physics, particle spawning, sound effects |

**Movement of any physics body goes in `_PhysicsProcess`. Always.** Doing it in `_Process` causes visual position to update at rendering rate (can differ from physics rate), producing jitter, inconsistent collision response.

Most common bug: tutorial says "in `_process`, move the player." Tutorial wrong (or about non-physics node). Physics bodies: `_PhysicsProcess`.

Subtle but important: **`delta` in `_PhysicsProcess` is fixed**. Default 60Hz → always `1.0/60.0 = 0.01667` seconds. Physics simulations deterministic across machines (same code, same inputs), critical for replay systems, networking, reproducibility.

**`delta` in `_Process` varies** with frame rate. Game at 144 FPS has smaller `_Process` delta than at 30 FPS. Use `delta` correctly when scaling things to time:

```csharp
// _Process: scale by delta for time-based smoothing
public override void _Process(double delta)
{
    var camera = GetNode<Camera2D>("Camera2D");
    var target = GetNode<Player>("Player").GlobalPosition;
    camera.GlobalPosition = camera.GlobalPosition.Lerp(target, 5.0f * (float)delta);
}
```

## `RigidBody2D` (and 3D)

Things that should obey physics naturally — barrels rolling, boxes stacking, debris flying. Engine controls body's position; you control forces and impulses.

```csharp
public partial class ExplodingBarrel : RigidBody2D
{
    public void Explode()
    {
        ApplyImpulse(new Vector2(0, -500), Vector2.Zero);
        // Spawn particles, play sound, etc.
    }
}
```

Things to know:

- **Don't set `GlobalPosition` directly** on `RigidBody`. Physics engine owns position. Teleport rigid body: use `SetDeferred` or set `GlobalTransform` (carefully).
- **Apply forces and impulses** to make it move. `ApplyImpulse` for one-shot pushes; `ApplyForce` for continuous forces.
- **Mass matters**. Heavier bodies move less per impulse. Set in inspector.
- **Use `_IntegrateForces` for fine control** — called by physics engine before body's state computed; lets you read/write body's `LinearVelocity`/`AngularVelocity` directly.

```csharp
public override void _IntegrateForces(PhysicsDirectBodyState2D state)
{
    // Custom physics tweaks here
    if (state.LinearVelocity.Length() > MaxSpeed)
    {
        state.LinearVelocity = state.LinearVelocity.Normalized() * MaxSpeed;
    }
}
```

Most game purposes: don't need `_IntegrateForces`. Apply impulses, let engine handle rest.

## `Area2D` (and 3D)

`Area`s detect overlaps without producing physical collision. Use for:

- **Hit detection** — sword's hit area, enemy's hurt area
- **Triggers** — region activating when player enters
- **Pickups** — area around item detecting player
- **Damage zones** — fire, poison gas, etc.

```csharp
public partial class HealthPickup : Area2D
{
    [Export] public int HealAmount { get; set; } = 25;

    public override void _Ready()
    {
        BodyEntered += OnBodyEntered;
    }

    private void OnBodyEntered(Node2D body)
    {
        if (body is Player player)
        {
            player.Heal(HealAmount);
            QueueFree();
        }
    }
}
```

`BodyEntered` signal fires when `PhysicsBody` enters area; `AreaEntered` fires when another `Area` enters. Pick one matching what you're detecting.

Common pattern: **hitbox vs hurtbox**:

- **Hitbox**: `Area` attached to attacking entity. Represents area where attack hits.
- **Hurtbox**: `Area` attached to defending entity. Represents area where entity can be hit.

Hitbox overlaps hurtbox → damage dealt:

```csharp
// Hitbox.cs (on the attacker)
public partial class Hitbox : Area2D
{
    [Export] public int Damage { get; set; }

    public override void _Ready()
    {
        AreaEntered += OnAreaEntered;
    }

    private void OnAreaEntered(Area2D area)
    {
        if (area is Hurtbox hurtbox)
        {
            hurtbox.TakeDamage(Damage);
        }
    }
}

// Hurtbox.cs (on the defender)
public partial class Hurtbox : Area2D
{
    [Signal] public delegate void DamagedEventHandler(int amount);

    public void TakeDamage(int amount)
    {
        EmitSignal(SignalName.Damaged, amount);
    }
}
```

Pattern decouples attacker from defender. Hitbox doesn't know type of thing it's hitting; hurtbox doesn't know type of thing that hit it. Each handles own concern.

## Collision Layers and Masks

Most common cause of "my collision isn't working": layers and masks set incorrectly.

Every physics body and area has:

- **`CollisionLayer`** — what *I am*. Bitmask of layers I exist in.
- **`CollisionMask`** — what *I detect/collide with*. Bitmask of layers I look for.

Two bodies interact if and only if **A's mask includes B's layer**. One-way relationship — A might detect B without B detecting A.

Example: 2D platformer, layers defined as:

| Bit | Layer name |
|---|---|
| 1 | Player |
| 2 | Enemies |
| 3 | Player Bullets |
| 4 | Enemy Bullets |
| 5 | Environment (walls, floors) |
| 6 | Pickups |

Then:

- **Player**: layer 1 (Player), mask 5 + 6 (collides with environment, detects pickups) — but you also want it hit by enemies and enemy bullets, so mask 2 + 4 + 5 + 6.
- **Enemy**: layer 2 (Enemies), mask 5 (collides with environment).
- **Player Bullet**: layer 3, mask 2 + 5 (hits enemies and walls).
- **Enemy Bullet**: layer 4, mask 1 + 5 (hits player and walls).
- **Environment**: layer 5, mask 0 (doesn't actively detect anything; other things detect it).
- **Pickup**: layer 6, mask 0 (player detects it).

Set in inspector, **Collision** section of any physics node.

**Name your layers** in **Project Settings → Layer Names → 2D Physics** (or 3D Physics). Bare bit numbers unreadable; named layers ("Player", "Enemy", "Environment") self-documenting.

## Collision Shapes

Every physics body and area needs `CollisionShape2D` or `CollisionShape3D` child node with shape resource. Common shapes:

| 2D | 3D |
|---|---|
| `RectangleShape2D` | `BoxShape3D` |
| `CircleShape2D` | `SphereShape3D` |
| `CapsuleShape2D` | `CapsuleShape3D` |
| `ConvexPolygonShape2D` | `ConvexPolygonShape3D` |
| `ConcavePolygonShape2D` | `ConcavePolygonShape3D` (use sparingly — slower) |

Tips:

- **Prefer simple shapes.** Circle or capsule much faster than complex polygon. Characters: capsule usually right in 3D; rectangle or circle in 2D.
- **One shape per body is default.** Can have multiple, but each adds collision cost.
- **Concave shapes only for static geometry.** `ConcavePolygonShape3D` for static environment meshes; on moving bodies slow and bug-prone.
- **`StaticBody`s with `CollisionShape`s** assembleable from multiple shapes for complex environments. Tile-based 2D: use `TileMap` instead, handles automatically.

## Raycasting

Line-of-sight checks, hit-scan weapons, queries against physics world: use raycasting.

Cleanest API is `PhysicsDirectSpaceState2D` / `3D` via world's `DirectSpaceState`:

```csharp
public bool CanSeeTarget(Node2D target)
{
    var spaceState = GetWorld2D().DirectSpaceState;
    var query = PhysicsRayQueryParameters2D.Create(GlobalPosition, target.GlobalPosition);
    query.Exclude = new Godot.Collections.Array<Rid> { GetRid() }; // Don't hit self
    query.CollisionMask = 1 << 4; // Only check layer 5 (Environment)

    var result = spaceState.IntersectRay(query);
    return result.Count == 0; // No collision means clear line of sight
}
```

`result` is dictionary empty if no collision found, or contains `position`, `normal`, `collider`, `rid`, etc. if hit.

Frequent raycasts (e.g. player's vision cone): prefer `RayCast2D` / `RayCast3D` *nodes*, running cast every physics frame, caching result:

```
Player (CharacterBody2D)
└── GroundCheck (RayCast2D)
    Target Position: (0, 30)
    Enabled: true
```

```csharp
public override void _PhysicsProcess(double delta)
{
    var groundCheck = GetNode<RayCast2D>("GroundCheck");
    var isGrounded = groundCheck.IsColliding();
    // ...
}
```

Faster for queries happening every frame — engine batches them with physics step.

## `MoveAndCollide` vs `MoveAndSlide`

`CharacterBody` has two methods for movement:

- **`MoveAndSlide()`** — Move along velocity vector, sliding along walls when collisions occur. Standard way to move player.
- **`MoveAndCollide(motion)`** — Move by specific motion vector, stopping on collision, returning `KinematicCollision`. Finer control or projectiles.

```csharp
// Sliding along walls (player)
Velocity = new Vector2(speed * direction, Velocity.Y + gravity * delta);
MoveAndSlide();

// Stop-on-collision (projectile)
var motion = direction * speed * (float)delta;
var collision = MoveAndCollide(motion);
if (collision != null)
{
    var hitNode = collision.GetCollider();
    if (hitNode is Enemy enemy)
    {
        enemy.TakeDamage(damage);
    }
    QueueFree();
}
```

`MoveAndSlide` is what you want 95% of time for player-like characters. `MoveAndCollide` for one-shot collision queries where you want full control over response.

## Common Physics Patterns

### Coyote Time (Forgiving Jumps)

Small grace period after walking off ledge during which player can still jump. Makes platformers feel responsive.

```csharp
private float _coyoteTimer = 0;
private const float CoyoteTime = 0.1f;

public override void _PhysicsProcess(double delta)
{
    if (IsOnFloor())
        _coyoteTimer = CoyoteTime;
    else
        _coyoteTimer -= (float)delta;

    if (Input.IsActionJustPressed("jump") && _coyoteTimer > 0)
    {
        Velocity = new Vector2(Velocity.X, JumpVelocity);
        _coyoteTimer = 0;
    }
    // ... rest of physics
}
```

### Jump Buffering

Player presses jump slightly before landing → register jump on landing.

```csharp
private float _jumpBufferTimer = 0;
private const float JumpBufferTime = 0.1f;

public override void _PhysicsProcess(double delta)
{
    if (Input.IsActionJustPressed("jump"))
        _jumpBufferTimer = JumpBufferTime;
    else
        _jumpBufferTimer -= (float)delta;

    if (IsOnFloor() && _jumpBufferTimer > 0)
    {
        Velocity = new Vector2(Velocity.X, JumpVelocity);
        _jumpBufferTimer = 0;
    }
    // ... rest of physics
}
```

### One-Way Platforms

Platforms you jump *up* through but stand *on*. Use `OneWayCollisionDirection` on collision shape, or tile map's one-way property.

### Moving Platforms

`CharacterBody2D` automatically inherits motion from moving platform if platform properly set up. In 2D: set platform's `Sync To Physics` to true, use `CharacterBody2D` for platform itself. Player carried along.

## Determinism

Need deterministic physics (replays, lockstep multiplayer, reproducible saves)? Be aware:

- **Physics deterministic *if and only if*** all inputs and initial state same. Engine itself deterministic.
- **Floating-point math** mostly deterministic on same hardware/OS combo, but cross-platform determinism hard.
- **Use `_PhysicsProcess` for everything affecting state**, never `_Process`.
- **Don't use `Time.GetTicksMsec()`** for game logic; use frame counts.
- **Avoid randomness without seeded RNG.** `GD.Randf()` non-deterministic by default; use `RandomNumberGenerator` with explicit seed.

Most single-player games: don't need strict determinism. Lockstep multiplayer or replays: design for it from start.

## Anti-Patterns

- **Movement in `_Process` instead of `_PhysicsProcess`.** Jitter; bad collision response.
- **Setting `Velocity *= delta`** before calling `MoveAndSlide`. Engine handles delta; set velocity in units per second.
- **Setting `GlobalPosition` on `RigidBody`.** Fights physics engine; unpredictable behavior.
- **Using `RigidBody` for player.** You want precise control; physics-driven players floaty and unpredictable.
- **Using `StaticBody` for things that move.** They're "static" — moving them wrong.
- **Forgetting collision layers/masks.** Things don't collide; you can't figure out why.
- **Layers without names.** Project settings has "Layer Names" section. Use it.
- **Concave polygon shapes on dynamic bodies.** Slow; bug-prone. Use convex pieces or simpler shapes.
- **Too many collision shapes per body.** Each shape adds cost. Prefer fewer, simpler shapes.
- **Raycasting in tight loops in `_Process`.** Raycasts not free; cache results when possible.
- **Manually checking ground state instead of `IsOnFloor()`.** Often wrong about edge cases like slopes.
- **Skipping `IsOnFloor()` after `MoveAndSlide()`.** Some games check ground state *before* moving; you usually want it after.
- **Forgetting `IsInstanceValid` checks** when storing references to physics bodies that might be freed.
- **Treating `Area` as body and vice versa.** Areas detect; they don't collide. Bodies collide. Different.
- **Mixing `_IntegrateForces` with `MoveAndSlide`.** Different paradigms; pick one.
- **Hardcoding gravity on each body** instead of using project-wide setting (or shared gravity manager).
- **Ignoring `delta`.** `Velocity *= 0.95` per frame produces frame-rate-dependent behavior; use `Velocity = Velocity.Lerp(target, 0.95f * delta)` or similar.

## Related

- [godot-fundamentals.md](godot-fundamentals.md) — `_Process` vs `_PhysicsProcess` foundationally
- [input-and-controls.md](input-and-controls.md) — input handling driving physics
- [animation-and-tweens.md](animation-and-tweens.md) — animating physics bodies
- [performance-and-profiling.md](performance-and-profiling.md) — physics performance work
- [godot-anti-patterns.md](godot-anti-patterns.md) — broader patterns to avoid

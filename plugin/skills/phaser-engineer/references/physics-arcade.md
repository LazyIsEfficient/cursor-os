# Arcade Physics

Phaser 3 ships two physics engines. Arcade is default — fast, AABB-only (axis-aligned bounding boxes), good enough for overwhelming majority of 2D games. Matter is heavyweight option — full rigid-body simulation with rotation, joints, constraints, slopes — reach for it only when you've identified specific need Arcade can't meet.

This file is about Arcade. Covers bodies, body shapes, velocities, gravity, groups, collisions vs. overlaps, world bounds, tile collision, body-vs-GameObject position trap, debug rendering, variable timestep, gotchas biting every Phaser project.

## Arcade vs Matter — the decision

Pick **Arcade** when:

- Collisions between rectangles or circles — platformer player vs. tiles, top-down character vs. walls, bullet vs. enemy, classic arcade-style games.
- Rotation doesn't matter for collision response. (Can still spin sprite visually; body stays AABB.)
- Need many bodies cheaply — bullet hells, particle-like swarms, large enemy groups.
- Determinism across machines *not* hard requirement.

Pick **Matter** when:

- Sprites need to rotate *as part of collision* — boxes that tumble, ragdolls, vehicles that flip.
- Need joints, constraints, springs, motors, pinned objects.
- Need slopes working correctly without manual tile tricks.
- Want stacking dynamics (boxes piling up and settling).

**Default to Arcade.** Switching Arcade → Matter mid-project is substantial rewrite — different API, different semantics, different debug tools. If design ever needed Matter, you'd already know. Don't pre-emptively pick Matter "just in case." Arcade carries ~80% of Phaser games to ship; rest is deliberate choice.

Rest of file assumes Arcade. Matter deep dive out of scope for v1.

## Enabling Arcade physics

In game config:

```ts
import Phaser from 'phaser';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 600 },
      debug: false,
    },
  },
  scene: [GameScene],
};

new Phaser.Game(config);
```

Scene running in this game has access to `this.physics` — `Phaser.Physics.Arcade.ArcadePhysics` plugin. Use to spawn bodies, register colliders, set world bounds, etc:

```ts
class GameScene extends Phaser.Scene {
  create() {
    const player = this.physics.add.sprite(100, 100, 'player');
    // this.physics.add.sprite() = Sprite + dynamic Arcade body
  }
}
```

Scene that shouldn't have physics (pure menu, HUD overlay) doesn't get one — physics enabled per-scene by setting `physics` in scene's config or using `this.physics`. Plugin only spins up if used.

## Bodies — dynamic vs static

Every Arcade body is one of two kinds:

| Kind | Moves? | Pushed by collisions? | Use for |
|---|---|---|---|
| **Dynamic** | Yes (velocity, gravity) | Yes | Player, enemies, projectiles, anything that moves |
| **Static** | No | No (immovable) | Walls, floors, platforms, anything fixed |

Three ways to create body:

```ts
// 1. Sprite with a dynamic body — most common
const player = this.physics.add.sprite(100, 100, 'player');

// 2. Image with a dynamic body
const ball = this.physics.add.image(200, 200, 'ball');

// 3. Attach a body to an existing GameObject
const npc = this.add.sprite(300, 300, 'npc');
this.physics.add.existing(npc); // dynamic by default
this.physics.add.existing(npc, true); // true = static body
```

Dynamic body has `velocity`, `acceleration`, `drag`, `gravity`, `bounce`, `mass`, etc. Static body has none — just sits there, other bodies collide with it.

Useful flags on dynamic body:

```ts
const body = player.body as Phaser.Physics.Arcade.Body;

body.setImmovable(true);     // dynamic, but won't be pushed (e.g., moving platform)
body.setAllowGravity(false); // ignore the world's gravity (floating enemy, UI prop in physics world)
body.setAllowRotation(false);// don't rotate the visual when angularVelocity changes
body.setBounce(0.5, 0.8);    // x/y restitution on collision
body.setDrag(200, 0);        // velocity damping per second
```

`setImmovable(true)` is difference between "dynamic body responds to collisions normally" and "dynamic body acts like wall to other bodies but you can still move programmatically." Moving platforms are canonical use case: dynamic (so you can `setVelocity` on path) but immovable (so player doesn't shove sideways when landing).

## Body shape — `setSize` and `setOffset`

Default: physics body is size of sprite's texture frame. Almost never what you want for character — texture usually larger than visible character (idle frames have headroom, attack frames bulge, etc.).

`body.setSize(width, height)` changes body dimensions. `body.setOffset(x, y)` shifts body relative to texture's top-left:

```ts
// Texture frame is 64x64. The visible character is 24x40, sitting roughly
// centered horizontally with feet near the bottom of the frame.
const player = this.physics.add.sprite(100, 100, 'player');
player.body.setSize(24, 40);
player.body.setOffset(20, 24);
```

Two important rules:

1. **Call `setSize` and `setOffset` AFTER `setScale`.** Scaling re-derives body dimensions from texture, blowing away your offset. Order: spawn, scale, then size/offset.
2. **Test with debug rendering on.** Set `physics.arcade.debug: true` in game config (or toggle `this.physics.world.drawDebug = true` at runtime) — see body outline overlaid on sprite. Body is what collides; texture is decoration.

Sprites with multiple animation frames of different sizes still single, fixed body — Arcade does not animate body. Pick body fitting *gameplay* silhouette (usually slightly smaller than most generous frame); let texture be visually generous.

## Velocity, acceleration, drag, max velocity

Four levers producing "feels right" character movement:

```ts
const body = player.body as Phaser.Physics.Arcade.Body;
const cursors = this.input.keyboard!.createCursorKeys();
const ACCEL = 600;
const MAX_VX = 200;
const DRAG = 800;

body.setMaxVelocity(MAX_VX, 600);
body.setDragX(DRAG);

// in update():
if (cursors.left.isDown) {
  body.setAccelerationX(-ACCEL);
} else if (cursors.right.isDown) {
  body.setAccelerationX(ACCEL);
} else {
  body.setAccelerationX(0); // drag will pull velocity toward 0
}
```

Pattern: **input adds acceleration, drag decelerates when input stops, max velocity caps top end.** Produces movement feeling weighty and predictable — player doesn't snap from 0 to full speed, coasts slightly on key release.

Naive alternative — `body.setVelocity(direction * SPEED)` directly — works fine for arcade-feel games (Asteroids-style instant turning), but most modern games expect some easing. Pick pattern matching design.

Subtler note: **Arcade integrates velocity into position using engine's delta — do not multiply velocity by delta yourself**. `setVelocity(200, 0)` means "200 pixels per second." Engine handles per-frame math.

## Gravity

Three places gravity comes from, increasing specificity:

1. **World gravity** — set in game config (`physics.arcade.gravity`). Applies to every dynamic body not opting out.
2. **Per-body gravity** — `body.setGravity(x, y)` adds *to* world gravity. Body with world gravity `(0, 600)` and `setGravity(0, 200)` falls at 800.
3. **Disable per body** — `body.setAllowGravity(false)` opts body out of all gravity. Floating UI sprites, hovering enemies, particles you want to control manually.

Common pattern: world gravity for platformer player, disabled gravity for projectiles and flying enemies:

```ts
// in game config:
arcade: { gravity: { x: 0, y: 800 } }

// player: gets world gravity automatically
const player = this.physics.add.sprite(100, 100, 'player');

// flying enemy: opts out
const bat = this.physics.add.sprite(400, 200, 'bat');
bat.body.setAllowGravity(false);

// homing missile: gravity off, control velocity directly
const missile = this.physics.add.sprite(0, 0, 'missile');
missile.body.setAllowGravity(false);
```

## Groups — bulk operations and pooling

`Group` is container for GameObjects with shared behavior. Physics version, `this.physics.add.group(...)`, attaches Arcade bodies to every member.

```ts
const enemies = this.physics.add.group({
  classType: Phaser.Physics.Arcade.Sprite,
  defaultKey: 'enemy',
  maxSize: 50,
  runChildUpdate: true,
});

enemies.create(200, 100);
enemies.create(400, 100);
enemies.setVelocityX(-100); // sets velocity on all members
```

Win is bulk operations and **object pool pattern** — standard way to handle high-frequency spawn/despawn in Phaser:

```ts
class Bullets extends Phaser.Physics.Arcade.Group {
  constructor(scene: Phaser.Scene) {
    super(scene.physics.world, scene, {
      classType: Phaser.Physics.Arcade.Image,
      defaultKey: 'bullet',
      maxSize: 30,
    });
  }

  fire(x: number, y: number, vx: number, vy: number) {
    const bullet = this.getFirstDead(true, x, y, 'bullet') as
      Phaser.Physics.Arcade.Image | null;
    if (!bullet) return; // pool exhausted
    bullet.setActive(true).setVisible(true);
    bullet.body.reset(x, y);
    (bullet.body as Phaser.Physics.Arcade.Body).setVelocity(vx, vy);
  }

  recycle(bullet: Phaser.Physics.Arcade.Image) {
    bullet.setActive(false).setVisible(false);
    (bullet.body as Phaser.Physics.Arcade.Body).stop();
  }
}
```

Why pool: spawning `new Sprite()` per bullet allocates; allocations cause GC; GC causes frame hitches. 30-bullet pool created once at scene start, recycled forever → zero allocation in `update()`. Difference between smooth bullet hell and stuttering one.

`getFirstDead(createIfNull, x, y, ...)` returns inactive member or creates new one if pool not at `maxSize`. `getFirstAlive()` is mirror — useful for "is any enemy still alive?" checks.

## Static groups for level geometry

Walls, floors, platforms — anything not moving — go in static group:

```ts
const platforms = this.physics.add.staticGroup();
platforms.create(400, 568, 'ground').setScale(2, 1).refreshBody();
platforms.create(600, 400, 'platform');
platforms.create(50, 250, 'platform');
```

`refreshBody()` call after `setScale` is critical bit — static bodies don't auto-update from transforms, so must tell physics engine to recompute body dimensions. Forgetting this is #1 source of "my scaled-up platform has wrong collision size."

Tile-based levels: use tilemap layer with collision instead of static group of sprites. Static groups for hand-placed geometry; tilemaps for grid-aligned levels.

## Collisions vs overlaps

Two ways to register interaction between bodies:

```ts
// Collider: physically separates the bodies AND fires the callback
this.physics.add.collider(player, platforms);

// Overlap: fires the callback but does NOT separate the bodies
this.physics.add.overlap(player, coins, (p, coin) => {
  (coin as Phaser.GameObjects.GameObject).destroy();
  this.score += 1;
});
```

Rule: **collider for solid things that should bounce off each other; overlap for triggers that should just notify.** Player vs. wall = collider. Player vs. coin = overlap. Player vs. lava = either, depending on whether player should stand on lava or walk through it.

Both functions take same shape:

```ts
this.physics.add.collider(
  objectA,        // sprite, group, or array
  objectB,        // sprite, group, or array
  collideCallback, // fired after separation
  processCallback, // fired before separation; return false to skip
  callbackContext
);
```

`processCallback` is less-known but powerful tool. Runs *before* separation; lets you return `false` to skip collision entirely. Use for one-way platforms, faction filtering ("friendly bullets pass through allies"), conditional immunity:

```ts
this.physics.add.collider(player, platform, undefined, (p, plat) => {
  // Only collide if player is moving downward (one-way platform)
  return (p.body as Phaser.Physics.Arcade.Body).velocity.y > 0;
});
```

Group-vs-group: callback receives two specific colliding members, not groups:

```ts
this.physics.add.overlap(bullets, enemies, (bullet, enemy) => {
  bulletPool.recycle(bullet as Phaser.Physics.Arcade.Image);
  (enemy as Enemy).takeDamage(1);
});
```

Type callback parameters explicitly when possible; `@types/phaser` defaults are loose.

## World bounds

World is rectangle bodies live in. Default matches game size. Explicitly set:

```ts
this.physics.world.setBounds(0, 0, 1600, 600); // a wide level
```

Make body collide with world edges:

```ts
player.body.setCollideWorldBounds(true);
```

Get event when it does:

```ts
const body = player.body as Phaser.Physics.Arcade.Body;
body.setCollideWorldBounds(true);
body.onWorldBounds = true; // opt this body in to the event

this.physics.world.on('worldbounds', (
  hitBody: Phaser.Physics.Arcade.Body,
  up: boolean, down: boolean, left: boolean, right: boolean
) => {
  if (hitBody.gameObject === player && down) {
    // player hit the bottom of the world
  }
});
```

Event fires once per body per frame body is in contact with bound. Does *not* fire every frame body sits against wall.

## Tile collision

Arcade-tilemap pairing is workhorse for platformers and top-down games. Tiled-side workflow:

1. In Tiled, give collidable tiles custom property — typically boolean `collides: true`.
2. Export map as JSON.
3. Load in scene.
4. Tell layer which tiles collide.
5. Add collider between player and layer.

```ts
preload() {
  this.load.image('tiles', 'assets/tiles.png');
  this.load.tilemapTiledJSON('map', 'assets/map.json');
}

create() {
  const map = this.make.tilemap({ key: 'map' });
  const tileset = map.addTilesetImage('tileset', 'tiles')!;
  const ground = map.createLayer('Ground', tileset, 0, 0)!;

  // Three ways to mark which tiles collide; pick one:
  ground.setCollisionByProperty({ collides: true });
  // ground.setCollisionByExclusion([-1]); // every non-empty tile
  // ground.setCollision([1, 5, 7]);       // by tile index

  this.physics.add.collider(player, ground);
}
```

`setCollisionByProperty` is workflow you want for any non-trivial map. Marking specific tiles in Tiled is designer-friendly task; touching tile indices in code is brittle.

Two gotchas worth knowing:

- **One-tile-thick walls can jitter** when fast body squeezes against them. Phaser exposes `tileBias` on world (`this.physics.world.TILE_BIAS = 32`) — increase from default 16 if you see this. Bias is extra distance Arcade looks ahead when separating from tile.
- **Arcade can't do slopes natively.** Tiles are AABB. Want 45° ramp? Two options: stairstep as several tiles (cheap and ugly), or use Matter physics (correct but different engine). Most platformers: stairstepping plus generous body offset is fine.

## Body position vs GameObject position

`sprite.x` and `sprite.body.x` are not same number when there's an offset.

- `sprite.x` and `sprite.y` are GameObject's position (texture origin, default top-left or center depending on `setOrigin`).
- `body.x` and `body.y` are body's top-left corner in world space, which is `sprite.x - origin*width + offsetX`.

Flow each physics step is **GameObject → body**: body reads GameObject's position at start of step, integrates velocity, resolves collisions, writes new position back to GameObject. Reverse — setting `body.x` directly — almost never what you want; GameObject and body desynchronize.

Teleport body: set GameObject position, call `body.reset(x, y)`:

```ts
player.setPosition(100, 100);
(player.body as Phaser.Physics.Arcade.Body).reset(100, 100);
```

`reset` zeros velocity, re-syncs body to GameObject's position. Use for respawns, scene transitions, level resets — anywhere you'd otherwise be tempted to write `body.x = ...`.

## Debug rendering

Arcade debug renderer draws body outline (green for non-colliding, red/blue for sides currently in contact) on top of every sprite. Catch wrong body sizes, missing offsets, unexpected collisions just by looking.

Enable in game config:

```ts
physics: {
  default: 'arcade',
  arcade: { debug: true }
}
```

Toggle at runtime — useful for hotkey binding:

```ts
this.input.keyboard!.on('keydown-F1', () => {
  this.physics.world.drawDebug = !this.physics.world.drawDebug;
  if (!this.physics.world.drawDebug) {
    this.physics.world.debugGraphic.clear();
  }
});
```

Leave debug *off* in production. Renderer cheap but not free.

## The physics step — variable timestep, not fixed

Arcade physics runs once per render frame. `delta` it integrates with is whatever browser hands loop — varies with frame rate. 60 FPS: ~16.6 ms; 144 FPS: ~6.9 ms; struggling mobile device: might spike to 50+ ms.

Two practical implications:

- **Arcade is not deterministic across machines.** Same inputs on two computers produce different exact outcomes because deltas differ. Lockstep multiplayer, replays, reproducible test runs → need fixed step — Arcade doesn't natively offer. That's Matter physics + custom-loop conversation, out of scope.
- **Spike-induced tunneling.** 50 ms delta means 600-pixel/sec body moves 30 pixels in one step. Floor 32 pixels thick? That's the floor. Cap fall speed (`body.setMaxVelocity(0, 600)`) so single-frame spike can't punch through thin geometry.

Arcade internally clamps per-step delta to prevent worst tunneling cases, but clamp is generous. Don't rely on it.

## `update` vs collider callbacks — where gameplay reactions live

Common sloppy pattern: reading collision state inside `update()`:

```ts
// don't do this — bad
update() {
  if (player.body.touching.down) {
    this.canJump = true;
  }
}
```

Clean version uses callbacks for collision-driven reactions, `update` for input-driven state changes:

```ts
update(time: number, delta: number) {
  // input + movement intent
  if (cursors.left.isDown) body.setAccelerationX(-ACCEL);
  // ...
  if (jumpPressed && this.canJump) {
    body.setVelocityY(-400);
    this.canJump = false;
  }
}

// collision-driven reactions in callbacks
create() {
  this.physics.add.collider(player, ground, () => {
    this.canJump = true; // landed
  });

  this.physics.add.overlap(player, coins, (_, coin) => {
    (coin as Phaser.GameObjects.GameObject).destroy();
    this.score += 1;
  });
}
```

`body.touching` flags (`touching.up`, `touching.down`, `touching.left`, `touching.right`, and `body.blocked.*` for world-bounds contact) still useful — for wall-slide checks or coyote-time grounded detection — but reach for callbacks first when question is "what happened on this collision."

## Common Arcade gotchas

- **Setting `velocity` to 0 inside collide callback** — almost never what you want. Collider already separated bodies; zeroing velocity makes player feel sticky against walls. Let engine handle it.
- **Rotation does not rotate body.** `sprite.angle = 45` rotates sprite visually but AABB stays axis-aligned. Genuinely need rotated collision? Need Matter.
- **Body offset breaks after `setScale`.** Scaling re-derives body from texture, wiping your `setSize` and `setOffset` calls. Always: spawn → setScale → setSize/setOffset.
- **"My sprite falls through floor"** — cap fall speed with `setMaxVelocity(0, 600)` so it can't move further than floor's thickness in one step. Also check floor actually static body and you registered collider.
- **`this.physics.add.group()` makes dynamic bodies; use `staticGroup` for static** — easy to forget when prototyping. Symptom: "wall" group drifting under gravity.
- **Forgetting `refreshBody()` after `setScale` on static group member** — visual scales but body doesn't; collision happens in wrong place.
- **Calling `setSize` before `setScale`** — same root cause, opposite symptom: tuned body gets blown away.
- **Using overlap when you wanted collide** (or vice versa) — overlaps don't separate; want player to stop at wall? That's collider, not overlap.
- **Reading `body.x` to "where is my sprite"** — use `sprite.x`. Body has own coordinate including offset; you almost never want that.
- **Setting `body.x` directly** — desynchronizes body from GameObject. Use `body.reset(x, y)` for teleports.
- **Adding colliders inside `update()`** — colliders are persistent registrations, not per-frame calls. Add in `create()`, let them fire forever.

## Related

- [phaser-fundamentals.md](phaser-fundamentals.md) — `Game`, `Scene`, the loop, the loader, and how engine is structured around `update(time, delta)`.
- [scenes-and-flow.md](scenes-and-flow.md) — scene lifecycle and where physics lives across `init` / `preload` / `create` / `update`.
- [phaser-anti-patterns.md](phaser-anti-patterns.md) — broader Phaser anti-patterns, including registry-as-globals, allocations in `update`, and event leaks across scene restarts.
- [project-and-vite.md](project-and-vite.md) — project scaffold; physics plugin config lives in same `GameConfig` covered there.

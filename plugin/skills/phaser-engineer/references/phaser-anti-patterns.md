# Phaser Anti-Patterns

Catalog of common Phaser 3 + TypeScript mistakes. Point of naming them is recognition: when your code starts looking like one of these, you should spot it, name it, route around it.

Cross-cutting catalog. Subsystem-specific gotchas live in own reference files; pointers at bottom. Each entry same shape: **what it looks like**, **why it's bad**, **what to do instead**. Code is TypeScript, assumes Phaser 3.x.

## Architecture

### 1. The God Scene

**Looks like:**

```ts
export class GameScene extends Phaser.Scene {
  // 60+ fields: player, enemies, bullets, hud, pause menu,
  // inventory, dialogue, achievements, audio, save system...

  create() {
    this.setupPlayer();
    this.setupEnemies();
    this.setupHUD();
    this.setupInventory();
    this.setupDialogue();
    // ...500 more lines of wiring
  }

  update(time: number, delta: number) {
    // 800-line update method. Scrolling required.
  }
}
```

**Why it's bad:** every change touches same file. Two engineers can't work without merge conflicts. Every system has implicit dependencies on every other system because all read same `this.*` fields. Removing or replacing any piece impossible.

**Do instead:** scene is orchestrator, not implementation. Each system is plain TypeScript class scene composes. Independent surfaces (HUD, pause menu) become parallel scenes.

```ts
export class GameScene extends Phaser.Scene {
  private combat!: CombatSystem;
  private spawner!: EnemySpawner;
  private input!: PlayerInputController;

  create() {
    this.combat = new CombatSystem(this);
    this.spawner = new EnemySpawner(this);
    this.input = new PlayerInputController(this);
    this.scene.launch('HudScene'); // parallel scene
  }

  update(time: number, delta: number) {
    this.input.update(delta);
    this.combat.update(delta);
    this.spawner.update(time);
  }
}
```

Scene over ~600 lines is smell. Over 1,000 is refactor.

### 2. Cross-scene reach-in

**Looks like:**

```ts
// HudScene.update():
const game = this.scene.get('GameScene') as GameScene;
this.scoreLabel.setText(`Score: ${game.player.score}`);

// PauseScene:
this.scene.get('GameScene').player.health = 0;
```

**Why it's bad:** every reach-in couples two scenes. Renaming field in `GameScene` silently breaks `HudScene`. Data ownership becomes ambiguous. Worst case: consumer mutates state on scene mid-shutdown → confusing crash.

**Do instead:** push events through `this.events`, `this.game.events`, or `this.registry`. HUD listens; gameplay broadcasts.

```ts
// GameScene:
this.registry.set('score', newScore);

// HudScene:
this.registry.events.on('changedata-score', (_p: unknown, value: number) => {
  this.scoreLabel.setText(`Score: ${value}`);
});
```

One acceptable read-only pattern: HUD reading registry for display. HUD never *writes* gameplay state.

### 3. Registry as a god object

**Looks like:**

```ts
// scattered across 30 files:
this.registry.set('player_x', this.player.x);
this.registry.set('player_anim', 'walk_left');
this.registry.set('enemy_count', this.enemies.getLength());
this.registry.set('inventory_slot_3', 'health_potion');
// ... 50 more keys, used inconsistently
```

**Why it's bad:** registry meant for small set of cross-scene values (score, settings, current level). As dumping ground, no one knows what lives there or who owns it. `registry.get('player_x')` returns `unknown`. Two systems writing same key collide silently.

**Do instead:** define small list of keys that are genuinely cross-scene state. Type them. Keep system-internal state inside system.

```ts
export const RegistryKey = {
  Score: 'score',
  Lives: 'lives',
  HighScore: 'highScore',
  Settings: 'settings',
} as const;

this.registry.set(RegistryKey.Score, 0);
const score = this.registry.get(RegistryKey.Score) as number;
```

"Current player position" lives on player. Not in registry.

### 4. `any` for scene `data` payloads

**Looks like:**

```ts
export class LevelScene extends Phaser.Scene {
  init(data: any) {
    this.level = data.level;
    this.difficulty = data.diff; // typo? no one will know.
  }
}

this.scene.start('LevelScene', { level: 3, difficutly: 'hard' });
//                                          ^ typo, silently undefined
```

**Why it's bad:** `init`/`create` data flow through `any` → typos go unnoticed, field renames don't propagate. Two ends of contract drift. Half the bugs in scene transitions are silent typos in payload keys.

**Do instead:** type both ends.

```ts
export interface LevelInitData {
  level: number;
  difficulty: 'easy' | 'normal' | 'hard';
}

export class LevelScene extends Phaser.Scene {
  init(data: LevelInitData) {
    this.level = data.level;
    this.difficulty = data.difficulty;
  }
}

// compile error on typo:
this.scene.start('LevelScene', { level: 3, difficulty: 'hard' } satisfies LevelInitData);
```

### 5. Scene `key` typos

**Looks like:**

```ts
this.scene.start('GameSene'); // typo. silent failure.
this.scene.launch('HUD');     // capitalization mismatch with registered 'Hud'.
```

**Why it's bad:** scene keys are strings sprinkled across codebase. Phaser doesn't error on `start('GameSene')` — just doesn't start anything. You find out from playtesters.

**Do instead:** single source of truth. Use everywhere.

```ts
export const SceneKey = {
  Boot: 'BootScene',
  Preload: 'PreloadScene',
  Game: 'GameScene',
  Hud: 'HudScene',
} as const;

export class GameScene extends Phaser.Scene {
  constructor() { super(SceneKey.Game); }
}

this.scene.start(SceneKey.Game); // typo is now a TS error
```

## The Hot Path: `update()` and the Frame Budget

### 6. Allocations in `update()`

**Looks like:**

```ts
update(time: number, delta: number) {
  const target = new Phaser.Math.Vector2(this.player.x, this.player.y);
  this.scoreLabel.setText('Score: ' + this.score + ' | Combo: ' + this.combo);
  this.enemies.forEach(e => {
    const v = new Phaser.Math.Vector2(e.x - target.x, e.y - target.y);
    e.setVelocity(v.x, v.y);
  });
}
```

**Why it's bad:** every `new`, every `.forEach` closure, every string concat allocates. 60 FPS = 60 allocations per line per second per object. GC runs mid-gameplay → 30 ms hitch. Mobile: worse.

**Do instead:** pre-allocate, mutate, reuse. Pool short-lived game objects. Use `BitmapText` for frequently-updated HUD text.

```ts
private readonly _tmpVec = new Phaser.Math.Vector2();

update(time: number, delta: number) {
  this._tmpVec.set(this.player.x, this.player.y);

  // typed loop, no closure allocation
  const list = this.enemies.getChildren();
  for (let i = 0; i < list.length; i++) {
    const e = list[i] as EnemySprite;
    e.setVelocity(e.x - this._tmpVec.x, e.y - this._tmpVec.y);
  }
}
```

Treat `update()` like tight inner loop. Because it is one.

### 7. Per-frame text mutation with `Text` instead of `BitmapText`

**Looks like:**

```ts
this.fps = this.add.text(8, 8, '', { fontSize: '16px' });

update() {
  this.fps.setText(`FPS: ${Math.round(this.game.loop.actualFps)}`);
}
```

**Why it's bad:** `Phaser.GameObjects.Text` re-renders to internal canvas every time string changes. Draw call's worth of work plus garbage every frame for tiny FPS readout. Multiply across score, combo, timer, ammo → frame budget burned on text.

**Do instead:** `BitmapText` reads from pre-rendered glyph atlas; mutation essentially free.

```ts
// PreloadScene:
this.load.bitmapFont('hud', 'fonts/hud.png', 'fonts/hud.xml');

// HudScene:
this.fps = this.add.bitmapText(8, 8, 'hud', '', 16);
update() {
  this.fps.setText(`FPS: ${Math.round(this.game.loop.actualFps)}`);
}
```

`Text` fine for static UI (titles, menu items, dialogue changing once per beat). Per-frame: use `BitmapText`.

## Lifecycle: Listeners, Tweens, and Timers

### 8. Listener leaks across scene restart

**Looks like:**

```ts
create() {
  this.events.on('player-died', this.onPlayerDied, this);
  this.game.events.on('focus', this.onFocus, this);
}

onRestart() {
  this.scene.restart();
}
```

**Why it's bad:** `scene.restart()` runs `create()` again, registering same listeners again. After 5 deaths, `onPlayerDied` fires 5 times. `onFocus` is *permanently* leaked — global game event bus survives scene, nothing cleans it up.

**Do instead:** clean up in `shutdown`. One-shot listeners: use `once`.

```ts
create() {
  this.events.on('player-died', this.onPlayerDied, this);
  // Game-bus outlives the scene; remove explicitly.
  this.game.events.on('focus', this.onFocus, this);

  this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    this.game.events.off('focus', this.onFocus, this);
  });
}
```

Rule: any listener attached to target that *outlives* scene (`game.events`, `registry.events`) must be removed on `SHUTDOWN`. Per-scene listeners (`this.events`, `this.input`) cleaned for you.

### 9. Tween and timer leaks

**Looks like:**

```ts
// Plain JS object as the tween target — survives the scene
const flashState = { alpha: 0 };
this.tweens.add({ targets: flashState, alpha: 1, duration: 500, repeat: -1 });
```

**Why it's bad:** tween's target not scene-managed `GameObject` → tween manager has nothing to clean up against, tween runs forever. Worst case: tween on destroyed object throws on next tick.

**Do instead:** prefer scene-managed targets. Need to tween plain object? Track and stop in `shutdown`.

```ts
private flashTween?: Phaser.Tweens.Tween;
private flashState = { alpha: 0 };

create() {
  this.flashTween = this.tweens.add({
    targets: this.flashState, alpha: 1, duration: 500, repeat: -1,
  });
  this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    this.flashTween?.stop();
  });
}
```

Tween or timer might survive scene? It will. Stop explicitly.

## Loader and Audio

### 10. Audio without unlock

**Looks like:**

```ts
// MenuScene.create():
this.sound.play('title-music', { loop: true });
// nothing plays. engineer suspects asset is broken.
```

**Why it's bad:** every modern browser blocks audio until page receives user gesture. Phaser's `WebAudioSound` honors that. Calling `play` before any input does nothing — no error, just silence.

**Do instead:** start audio after first input.

```ts
create() {
  this.input.once('pointerdown', () => {
    this.sound.play('title-music', { loop: true });
  });

  // or listen for the unlock event:
  this.sound.once(Phaser.Sound.Events.UNLOCKED, () => {
    this.sound.play('title-music', { loop: true });
  });
}
```

Plan for this day one. What plays on laptop after reload click will not play on freshly opened phone.

### 11. Re-loading assets on scene restart

**Looks like:**

```ts
export class GameScene extends Phaser.Scene {
  preload() {
    this.load.image('player', 'assets/player.png');
    this.load.audio('hit', 'assets/hit.wav');
    // ...20 more loads
  }

  onPlayerDeath() { this.scene.restart(); } // re-runs preload
}
```

**Why it's bad:** Loader smart enough to skip already-cached assets, so not catastrophic alone. But habit scales badly. Once you set `setBaseURL`, switch to asset packs, or load conditionally, duplicated load code becomes source of subtle bugs (wrong base URL, race with cache, double-decoded audio).

**Do instead:** load once in dedicated `PreloadScene` at boot. Gameplay scenes assume assets exist.

```ts
export class PreloadScene extends Phaser.Scene {
  constructor() { super(SceneKey.Preload); }
  preload() { this.load.pack('main-pack', 'assets/asset-pack.json'); }
  create() { this.scene.start(SceneKey.Menu); }
}

export class GameScene extends Phaser.Scene {
  // no preload(); assets guaranteed loaded.
  create() { this.add.image(0, 0, 'player'); }
}
```

Restart re-runs `create`, not `preload`, when nothing to preload. Faster, safer, asset-pack-ready.

## Physics

### 12. `setScale` then `setSize`/`setOffset` in the wrong order

**Looks like:**

```ts
const player = this.physics.add.sprite(100, 100, 'player');
player.body.setSize(20, 28);
player.body.setOffset(6, 4);
player.setScale(2); // body geometry now invalidated
```

**Why it's bad:** Arcade body dimensions computed from texture's pixel size. `setScale` changes body's computed extents, but `setSize`/`setOffset` were applied against unscaled texture. Body ends up visibly offset from sprite; collisions feel wrong.

**Do instead:** scale first, then size body.

```ts
const player = this.physics.add.sprite(100, 100, 'player');
player.setScale(2);
player.body.setSize(20, 28);   // values in unscaled texture pixels;
player.body.setOffset(6, 4);   // Arcade applies the scale internally
```

See [physics-arcade.md](physics-arcade.md) for full body-geometry rules.

### 13. Direct write to `body.x`

**Looks like:**

```ts
this.player.body.x = 500;
this.player.body.y = 300;
```

**Why it's bad:** Arcade body is *driven by* GameObject in physics step, not other way around. Writing `body.x` puts them out of sync until next step — visual lag, mid-frame collisions against stale positions, tunneling.

**Do instead:** move GameObject. Body follows next step.

```ts
this.player.setPosition(500, 300);
```

Teleport without dragging old velocity:

```ts
this.player.setPosition(500, 300);
this.player.body.reset(500, 300); // clears velocity and resyncs
```

### 14. Polling `body.touching.down` for "is grounded?"

**Looks like:**

```ts
update() {
  if (this.jumpKey.isDown && this.player.body.touching.down) {
    this.player.setVelocityY(-400);
  }
}
```

**Why it's bad:** `body.touching.down` is true *only on frame body touches ground*. Input running before physics step on given frame → miss touching state, jump doesn't fire. Also misses coyote-time jumps (grace window after walking off ledge) every platformer expects.

**Do instead:** track grounded via collider callback, then add coyote-time.

```ts
private coyoteMs = 0;
private static readonly COYOTE_WINDOW = 100;

create() {
  this.physics.add.collider(this.player, this.platforms, () => {
    if (this.player.body!.blocked.down) {
      this.coyoteMs = LevelScene.COYOTE_WINDOW;
    }
  });
}

update(_time: number, delta: number) {
  this.coyoteMs = Math.max(0, this.coyoteMs - delta);
  if (Phaser.Input.Keyboard.JustDown(this.jumpKey) && this.coyoteMs > 0) {
    this.player.setVelocityY(-400);
    this.coyoteMs = 0;
  }
}
```

Same pattern for "just landed" — fire on callback transition, not polling.

### 15. Tunneling through one-tile-thick walls

**Looks like:**

```ts
const wallsLayer = map.createLayer('Walls', tileset);
wallsLayer.setCollisionByProperty({ collides: true });
this.physics.add.collider(this.bullet, wallsLayer);
// fast bullet sometimes passes through a 1-tile wall
```

**Why it's bad:** Arcade physics is discrete. Body moving more than one tile per step against one-tile-thick wall can teleport through without ever overlapping tile.

**Do instead:** combine (a) thicker walls, (b) capped velocity, (c) higher physics step rate, (d) higher tile bias. (a) and (b) usually enough.

```ts
this.bullet.body.setMaxVelocity(800, 800);
this.physics.world.TILE_BIAS = 32; // default 16; raise for fast bodies
```

Hitscan-fast bodies (lasers): Arcade is wrong tool — raycast or use Matter. See [physics-arcade.md](physics-arcade.md).

## Build and Configuration

### 16. Missing `parent` in Game config

**Looks like:**

```ts
new Phaser.Game({
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  scene: [BootScene, GameScene],
});
// canvas gets appended to <body>, breaking page layout
```

**Why it's bad:** without `parent`, Phaser appends canvas to `document.body`. Canvas lands on top of or below headers and sidebars. Vite + React app: canvas appears outside React tree; React reconciliation occasionally collides with it.

**Do instead:** explicit `parent` matching element in `index.html`.

```html
<div id="game-container"></div>
```

```ts
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 1280,
  height: 720,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, GameScene],
});
```

`'game-container'` doesn't exist at boot? Clear error instead of silent layout bug.

### 17. Phaser bundle bloat

**Looks like:**

```ts
import Phaser from 'phaser';
// 1.4 MB (compressed) of Phaser shipped to a 5-screen mobile-web game
```

**Why it's bad:** Phaser is one large bundle, does not tree-shake well. Full library brings Arcade *and* Matter, entire loader, every GameObject type, every plugin.

**Do instead:** most projects — accept it. Phaser's footprint is cost of using Phaser; splitting won't recover much. Bundle size genuinely matters (ad units, embedded widgets)? Use `phaser-core`, explicitly include plugins you need.

```ts
// vite.config.ts
export default defineConfig({
  resolve: { alias: { phaser: 'phaser/dist/phaser-core.js' } },
});
```

Verify with bundle analyzer. Savings not material (>30%)? Revert, stop optimizing.

## Related

Each subsystem reference has own anti-patterns section with deeper, topic-specific gotchas. This file is cross-cutting catalog.

- [phaser-fundamentals.md](phaser-fundamentals.md) — engine model, the loop, the loader, registry semantics
- [project-and-vite.md](project-and-vite.md) — Game config, `parent`, scale modes, build setup
- [scenes-and-flow.md](scenes-and-flow.md) — scene lifecycle, parallel scenes, init/data typing, shutdown rules
- [physics-arcade.md](physics-arcade.md) — body offsets, tile bias, fast-body tunneling, collider callbacks
- software-design — cross-cutting design principles these patterns instantiate

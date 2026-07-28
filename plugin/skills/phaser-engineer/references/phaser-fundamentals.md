# Phaser Fundamentals

Mental model file. Before other reference files make sense, internalize how Phaser 3 thinks — core abstractions, how main loop runs, what "scene" actually is, how engine relates to browser hosting it. Skip this and rest of skill harder to apply.

Thing most engineers new to Phaser get wrong, especially from Unity or Godot: **they treat scenes as "the level" and `Phaser.Game` as passive container, then write single 3,000-line scene because everything has to live somewhere.** Not the model. Scene is unit of state with lifecycle and own systems; `Game` is runtime owning *list* of scenes, arbitrating which run, pause, or sleep. Internalize that, rest of Phaser makes sense.

## The Engine Model in Five Sentences

1. **`Phaser.Game`** is engine instance — owns canvas, renderer, scene manager, main loop; lives until page unloads.
2. A **`Phaser.Scene`** is contained unit of state and behavior with lifecycle (`init` → `preload` → `create` → `update`); game can run multiple scenes simultaneously.
3. The **main loop** is single-threaded `requestAnimationFrame`-driven tick calling `update(time, delta)` on every active scene every frame.
4. **GameObjects** (sprites, text, containers, graphics, particles) live on per-scene **display list**, rendered each frame in depth order; cameras are views into display list.
5. Scenes communicate through **events** (`scene.events`, `game.events`) and shared state (`registry`) — *not* by reaching into each other's internals.

Understand those five things, you understand engine. Rest is detail.

## What Phaser Is (and What It Isn't)

Phaser 3 is **HTML5 game framework** running in browser. Concretely:

- Draws to single `<canvas>` element via either **WebGL** (default, hardware-accelerated) or **Canvas 2D** (fallback). Renderer chosen at startup; no runtime switch.
- **Single-page, single-threaded JavaScript**. One event loop, one main thread, one `requestAnimationFrame` driving everything.
- **Browser-hosted**. Game shares page's CPU, memory, audio context, input system, tab-visibility state. Tab backgrounded → `requestAnimationFrame` slows or stops.
- **Statically served**. Phaser game = HTML + JS + assets, deployable to any static host (Vercel, Netlify, itch.io, S3+CloudFront). No Phaser server.

Phaser is **not**:

- A 3D engine. Phaser 3 is 2D. (`Phaser3D` plugin and Phaser 4 are different conversation; neither in scope.)
- A game *editor*. No Phaser equivalent of Godot or Unity editor. You write code, place things by code or by importing data from external tools (Tiled, Texture Packer, Aseprite). Real ergonomic difference; budget for it.
- A managed runtime. No garbage collector tuning, no scene serialization format, no built-in save system, no built-in networking. Assemble these from JS/browser primitives.
- A native engine. Runs in browser. Wrap in Electron / Capacitor / Cordova for "native" deployment, but runtime still webview.

Knowing what Phaser *isn't* prevents most common waste: trying to make it behave like Unity, fighting it for lacking editor, assuming features that don't exist.

## The `Game` Instance

Phaser app starts with one call:

```ts
import Phaser from 'phaser';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game-root',
  backgroundColor: '#0a0a0a',
  scene: [BootScene, PreloadScene, MenuScene, GameScene, HUDScene],
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 800 }, debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  fps: {
    target: 60,
    forceSetTimeOut: false,
  },
  audio: {
    disableWebAudio: false,
  },
};

new Phaser.Game(config);
```

Things every Phaser engineer should know up-front:

- **`type`** — `Phaser.AUTO` (try WebGL, fall back to Canvas), `Phaser.WEBGL`, or `Phaser.CANVAS`. Default `AUTO`. WebGL always faster on capable devices; Canvas is safety net for low-end mobile, old Safari.
- **`width` / `height`** — *internal* resolution, not display size. Display size governed by `scale`. Pick logical resolution (often 1280×720 or 1920×1080 desktop-first, 750×1334 or similar portrait mobile-first), treat as design canvas.
- **`parent`** — DOM element ID (or element) canvas attaches to. Omitted → Phaser appends to `<body>`. Real app: almost always want specific div for sizing and layout placement.
- **`scene`** — array of scene *classes* (not instances). First one started automatically unless marked `active: false`. Rest registered but inactive until `start` / `launch`. See [scenes-and-flow.md](scenes-and-flow.md) for what those mean.
- **`physics`** — declares default physics system, configures it. Can load both Arcade and Matter; each scene picks one. See [physics-arcade.md](physics-arcade.md).
- **`scale`** — how internal canvas fits actual viewport. `FIT` (letterbox), `RESIZE` (fill, recompute layout), `ENVELOP` (fill, may crop), `NONE`. Same family as "how does game handle different screen sizes?" — answer day one.
- **`fps`** — `target` is *physics/update* rate. Render rate follows `requestAnimationFrame` (almost always display refresh: 60Hz, 120Hz, 144Hz). `forceSetTimeOut: true` falls back to `setTimeout`-driven loops when `requestAnimationFrame` unavailable (rare).
- **`audio`** — `disableWebAudio: true` forces HTML5 audio (lower-quality, more compatible). Default Web Audio. Mobile: expect to call `sound.unlock()` on first user gesture regardless.

Once `new Phaser.Game(config)` runs, engine takes over: creates canvas, registers scenes, starts main loop, starts first active scene. **You do not call `update()` yourself.** Loop does.

`Game` instance reachable from any scene as `this.game`. Most things wanted from game (renderer, scale manager, sound manager, registry, scene manager) are on it, but almost always go through scene-level shortcuts (`this.scale`, `this.sound`, `this.registry`, `this.scene`).

## The `Scene` Lifecycle (High Level)

Scene is TypeScript class extending `Phaser.Scene`:

```ts
import Phaser from 'phaser';

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: { level: number }): void {
    // Pre-preload setup. Read data passed from scene.start().
  }

  preload(): void {
    // Queue asset loads. Loader runs after preload returns.
    this.load.image('player', 'assets/player.png');
  }

  create(): void {
    // World setup. Assets are now in cache.
    this.add.image(640, 360, 'player');
  }

  update(time: number, delta: number): void {
    // Per-frame logic. Hot path.
  }
}
```

Engine calls these in order:

1. **`init(data)`** — runs first, gets data passed to `scene.start('GameScene', data)`. Interpret arguments, set up scene-level fields. Don't load assets here.
2. **`preload()`** — runs once. Queue assets via `this.load.image(...)` etc. Loader runs after `preload` returns; `create` waits for it.
3. **`create()`** — runs once, after Loader finishes. World built here: instantiate game objects, set up colliders, wire input, kick off camera follow, register events.
4. **`update(time, delta)`** — runs every frame thereafter. `time` = accumulated game time in ms; `delta` = ms since previous frame. Hot path.

Full mechanics — scene-to-scene transitions, `start` vs `launch` vs `pause` vs `resume` vs `stop`, multi-scene patterns (HUD over GameScene), data passing, `init`/`preload`/`create` ordering across scenes, scene plugins — live in [scenes-and-flow.md](scenes-and-flow.md). This file establishes cycle.

Most common mistake: **putting world setup in `preload`**. `preload` is for queuing loads. Cache not populated until *after* `preload` returns. Calling `this.add.image('player', ...)` inside `preload` fails because texture not loaded yet. World setup goes in `create`.

## The Render / Update Loop

Phaser's main loop = one `requestAnimationFrame` callback ticking every active scene per frame. Per tick, in order:

1. **Input** polled and dispatched (pointer events, keyboard, gamepad).
2. **Pre-update** runs on each scene's systems (physics integrate, etc.).
3. **`update(time, delta)`** called on every active scene.
4. **Post-update** runs (camera follow, tween updates, sound updates).
5. **Render** — renderer walks each active scene's display list, draws through each camera.

Two timing values seen constantly:

- **`time`** — `performance.now()`-style accumulated game time, milliseconds. Useful for "is `time > nextSpawnAt`?" patterns.
- **`delta`** — milliseconds since last frame. **Always multiply per-frame movement by `delta`** (or `delta / 1000` for seconds). Hard-coding `x += 5` per frame ties speed to framerate — wrong on 144Hz monitor, wrong again on slow phone.

```ts
update(time: number, delta: number): void {
  const dt = delta / 1000; // seconds
  this.player.x += this.playerVelocityX * dt;
}
```

Phaser exposes loop directly:

- **`this.game.loop.actualFps`** — measured FPS, smoothed. Read for in-game perf overlays.
- **`this.game.loop.targetFps`** — configured target (default 60).
- **`this.game.loop.delta`** — same `delta` from `update`.

Loop is **single-threaded JavaScript**, sharing main thread with everything else on page (DOM events, fetch callbacks, postMessage from workers). Long-running synchronous JS starves loop → frame drops. Fix is not "make it async" — async still runs same thread. Fix is *don't do long-running work per frame.* Pool, cache, precompute, offload to Web Worker if heavy enough to need own thread.

Loop does **not** distinguish "physics tick" from "render tick" the way Godot or Unity do by default. Arcade physics steps inside same `update` cycle. Matter has internal fixed-step option. Need hard determinism? Build on top — most Phaser games don't.

**Tab backgrounded** → browsers throttle `requestAnimationFrame` to ~1 Hz or stop entirely. Phaser detects via `Page Visibility API`, pauses scenes by default. On resume, `delta` for first frame can be huge — code needs to tolerate that, or cap `delta` (`config.fps.smoothStep` or manual clamping).

## The Display List

Each scene has **display list**: flat-ish list of GameObjects rendered this frame. GameObject = anything Phaser can draw or manage as positioned thing in world: `Sprite`, `Image`, `Text`, `BitmapText`, `Graphics`, `TileSprite`, `Container`, `ParticleEmitter`, `RenderTexture`, `Video`, `Mesh`, etc.

Most-used base types:

| Type | Purpose |
|---|---|
| `Image` | Static sprite, no animation frames. |
| `Sprite` | Image that can play `Animation` clips from `AnimationManager`. |
| `Text` | DOM-style text rendered to texture (heavy on changes; cache it). |
| `BitmapText` / `DynamicBitmapText` | Bitmap-font text. Cheap. Use for HUD numbers changing every frame. |
| `Graphics` | Procedural shapes — rects, lines, arcs, paths. Expensive to redraw every frame; consider `generateTexture()`. |
| `Container` | Composite GameObject. Children move/rotate/scale with parent. Phaser equivalent of "group these into a unit." |
| `Group` | Logical group (not transform parent). Used for pooling, batched physics, batched logic. |
| `TileSprite` | Tiled/repeated texture. Good for parallax backgrounds. |
| `ParticleEmitter` | Particle system. Cheap because GPU-instanced under WebGL. |

GameObject has:

- **Position** (`x`, `y`) and rotation/scale.
- **Depth** (`setDepth(n)`); higher renders on top.
- **ScrollFactor** (how much camera scrolls past it; 0 = HUD, 1 = world).
- **Alpha**, **tint**, **blendMode**, **visible**.
- **Origin** (anchor point; 0,0 = top-left, 0.5,0.5 = center — default).
- Optional **physics body** (added by `this.physics.add.existing(obj)` or created via `this.physics.add.sprite(...)`).
- Optional **input** (`obj.setInteractive()`).
- A **scene** reference (`obj.scene`).

**Render order** within scene: by `depth`, then insertion order for ties. Across scenes: **scene order in `game.config.scene`** plus what's been started/launched determines which scene draws on top. Common pattern: `GameScene` runs world; `HUDScene` is `launch`ed on top with `scene.bringToTop()` to ensure it renders above.

**World coordinate system** implicit: GameObjects have world `(x, y)` in pixels, `+x` right, `+y` *down* (like DOM, *unlike* most math conventions). World unbounded by default; camera defines what player sees.

**Camera** = view into display list. Each scene has `this.cameras.main` by default, sized to game's logical resolution. Cameras can be moved, rotated, zoomed, faded, shaken, made to follow target, constrained to bounds. Multiple cameras per scene allowed (split-screen, minimap). Cameras are *views*, not transforms applied to world — moving camera does not move GameObjects.

```ts
this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
this.cameras.main.setBounds(0, 0, levelWidth, levelHeight);
this.cameras.main.setZoom(2);
```

## The Loader and the Cache

Asset loading centralized in `this.load`. Inside `preload()` (or any time loading more assets later), queue requests:

```ts
preload(): void {
  this.load.image('player', 'assets/player.png');
  this.load.spritesheet('explosion', 'assets/explosion.png', { frameWidth: 64, frameHeight: 64 });
  this.load.atlas('characters', 'assets/characters.png', 'assets/characters.json');
  this.load.audio('music-main', ['assets/audio/main.ogg', 'assets/audio/main.mp3']);
  this.load.tilemapTiledJSON('level1', 'assets/levels/level1.json');
  this.load.json('config', 'assets/config.json');
  this.load.bitmapFont('hud-font', 'assets/fonts/hud.png', 'assets/fonts/hud.xml');
}
```

Things every Phaser engineer should know about Loader:

- **Asset keys global per cache.** `'player'` lives in texture cache forever (until `this.textures.remove('player')`). Loading `'player'` second time silently no-ops if key exists. Why scene restarts don't re-trigger loads — and why typo in key creates hard-to-find bug.
- **Caches per-asset-type.** Textures, audio, JSON, bitmap fonts, tilemaps each have own cache (`this.textures`, `this.cache.audio`, `this.cache.json`, etc.). `this.textures.exists('foo')` is safe check before loading.
- **Multi-format audio fallback.** Pass array of URLs; Phaser picks first format browser supports. Always provide at least `.ogg` + `.mp3` (or `.m4a`) for cross-browser coverage.
- **Asset packs** — `this.load.pack('config-pack', 'assets/pack.json')` loads JSON file describing list of files to load. Useful for organizing per-scene asset manifests outside code.
- **Async progress** — Loader event-driven. Listen on `this.load.on('progress', ...)` and `this.load.on('complete', ...)` to drive progress bars in Boot/Preload scene. How you build real loading screen instead of frozen white canvas.
- **Dynamic loads after `create()`** — call `this.load.image(...)` later, then `this.load.start()`. Useful for streaming levels or DLC-style content.
- **CORS matters.** Loading assets from different origin (CDN)? Server must send right CORS headers, especially for textures used by WebGL. Same-origin easy path; cross-origin requires server-side configuration.

Loader is one of Phaser's strongest systems. Don't roll own; what you'd reinvent (progress, retry, format fallback, cache dedup, parallel fetches with concurrency control) already there.

## The Systems Exposed on a Scene

`Phaser.Scene` is façade over engine's systems. Inside any scene method, `this.<system>` is entry point:

| Property | What it is |
|---|---|
| `this.add` | The **GameObject factory**. `this.add.sprite(...)`, `this.add.text(...)`, `this.add.container(...)`. Creates and adds to display list. |
| `this.physics` | Active **physics system** for scene (Arcade by default). `this.physics.add.sprite`, `this.physics.add.collider`, `this.physics.world`. |
| `this.tweens` | The **TweenManager**. `this.tweens.add({ targets, x, duration, ease })`. Scene-scoped — tweens killed when scene shuts down. |
| `this.anims` | The **AnimationManager**. *Global*, not per-scene — animations defined here visible to all scenes. Define once, reuse everywhere. |
| `this.input` | The **InputPlugin**. `this.input.keyboard`, `this.input.gamepad`, `this.input.on('pointerdown', ...)`. Input per-scene; multiple scenes can each receive input. |
| `this.cameras` | The **CameraManager**. `this.cameras.main`, `this.cameras.add(...)`. |
| `this.sound` | The **SoundManager**. `this.sound.add('music')`, `this.sound.play(...)`. *Global* — `this.sound` proxies game-wide sound manager. |
| `this.scene` | The **ScenePlugin**: scene-manager controls. `this.scene.start('Other')`, `this.scene.launch('HUD')`, `this.scene.pause()`, `this.scene.get('Other')`. |
| `this.events` | **Per-scene event emitter**. Use for *intra-scene* communication. Cleared on shutdown. |
| `this.game.events` | **Game-wide event emitter** on `Game` instance. Use sparingly for cross-scene events. |
| `this.registry` | **Game-wide key/value store** (`Phaser.Data.DataManager`). Persists across scene changes. Useful for small amount of shared state (player name, score, settings). Easy to abuse — see [phaser-anti-patterns.md](phaser-anti-patterns.md). |
| `this.data` | **Per-scene** data manager. Less commonly used; mostly convenience over scene fields. |
| `this.time` | The **Clock**. Schedule one-shot or repeating callbacks: `this.time.delayedCall(1000, fn)`, `this.time.addEvent({ delay, callback, loop })`. Pauses with scene. |
| `this.lights` | The **LightsPlugin** (WebGL only). Normal-mapped 2D lighting. Niche; powerful when needed. |
| `this.textures` | The **texture cache** (game-wide). Useful for `generateTexture` from `Graphics` object, or runtime atlas manipulation. |
| `this.cache` | The **non-texture caches** (audio, JSON, bitmap fonts, tilemaps, XML). |

Two things on this table that bite people:

1. **`this.anims` and `this.sound` are game-global, not per-scene.** Define animation in one scene, available in all. Add sound in one scene, survives scene changes (usually what you want for music; usually *not* for SFX — destroy SFX sounds on scene shutdown).
2. **`this.events` is per-scene; `this.game.events` is game-wide.** Mix these up → either leak listeners across scene restarts (`game.events` listener registered in `create`, never removed in `shutdown`) or wonder why "global" event isn't reaching sibling scene (used `this.events`).

Cleanup on scene shutdown critical, covered in [scenes-and-flow.md](scenes-and-flow.md) and [phaser-anti-patterns.md](phaser-anti-patterns.md). Short version: every listener added on `this.game.events` or external sources (DOM, `window`) needs matching removal in scene's `shutdown` event.

## Plugins (Brief)

Phaser's plugin system adds behavior to scene or whole game. **Scene plugins** (mounted on `this.<key>` in every scene) and **global plugins** (mounted on `this.game.<key>`). Most projects don't write custom plugins; consume third-party ones (e.g. `phaser3-rex-plugins` for UI components, `phaser-matter-collision-plugin` for nicer Matter collision events). Add via `plugins` config in `GameConfig`. Reaching for plugin? Prefer actively maintained one with TS types — alternative is reinventing yourself, sometimes right call. Plugin design not covered further.

## TypeScript Integration (Brief)

Phaser ships first-class TypeScript types bundled in `phaser` package itself (`phaser/types/phaser`) — do not install `@types/phaser`, stale and conflicts with bundled types. Basics:

```ts
import Phaser from 'phaser';

interface GameSceneData {
  level: number;
  difficulty: 'easy' | 'normal' | 'hard';
}

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: GameSceneData): void {
    // data is now typed — typos caught at compile time.
  }

  create(): void {
    this.player = this.physics.add.sprite(100, 100, 'player');
    this.cursors = this.input.keyboard!.createCursorKeys();
  }
}
```

The `any`-leak hot spots — `this.add.sprite(...).body`, `Container` children, scene `data`, registry values, event payloads — and TS-friendly patterns for typing each catalogued in [phaser-anti-patterns.md](phaser-anti-patterns.md). For now: lean into types, treat compile errors as cheap signal, avoid `as any` anywhere tempting.

## Common Mistakes Coming In

Things tripping up new Phaser engineers, especially from Unity, Godot, or "just plain JS":

- **One giant `GameScene`.** Everything in one class, 3,000 lines, every entity. Split early, use `launch` for HUD/UI scenes, extract systems into plain TS classes scene composes.
- **Calling `add.image` in `preload`.** Assets not loaded yet. World setup is `create`'s job.
- **Hard-coded movement (`x += 5` per frame).** Tied to framerate. Multiply by `delta`.
- **Allocations in `update`.** `new Phaser.Math.Vector2(...)`, `[].map(...)` over thousands of entities, string concatenation producing garbage. Hot path needs to be allocation-free or pooled.
- **Not handling audio unlock.** First load works on desktop, fails silently on mobile until first tap. Handle `sound.unlock()` (or `sound.context.resume()` for Web Audio) on first user gesture.
- **Reaching across scenes.** `this.scene.get('Other').someField` couples scenes hard. Use events, registry, or passed-in reference.
- **Listeners outliving scene.** Adding to `this.game.events` or `window` in `create`, never removing in `shutdown`. Comes back as ghost callbacks on next scene restart.
- **Custom animation/tween/loader.** Phaser has `AnimationManager`, `Tween`, `Loader` for reason. Use them. Custom version slower, buggier, harder to maintain.
- **Treating registry as global object.** Few well-typed keys: fine. Dozens of arbitrary fields: god-singleton, just like autoload abuse in Godot.
- **Ignoring scale and DPI.** Game looks fine on 1080p monitor, blurry on 4K display, broken on phone. Decide `scale` mode and design canvas day one.

Rest of skill's references go deep on each. Start with this file as mental model, then read references matching today's work.

## Related

- [scenes-and-flow.md](scenes-and-flow.md) — scene lifecycle in depth, scene manager, multi-scene patterns
- [project-and-vite.md](project-and-vite.md) — Vite + TypeScript scaffold, asset pipeline, dev server, prod build
- [physics-arcade.md](physics-arcade.md) — Arcade physics in depth: bodies, groups, collisions, gotchas
- [phaser-anti-patterns.md](phaser-anti-patterns.md) — what not to do, with TS-specific traps called out
- [SKILL](../SKILL.md) — parent skill and its universal rules

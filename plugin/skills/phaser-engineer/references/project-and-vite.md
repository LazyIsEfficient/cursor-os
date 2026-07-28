# Project and Vite

Practical "how do I start Phaser 3 + TypeScript project today" reference. Scaffold, build tool, TypeScript config, entry point, first scene, where assets live, what `npm run dev` and `npm run build` actually do. Staring at empty directory? Start here. Inherited Phaser project on Webpack and Babel-compiled JS? Skim anyway — conventions matter regardless of how you got there.

## Why Vite

Vite is default build tool in this skill, exactly one reason: **iteration loop is faster**. Native ESM in development means no bundling step on save — browser fetches modules you changed, nothing else. HMR on non-Phaser code (UI overlays, plain TypeScript modules) updates without refresh. Production build is `esbuild` for transforms plus Rollup for bundling; both fast and well-maintained. Configuration is one short file. No `webpack.config.js` with eight loaders, no `babel.config.js`, no plugin-resolve-tree to debug at midnight.

Webpack and Parcel valid choices. Phaser docs ship templates for both. Skill picks Vite because speed-of-edit-to-screen pays for itself in first hour; production output identical: static `dist/` hostable on anything.

## Initial scaffold

Shortest path from nothing to running Phaser project:

```bash
npm create vite@latest my-game -- --template vanilla-ts
cd my-game
npm install
npm install phaser
```

Vite's `vanilla-ts` template gives right TS config and dev-server setup without framework noise (no React, Vue, Svelte). After `npm install phaser` you have everything to run Phaser game.

Resulting project structure:

```
my-game/
├── node_modules/         ← gitignored
├── public/               ← static assets, served verbatim
├── src/
│   ├── main.ts           ← entry point
│   ├── style.css         ← (delete or repurpose)
│   ├── typescript.svg    ← (delete)
│   └── vite-env.d.ts     ← Vite's type augmentations
├── index.html            ← entry HTML
├── package.json
├── tsconfig.json
└── vite.config.ts        ← (you'll add this)
```

Delete `src/style.css`, `src/counter.ts`, SVG template ships with; replace `src/main.ts` with Phaser entry. Rest stays.

## `package.json`

Minimal but complete `package.json` after scaffolding:

```json
{
  "name": "my-game",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "phaser": "^3.80.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.2.0"
  }
}
```

Key points:

- **`phaser` is runtime dependency**, not devDependency. Ends up in bundle.
- **Do not install `@types/phaser`.** Phaser 3 ships own type definitions in `phaser/types/phaser`, and they are good. `@types/phaser` package on DefinitelyTyped stale, will fight bundled types if both present.
- **`type: "module"`** matters — tells Node and Vite that `.js`/`.ts` files use ESM. Default Vite template sets this; don't remove.
- **Build script runs `tsc -b` first** to typecheck (with project references / build mode), then `vite build` to bundle. TS fails → build fails. Right gate.
- **`preview`** serves built `dist/` locally so you can sanity-check production build before deploying.

## `vite.config.ts`

Basic Phaser project: config is short. Create `vite.config.ts` at project root:

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  publicDir: 'public',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
  },
})
```

What each setting buys:

- **`base: './'`** — emits relative URLs in built `index.html`. Makes same `dist/` work on itch.io, on subpath, on `file://` (with local server), on domain root. Deploying to fixed subpath (e.g. `https://example.com/games/my-game/`)? Set `base: '/games/my-game/'` instead — relative paths still work but absolute slightly nicer for asset prefetching.
- **`publicDir: 'public'`** — files in `public/` copied verbatim into `dist/` at build time, no fingerprinting. Where Phaser-loaded assets live (see "Asset directory conventions" below).
- **`server.open: true`** — opens browser when `npm run dev` starts. Convenience; remove if annoying.
- **`build.sourcemap: true`** — ships sourcemaps to `dist/` so production stack traces readable. Public game where you don't want source visible? Set `'hidden'` — sourcemaps emitted but not referenced from JS, so error reporting tools can use them but casual users can't.
- **`build.chunkSizeWarningLimit: 1500`** — Vite's default is 500 kB; Phaser alone ~1 MB minified. Default warning meaningless noise for game; bump so real warnings (accidentally-included 5 MB lib) still fire.

No `vite-plugin-phaser` needed. Phaser is normal npm package; Vite handles as-is.

## `tsconfig.json`

`vanilla-ts` template's `tsconfig.json` mostly correct but worth tightening:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": false,

    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "resolveJsonModule": true,

    "noEmit": true,
    "useDefineForClassFields": true,

    "baseUrl": "./src",
    "paths": {
      "@/*": ["*"]
    }
  },
  "include": ["src"]
}
```

Notes on choices:

- **`target: "ES2020"`** — Phaser 3 supports modern browsers; no need to ship to IE11. ES2020 buys optional chaining, nullish coalescing, BigInt, dynamic imports, all native. ES2022 fine too if minimum browser recent.
- **`module: "ESNext"` + `moduleResolution: "bundler"`** — right combo for Vite/esbuild/Rollup project. `bundler` mode lets you import without extensions, matches how Vite actually resolves modules.
- **`lib: ["ES2020", "DOM", "DOM.Iterable"]`** — Phaser runs in browser; you want DOM types. `DOM.Iterable` covers `for...of` on `NodeList` and friends, hit the moment you touch DOM around canvas.
- **`strict: true` is non-negotiable.** Turning off strict in Phaser project is self-inflicted wound. Phaser's API surface huge, many methods accept multiple shapes — strict mode forces explicitness, catches real bugs early. Specific call too painful with strict? Narrow type at call site, don't disable strict project-wide.
- **`noUncheckedIndexedAccess: true`** — `arr[0]` becomes `T | undefined` instead of `T`. Saves from "why is `tile.index` undefined here" three weeks in. Mildly painful when adopted; correct.
- **`noImplicitOverride: true`** — overriding Phaser's `preload`, `create`, `update` requires `override` keyword. Catches typos like `creat()` that would otherwise silently fail to override.
- **`baseUrl` + `paths`** — lets you `import { Player } from '@/entities/Player'` instead of `'../../entities/Player'`. Vite picks this up via `vite-tsconfig-paths` (optional plugin) or mirror same paths in `vite.config.ts` under `resolve.alias`. Small projects: skip; anything more than two folders deep: quality-of-life win.
- **No `types: ["phaser"]` entry.** Phaser's types come from `import Phaser from 'phaser'` — attached to import, not global. Using global `Phaser` namespace where you didn't import (e.g. HTML inline script)? You'd add `"types": ["phaser"]`, but modern pattern is import everywhere.

## `index.html`

Entry HTML small but every line earns keep:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <meta name="theme-color" content="#000000" />
    <title>My Game</title>
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: #000;
        overflow: hidden;
        height: 100%;
        width: 100%;
      }
      #game {
        width: 100vw;
        height: 100vh;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
      }
    </style>
  </head>
  <body>
    <div id="game"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

What's load-bearing:

- **Viewport meta with `maximum-scale=1.0, user-scalable=no`** — stops mobile browsers pinch-zooming canvas, almost never what game wants.
- **`overflow: hidden` on `html, body`** — prevents page scrolling when touch drag goes off canvas. Critical on mobile.
- **`#game` div as parent** — Phaser mounts canvas inside this div. Div must exist *before* `new Phaser.Game(...)` runs — why `<script type="module">` goes after body.
- **`touch-action: none`** — prevents browser interpreting touches as scroll/zoom gestures, stealing from Phaser's input. Most-forgotten setting; symptoms are touches that "miss" game and pinch-zoom page.
- **`user-select: none`** — stops accidental text selection during fast tapping. Also tiny performance win.

`<script type="module" src="/src/main.ts">` reference is what Vite hooks into. Dev: Vite serves `/src/main.ts` directly (transformed on the fly); build: Vite rewrites to fingerprinted bundle path.

## `src/main.ts`

Canonical entry. Only job: instantiate `Phaser.Game` with right config, register scenes:

```ts
import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { PreloadScene } from './scenes/PreloadScene'
import { GameScene } from './scenes/GameScene'
import { HUDScene } from './scenes/HUDScene'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#000000',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  render: {
    pixelArt: false,
    antialias: true,
  },
  scene: [BootScene, PreloadScene, GameScene, HUDScene],
}

new Phaser.Game(config)
```

Worth calling out:

- **`type: Phaser.AUTO`** — WebGL when available, falls back to Canvas. Use `Phaser.WEBGL` if depending on shaders or WebGL-only features, wanting hard error rather than silent fallback.
- **`parent: 'game'`** — id of div in `index.html`. Mounting before div exists in DOM → Phaser falls back to appending to `<body>`, usually wrong on mobile.
- **`scale.mode: FIT`** with base resolution — game logic uses 1280×720, engine handles letterboxing to actual viewport. `RESIZE` is alternative if game adapts to viewport at runtime; harder to design for. Pick `FIT` unless reason otherwise.
- **`scene` is array of classes**, not instances. Phaser instantiates on demand. Order matters: first scene starts automatically unless opting into manual control.
- **`pixelArt: true`** — disables texture filtering. Use for pixel-art games. Setting `true` then loading non-pixel-art textures produces ugly aliasing.

Larger projects: split file — keep `main.ts` to `new Phaser.Game(config)` call, put config in `src/config/gameConfig.ts`. Starter: inline fine.

## A first scene

`src/scenes/BootScene.ts` — minimum viable scene:

```ts
import Phaser from 'phaser'

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  override preload(): void {
    // Load just enough to render a loading screen.
    this.load.image('logo', 'assets/branding/logo.png')
  }

  override create(): void {
    const { width, height } = this.scale
    this.add.image(width / 2, height / 2, 'logo')

    // After 500ms, transition to the real preloader.
    this.time.delayedCall(500, () => {
      this.scene.start('PreloadScene')
    })
  }
}
```

Things to notice:

- **`super({ key: 'BootScene' })`** — `key` is how `scene.start('BootScene')` finds scene. Match to class name. Skipping key works (Phaser uses class name) but brittle.
- **`override` keywords** — required because of `noImplicitOverride: true` in `tsconfig`. Without it, `preolad` (typo) silently doesn't run.
- **`this.scale.width` / `this.scale.height`** — *base* resolution from config (1280×720 here), not actual viewport size. Want device pixels? Use `this.scale.gameSize.width`. Almost always want base size.
- **`this.time.delayedCall(...)`** — Phaser's scheduler. Survives scene pause/resume correctly. Don't use `setTimeout` inside scenes; doesn't interact with Phaser's clock, won't pause when scene pauses.

Real shape of scenes — `init`, `preload`, `create`, `update`, lifecycle ordering, scene-to-scene communication — in [scenes-and-flow.md](scenes-and-flow.md). This file shows working minimum.

## Asset directory conventions

Part new Phaser engineers get wrong most often. Two places assets can live, behave differently:

### `public/assets/` — recommended for game assets

Files in `public/` copied verbatim into `dist/` at build time. No fingerprinting, no transformation, predictable URLs.

```
public/
└── assets/
    ├── atlases/
    │   ├── characters.png
    │   └── characters.json
    ├── audio/
    │   ├── music/
    │   └── sfx/
    ├── fonts/
    ├── tilemaps/
    │   └── level1.json
    └── ui/
```

Phaser loads via expected path: `this.load.atlas('chars', 'assets/atlases/characters.png', 'assets/atlases/characters.json')`. Path relative to served root, matching `vite.config.ts`'s `base`.

Use for:

- **Texture atlases** — atlas JSON references PNG by filename; if Vite fingerprinted PNG, JSON's reference would break.
- **Audio files** — usually large, no benefit to fingerprinting per build.
- **Tilemap JSON** (Tiled exports) — reference tileset images by relative path; same breakage risk as atlases.
- **Anything Phaser's `Loader` fetches** — loader uses string URLs at runtime; can't run through bundler.

Downside: no fingerprinting means you handle cache busting yourself (typically via cache headers on CDN, or versioning asset path on release).

### `src/assets/` — for assets you import directly

Files imported via TypeScript (`import logoUrl from './assets/logo.png'`) get fingerprinted and bundled. Import returns final URL.

```ts
import logoUrl from './assets/logo.png'
// logoUrl === '/assets/logo-a3f29c1b.png' at runtime

this.load.image('logo', logoUrl)
```

Use for:

- **One-off assets not referencing other files** — single icon, splash logo.
- **Assets you want fingerprinted** for aggressive caching.

Mixing: fine to do both. Game-loaded assets in `public/assets/`, build-time imports in `src/assets/`. Don't put atlases or tilemaps under `src/` — cross-file references break.

## Asset pipeline notes

Phaser doesn't author assets — tooling does. Pipeline matters because file shape on disk must match what `Loader` expects.

### Texture atlases

Use **TexturePacker** (commercial; standard) or **free-tex-packer** (open source) to combine many sprites into one texture + JSON. Phaser supports JSON-Hash and JSON-Array formats; both packers export both.

Output:
- `characters.png` — atlas image
- `characters.json` — frame coordinates

Load:
```ts
this.load.atlas('characters', 'assets/atlases/characters.png', 'assets/atlases/characters.json')
// Then:
this.add.sprite(x, y, 'characters', 'hero_idle_01')
```

Pixel-art workflows: **Aseprite** can export directly to Phaser-compatible JSON (`File → Export Sprite Sheet → Output: JSON Array`). Result same shape as TexturePacker's output.

### Tilemaps

**Tiled** (`mapeditor.org`) is de facto standard. Export as JSON (not TMX) — Phaser's `tilemapTiledJSON` loader expects JSON.

Load:
```ts
this.load.image('tiles', 'assets/tilemaps/tileset.png')
this.load.tilemapTiledJSON('level1', 'assets/tilemaps/level1.json')
// Then in create():
const map = this.make.tilemap({ key: 'level1' })
const tileset = map.addTilesetImage('tileset_name_in_tiled', 'tiles')
```

Tiled object layers turn into Phaser game objects via `map.createFromObjects(...)`. Mapping in [scenes-and-flow.md](scenes-and-flow.md) and physics docs.

### Audio sprites

Single audio file with multiple labeled clips and JSON of timings. Generate with **audiosprite** (`npm install -g audiosprite`).

```bash
audiosprite -e ogg,mp3 -f howler -o sfx sfx-input/*.wav
```

Output:
- `sfx.ogg`, `sfx.mp3` — combined audio
- `sfx.json` — clip timings

Load:
```ts
this.load.audioSprite('sfx', 'assets/audio/sfx.json', ['assets/audio/sfx.ogg', 'assets/audio/sfx.mp3'])
// Then:
this.sound.playAudioSprite('sfx', 'jump')
```

Audio sprites right call for short SFX (gunshots, jumps, UI clicks) — avoid per-file HTTP latency and per-file decode cost. Longer music tracks: individual files.

## Dev workflow

```bash
npm run dev
```

Vite starts dev server (default port 5173), opens browser, serves `/src/main.ts` with on-the-fly TypeScript transformation. Save `.ts` file → Vite pushes change to browser.

What HMR does and doesn't do for Phaser project:

- **Plain TypeScript modules (utilities, data, configs) hot-replace.** Edit constants file imported by scene → Vite swaps module, scene picks up new value next time it reads import.
- **Phaser scenes already running do NOT auto-rebind.** Edit `GameScene.ts` → Vite swaps module, but *running instance* of `GameScene` still old one. Prototype now stale; method changes won't take effect on live instance.

Pragmatic workaround: **just full-reload page** when changing scene file. Most engineers configure Vite for hard reload on scene changes by adding to `vite.config.ts`:

```ts
export default defineConfig({
  // ...
  server: {
    // ...
    hmr: {
      overlay: true,
    },
  },
})
```

Accept scenes refresh via `Cmd-R`. 200ms reload faster than tracking down phantom-old-instance bugs.

Want to engineer around it? Scenes can listen for `import.meta.hot` events and call `scene.restart()`, but ergonomics not worth it for most projects. Reload.

## Prod build

```bash
npm run build
```

Runs `tsc -b` (typecheck) then `vite build` (bundle). Output:

```
dist/
├── index.html                    ← rewritten to point at fingerprinted JS
├── assets/
│   ├── index-a3f29c1b.js         ← bundled and minified
│   └── index-7b2e1d4f.js.map     ← sourcemap
└── assets/                       ← (your public/assets/, copied verbatim)
    ├── atlases/
    ├── audio/
    └── ...
```

Important: *two* `assets/` directories end up at same path in `dist/`. Vite's bundled JS goes to `dist/assets/index-*.js`; your `public/assets/` copied to `dist/assets/...`. Merge cleanly because filenames don't collide — but file at `public/assets/index.js` would conflict. Don't.

```bash
npm run preview
```

Serves `dist/` on port 4173. Use to verify build before deploying — most common place to catch broken asset paths from misconfigured `base`.

## Deploy notes (light)

Full CI/CD belongs to deployment-pipeline practice. Phaser-specific things:

- **itch.io** — zip `dist/` directory (not parent folder). Zip's root must contain `index.html`. With `base: './'` in `vite.config.ts`, Just Works. Itch's HTML5 game host serves zip from subpath; relative paths required.
- **Subpath hosting** — deploying to `https://example.com/games/my-game/`? Set `base: '/games/my-game/'` in `vite.config.ts`. Relative paths still work from `index.html`; absolute references (rare in Phaser projects) need prefix.
- **CDN cache headers** — fingerprinted JS bundles can be `Cache-Control: public, max-age=31536000, immutable`. Asset files in `public/assets/` *not* fingerprinted; cache shorter (e.g. 1 day) or version directory in release process. Belongs in CI/CD config, not project.

## Common gotchas

Short list of things biting you in first Phaser project:

### Bundle size

Phaser is ~1 MB minified+gzipped. Not negotiable for default build — Phaser mostly not tree-shakeable because renderer registry pulls in all GameObject types by reference. Treat 1 MB as floor, not ceiling.

Genuinely need smaller bundle?
- **`phaser/dist/phaser-core.js`** — slimmer build excluding physics, input, several other systems. Opt back in by importing what you need. Real but advanced; only consider if shipped and bundle is actual problem.
- **Code-split your scenes** — dynamic `import()` per scene means later scenes don't load until player progresses. Phaser supports via scene manager's `add()` method, accepting class or key + class.

Most projects: accept 1 MB and ship.

### CORS on `file://`

Don't open `dist/index.html` directly in browser — `file://` URLs trigger CORS errors on every asset Phaser tries to load. Always serve via `npm run preview`, real web server, or any local-server tool (`python -m http.server`, `npx serve dist`, etc.).

### Audio autoplay blocking

Browsers block audio playback until user interacts with page (click, tap, key press). `BootScene` trying to play music in `create()` → silently fails. Phaser's audio system handles this when you let it — but means title music starts on first input, not scene start.

Detail in [phaser-anti-patterns.md](phaser-anti-patterns.md); short version: don't fight it. Design around user gesture.

### `parent` element must exist before `new Phaser.Game(...)`

`<script type="module">` tag in `<head>` instead of after body → `#game` div doesn't exist yet when `main.ts` runs. Phaser falls back to appending to `<body>`, usually works visually but breaks CSS sizing on `#game`. Keep script tag at end of `<body>`, or wrap `new Phaser.Game(config)` call in `window.addEventListener('DOMContentLoaded', ...)`.

### Importing Phaser

Always:
```ts
import Phaser from 'phaser'
```

Not:
```ts
import * as Phaser from 'phaser'   // works but loses the default export
import { Scene } from 'phaser'      // works but messes with the namespace
```

First form is what every Phaser example, every type definition, every Stack Overflow answer assumes. Stick to it.

## Related

- [phaser-fundamentals.md](phaser-fundamentals.md) — engine model: `Game`, `Scene`, the loop, the loader, GameObjects, the display list
- [scenes-and-flow.md](scenes-and-flow.md) — scene lifecycle, scene manager, parallel HUD scenes
- [physics-arcade.md](physics-arcade.md) — Arcade physics setup once project is running
- [phaser-anti-patterns.md](phaser-anti-patterns.md) — what to avoid, including audio unlock and asset re-loading
- [SKILL](../SKILL.md) — parent skill and its universal rules
- [project-structure-template](../assets/project-structure-template.md) — recommended folder structure building on this scaffold
- deployment-pipeline practice — CI/CD for static `dist/` output
- performance-optimization — bundle size, code splitting, web worker offload beyond Phaser-specific tuning

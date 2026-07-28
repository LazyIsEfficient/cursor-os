# Exporting and Platforms

Building Godot game and getting it to players is most of the work that happens *after* game is "done." Each platform has own requirements, gotchas, asset pipeline. File is practical guide to exporting Godot 4 projects to each common target.

Single most important rule: **test on target platform early and often**. Desktop forgiving; mobile, web, console surface problems not existing on dev machines. Game tested only on desktop discovers mobile-specific bugs day before launch.

## Export Presets

Export configuration lives in **Project → Export...** as one or more presets. Each preset targets specific platform with specific settings.

Typical project has:

- **Windows Desktop** — `.exe` for Windows users.
- **Linux** — `.x86_64` binary for Linux users.
- **macOS** — `.app` bundle (signed and notarized for App Store).
- **Android** — APK or AAB for Google Play.
- **iOS** — Xcode project for App Store.
- **Web** — HTML/JS/WASM for browsers.

Plus, sometimes:

- **Dedicated server** — headless build for hosting multiplayer servers.
- **Console** (Switch, PlayStation, Xbox) — requires platform SDKs and licensing; out of scope for this skill.

## Export Templates

Before exporting, need **export templates** — Godot's pre-built engine binaries for each target platform. Download via **Editor → Manage Export Templates...** or directly from Godot website.

Templates versioned to match editor. Upgrade Godot → also upgrade templates.

C# projects: need **.NET version** of export templates, not standard ones. .NET templates include .NET runtime in export.

## Common Export Settings

Each preset has dozens of settings. Most important:

### Resources

- **Export Mode**: `PCK Encrypted` for production builds (encrypts data file). `PCK` for unencrypted (smaller, faster, inspectable). `ZIP` for some hosting scenarios.
- **Filters to export non-resource files**: explicitly include or exclude files. Useful for modding support or excluding dev-only files.

### Features

- **Custom features**: list of feature tags export should include. Use `OS.HasFeature("...")` to check at runtime. Useful for "demo build" vs "full build" or "server" vs "client" builds.

### Renderer

Per-platform renderer choice. Generally:

- **Desktop**: Forward+ (default; full features)
- **Mobile**: Mobile (lighter; fewer features)
- **Web**: Compatibility (most compatible)
- **Lower-end desktop**: Mobile or Compatibility

Can override per-export-preset.

### Encryption

Worried about reverse engineering or want to obfuscate game data → enable PCK encryption. Set encryption key in project settings; engine uses it to encrypt resource file. **Key is in binary** — mild obfuscation, not real security — but stops casual extraction.

## Per-Platform Export

### Windows Desktop

- **Output**: `.exe` plus `.pck` (data file). PCK can be embedded into EXE for single-file build.
- **Code signing**: signing EXE prevents Windows SmartScreen warnings. Use `signtool.exe` with code-signing certificate.
- **Icon**: set in export preset; auto-applied to EXE.
- **Console window**: default shows console window in debug builds. Release: disable it.

### Linux

- **Output**: `.x86_64` binary plus `.pck`.
- **Distribution formats**: tar.gz, AppImage, Flatpak, Snap. Each has different requirements.
- **AppImage** easiest cross-distribution format — bundles everything into single executable file.
- **Steam** packages Linux builds via depot system; just put binary and PCK in depot.

### macOS

- **Output**: `.app` bundle.
- **Code signing**: required for distribution. Without it, users get "developer cannot be verified" warning.
- **Notarization**: distribution outside App Store, Apple requires notarization (automated security scan). Use `xcrun notarytool` after signing.
- **Universal binary**: macOS now requires Apple Silicon support. Godot 4's export supports both Intel and Apple Silicon (universal builds).
- **App Store**: requires meeting App Store guidelines, providing screenshots, etc. Significant overhead.

Signing/notarization workflow automatable:

```bash
# After Godot exports to MyGame.app:
codesign --deep --force --options runtime --sign "Developer ID Application: Your Name" MyGame.app
ditto -c -k --sequesterRsrc --keepParent MyGame.app MyGame.zip
xcrun notarytool submit MyGame.zip --apple-id you@example.com --password APP_PASSWORD --team-id TEAMID --wait
xcrun stapler staple MyGame.app
```

### Android

- **Output**: APK (Android Package) or AAB (Android App Bundle, required for Google Play).
- **Requirements**: Android SDK + Java JDK + Gradle. Configure paths in **Editor Settings → Export → Android**.
- **Signing**: Android requires keystore. Generate with `keytool`, configure in export preset.
- **Permissions**: declare needed permissions in export preset (Internet, Storage, etc.).
- **Min/target SDK version**: set in preset. Google Play requires updating target SDK periodically.
- **Architectures**: ARMv7, ARMv8, x86, x86_64. ARMv8 modern default. More architectures bloat APK.

Mobile-specific things:

- **Use Mobile renderer**, not Forward+.
- **Texture compression**: ASTC for modern devices, ETC2 for compatibility.
- **Test on real low-end hardware**, not latest flagship phone.
- **Battery and thermal throttling**: long session throttles CPU/GPU. Plan for it.

### iOS

- **Output**: Xcode project. Build in Xcode, submit via App Store Connect.
- **Requirements**: macOS, Xcode, Apple Developer account.
- **Provisioning profiles**: required for any iOS deployment. Set up in Apple's developer portal.
- **App Store guidelines**: review before designing game. Some monetization patterns forbidden; some content restricted; some features (parental controls, accessibility) required.
- **Performance**: similar concerns to Android — test on real low-end iOS devices.

### Web

- **Output**: HTML, JS, WASM, PCK file.
- **Requirements**: web server to serve files. Local file:// URLs don't work.
- **Specific server requirements**: Godot's web export uses `SharedArrayBuffer`, requiring server to send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers.
- **Initial load size**: WASM file several megabytes; PCK project-dependent. Web games under ~50MB total for reasonable load times.
- **Memory limit**: ~2GB hard limit; less in practice. Trim assets aggressively.
- **No threading** (mostly): web has limited threading. Some Godot features depending on threads don't work.
- **Audio quirks**: web audio has known issues with Godot. Test thoroughly.
- **No file system access**: `user://` is browser local storage; no real file I/O.
- **Use Compatibility renderer** for broadest compatibility.

Typical web hosting setup:

```nginx
# nginx config snippet for hosting a Godot web export
server {
    listen 443 ssl http2;
    server_name game.example.com;

    location / {
        root /var/www/game;
        add_header Cross-Origin-Opener-Policy same-origin;
        add_header Cross-Origin-Embedder-Policy require-corp;
        try_files $uri $uri/ /index.html;
    }
}
```

`Cross-Origin-*` headers required; without them, game won't load.

### Dedicated server

Online multiplayer games: want server build that:

- Has no rendering, audio, or input.
- Runs headless on Linux.
- Uses minimal resources.

Set up dedicated-server export preset:

- **Platform**: Linux/X11
- **Custom features**: `dedicated_server` (or your own tag)
- **Templates**: use `linux_server.x86_64` template if available, or standard Linux template
- **Run as headless**: pass `--headless` on command line

In code, branch on feature:

```csharp
public override void _Ready()
{
    if (OS.HasFeature("dedicated_server") || "--server" in OS.GetCmdlineArgs())
    {
        StartServer();
    }
    else
    {
        ShowMainMenu();
    }
}
```

Strip client-only assets (textures, audio, models) from server build via export filters to make server binary smaller.

## Asset Import Settings

Biggest performance lever for many projects: **asset import settings**. Configured per-asset in import dock.

### Textures

- **Compress Mode**:
  - `Lossless` for pixel art and UI.
  - `Lossy` (WebP) for general 2D art (small files; some quality loss).
  - `VRAM Compressed` for 3D textures (S3TC/BC on desktop, ASTC/ETC on mobile).
- **Filter**:
  - `Nearest` for pixel art.
  - `Linear` for everything else.
- **Mipmaps**: generate for 3D textures and zoomed-out 2D; skip for fixed-size UI.
- **Detect 3D**: when on, Godot warns if you use 2D-imported texture in 3D. Helpful default.

### Models

- **Materials**: keep external materials (separate `.tres` files) for tweaking. Embedded materials for one-off models.
- **Mesh compression**: enable for smaller files.
- **Generate LODs**: Godot 4 can auto-generate Level-of-Detail meshes for distance-based simplification. Big win for 3D performance.
- **Generate tangents**: required for normal mapping.
- **Animation import**: select which animations to keep, set loop modes, etc.

### Audio

- **Loop**: for looping music or ambient.
- **Compression**: OGG Vorbis default, works well. WAV for short SFX where file size doesn't matter.
- **Trim**: silent leading/trailing audio.

### Fonts

- **Antialiasing**: smoother text, blurrier pixel art.
- **Subpixel positioning**: better text quality.
- **Multichannel signed distance field**: fonts needing to scale to many sizes; bigger texture, better quality.

## Build Pipeline

Non-trivial project: set up automated build pipeline. Basic flow:

1. **CI triggers** on push or release tag.
2. **Build project** via `godot --headless --export "Preset Name" output_file`.
3. **Sign and package** for target platform.
4. **Upload** to distribution (Steam, Itch.io, Google Play, App Store, etc.).

Deserves real engineering setup; treat as CI/CD concern outside this skill.

Simple GitHub Actions example for Linux build:

```yaml
name: Build Linux
on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Godot
        uses: chickensoft-games/setup-godot@v2
        with:
          version: 4.2.2
          use-dotnet: true
      - name: Import resources
        run: godot --headless --import || true
      - name: Export
        run: |
          mkdir -p build/linux
          godot --headless --export-release "Linux" build/linux/MyGame.x86_64
      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: linux-build
          path: build/linux
```

Multi-platform builds: matrix strategy or separate jobs per platform. Some platforms (macOS, iOS) require macOS runners; Android requires Android SDK; web requires right server config for testing.

## Distribution Channels

Common channels and requirements:

### Steam (Steamworks)

- **Steam Direct fee**: one-time $100 per game.
- **Steamworks SDK**: integrate via Steamworks API. Several Godot bindings exist (e.g., GodotSteam).
- **Depots**: organize files into depots; upload via SteamPipe.
- **Achievements, leaderboards, cloud saves**: integrate via Steamworks API.
- **Reviews and approval**: Steam doesn't curate heavily, but basic review.

### Itch.io

- **Free to upload**.
- **Itch app integration**: use butler to upload builds.
- **No store curation**: anyone can publish.
- **Lower exposure than Steam**, but no fees for small games.

### Epic Games Store

- **Less open** than Steam; Epic curates which games get featured.
- **EOS SDK** for Epic-specific features (achievements, friends).

### Google Play

- **$25 one-time fee** to register.
- **AAB format required** (not APK).
- **Content rating** required.
- **Play Console** for managing releases.

### App Store

- **$99/year** Apple Developer fee.
- **App Review** is real process; expect multiple rounds.
- **Strict content guidelines** — some monetization, gambling, content forbidden.
- **iOS-specific features** (iCloud, GameCenter) require integration.

### Console (Switch, PlayStation, Xbox)

- **Closed platforms**: requires applying for developer license.
- **NDAs**: most details under NDA.
- **SDK requirements**: each platform has own SDK, requires platform-specific code.
- **Out of scope** for this skill; engage porting partner if console releases needed.

## Versioning Builds

Every released build uniquely identified. Pattern:

- **Semantic version** in project settings (`config/version` or your own).
- **Build number** incrementing per build.
- **Git commit hash** baked into binary.

```csharp
public partial class VersionInfo : Node
{
    public const string Version = "1.2.3";
    public const string GitCommit = "abc1234"; // Set by CI
    public const string BuildDate = "2026-04-07"; // Set by CI

    public override void _Ready()
    {
        GD.Print($"MyGame v{Version} ({GitCommit}) built {BuildDate}");
    }
}
```

CI substitutes placeholders before building. Display version somewhere in UI (settings menu, splash screen) for bug reports.

## Telemetry and Crash Reporting

Game in players' hands: need to know what's happening. Options:

- **Crash reporting**: Sentry, Bugsnag, Backtrace, etc. Godot integrations exist or wire up via HTTP.
- **Analytics**: PostHog, GameAnalytics, Unity Analytics (yes, even for Godot games), or own backend.
- **Player feedback**: in-game feedback button submitting to backend or email.

Whatever you use, **be transparent and let players opt out**. Some jurisdictions require consent.

## Anti-Patterns

- **Testing only on dev machine.** Mobile, web, low-end hardware surface problems.
- **No automated build pipeline.** Manual builds slow, error-prone, hard to reproduce.
- **One mega-export-preset for all platforms.** Different platforms need different settings.
- **Same renderer for all platforms.** Forward+ on mobile too heavy.
- **Same texture compression for all platforms.** BCn on desktop, ASTC/ETC on mobile.
- **No version info in builds.** Bug reports come in for unknown version.
- **No code signing.** Windows SmartScreen blocks; macOS shows scary warnings.
- **No automated update system.** Players manually download new versions.
- **Web builds without right CORS headers.** Game doesn't load.
- **iOS/Android without testing on low-end device.** Performance disasters at launch.
- **No telemetry or crash reporting.** Can't tell what's broken in wild.
- **Mixing client and server in same build** without feature flag. Server has rendering and audio it doesn't need.
- **Forgetting to update target SDK** for Android. Google Play eventually rejects old SDKs.
- **Forgetting to renew Apple Developer account.** Builds expire.
- **Forgetting to renew code-signing certificates.** Builds stop signing.
- **Including dev-only files in release builds.** `*.tmp`, `*.bak`, debug logs.
- **PCK encryption with key checked into version control.** Defeats purpose.
- **Hardcoded test URLs.** Production server URL still points to dev.
- **No way to debug release builds.** No log file, no remote logging, no in-game console.
- **Releasing without beta phase.** Bugs beta would have caught hit everyone.

## Related

- [godot-fundamentals.md](godot-fundamentals.md) — `OS.HasFeature`, `OS.GetCmdlineArgs`
- [save-load-and-persistence.md](save-load-and-persistence.md) — `user://` paths and platform differences
- [performance-and-profiling.md](performance-and-profiling.md) — per-platform performance
- [multiplayer-and-websockets.md](multiplayer-and-websockets.md) — server builds
- deployment-pipeline practice — CI for Godot builds
- infrastructure provisioning practice — hosting servers and web builds, out of scope for this skill
- the [`security-reviewer`](../../../agents/security-reviewer.md) agent — code signing, anti-tampering
- [godot-anti-patterns.md](godot-anti-patterns.md) — broader patterns to avoid

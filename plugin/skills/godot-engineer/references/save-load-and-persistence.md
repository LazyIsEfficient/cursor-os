# Save / Load and Persistence

Every non-trivial game needs to save and load state — player progress, settings, achievements, current level. One of most-failed parts of indie game development, because saves must:

- **Survive game updates** without bricking player progress
- **Be tamper-resistant** (some level of) for competitive features
- **Handle errors gracefully** (corrupted file, partial write, missing file)
- **Be fast enough** to autosave without hitching
- **Be portable** across platforms (cloud saves, syncing, etc.)

Most early-stage indie games skip migration plan, ship save format breaking on next update. Players lose hours of progress; reviews tank; team scrambles. File is about not doing that.

## What to Persist

Typical game persists several different kinds of data:

| Data | Storage | Lifetime |
|---|---|---|
| **Player progress** (current level, XP, inventory) | Save file | Per save slot |
| **Settings** (audio volumes, keybindings, graphics) | Settings file | Per device |
| **Statistics** (total playtime, kills, distance) | Stats file or save | Per profile |
| **Achievements** | Achievements file or platform | Per profile |
| **Custom levels / mods** | User content folder | Per device |
| **Cache / preloaded data** | Cache | Best effort |

Often live in separate files — different lifetimes, different update strategies. Don't put settings inside save file (player loses settings on new game); don't put per-save progress in settings file (persists across saves).

## Where to Save

Godot's `user://` path is cross-platform location for save data. Maps to:

- **Windows**: `%APPDATA%\Godot\app_userdata\<project_name>\`
- **macOS**: `~/Library/Application Support/Godot/app_userdata/<project_name>/`
- **Linux**: `~/.local/share/godot/app_userdata/<project_name>/`
- **Mobile / web**: platform-specific persistent storage

Use `user://` for everything surviving game update. Don't write to `res://` (project's resources, read-only at runtime).

```csharp
// Right
var path = "user://saves/save_1.dat";

// Wrong
var path = "res://saves/save_1.dat";  // Read-only at runtime; doesn't work
var path = "C:/Users/.../saves";       // Platform-specific; doesn't work
```

Multi-slot saves: folder structure:

```
user://
├── settings.cfg
├── stats.cfg
└── saves/
    ├── slot_1.dat
    ├── slot_2.dat
    └── slot_3.dat
```

Create saves directory if not existing:

```csharp
if (!DirAccess.DirExistsAbsolute("user://saves"))
{
    DirAccess.MakeDirAbsolute("user://saves");
}
```

## Save Format Options

Godot offers several built-in mechanisms for saving data. Pick based on use case.

### `ConfigFile` — for settings and small structured data

`ConfigFile` is easiest path. INI-like format with sections and key-value pairs. Built into Godot, no external libraries, human-readable.

```csharp
public partial class Settings : Node
{
    private const string SettingsPath = "user://settings.cfg";

    public void Save()
    {
        var config = new ConfigFile();

        config.SetValue("audio", "master_volume", AudioServer.GetBusVolumeDb(0));
        config.SetValue("audio", "music_volume", AudioServer.GetBusVolumeDb(1));
        config.SetValue("audio", "sfx_volume", AudioServer.GetBusVolumeDb(2));

        config.SetValue("video", "fullscreen", DisplayServer.WindowGetMode() == DisplayServer.WindowMode.Fullscreen);
        config.SetValue("video", "vsync", DisplayServer.WindowGetVsyncMode() != DisplayServer.VSyncMode.Disabled);

        config.SetValue("input", "keybindings", SerializeKeybindings());

        config.Save(SettingsPath);
    }

    public void Load()
    {
        var config = new ConfigFile();
        var error = config.Load(SettingsPath);

        if (error != Error.Ok)
        {
            // First run, or file missing/corrupt — use defaults
            return;
        }

        AudioServer.SetBusVolumeDb(0, (float)config.GetValue("audio", "master_volume", 0.0));
        AudioServer.SetBusVolumeDb(1, (float)config.GetValue("audio", "music_volume", 0.0));
        AudioServer.SetBusVolumeDb(2, (float)config.GetValue("audio", "sfx_volume", 0.0));

        var fullscreen = (bool)config.GetValue("video", "fullscreen", false);
        DisplayServer.WindowSetMode(fullscreen ? DisplayServer.WindowMode.Fullscreen : DisplayServer.WindowMode.Windowed);

        // ... etc
    }
}
```

`ConfigFile` good for:

- Settings (audio, video, controls)
- Small flat data
- Things you want human-readable for debugging or modding

Not good for:

- Large binary data
- Complex nested structures (technically possible but awkward)
- Save files needing tamper resistance

### JSON — for structured save data

Save data with nested structure: JSON natural fit. C# in Godot has access to all of .NET — use `System.Text.Json` (built-in) or `Newtonsoft.Json` (NuGet).

`System.Text.Json` built into .NET 8, works well for most cases:

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;

public class SaveData
{
    public int Version { get; set; } = 1;
    public string PlayerName { get; set; }
    public int Level { get; set; }
    public int Experience { get; set; }
    public Vector2Save Position { get; set; }
    public List<string> Inventory { get; set; } = new();
    public Dictionary<string, int> Stats { get; set; } = new();
    public DateTime SavedAt { get; set; }
}

public class Vector2Save
{
    public float X { get; set; }
    public float Y { get; set; }

    public static Vector2Save From(Vector2 v) => new() { X = v.X, Y = v.Y };
    public Vector2 ToVector2() => new(X, Y);
}

public partial class SaveSystem : Node
{
    public void SaveGame(int slot, SaveData data)
    {
        var path = $"user://saves/slot_{slot}.json";
        DirAccess.MakeDirRecursiveAbsolute("user://saves");

        var json = JsonSerializer.Serialize(data, new JsonSerializerOptions
        {
            WriteIndented = true
        });

        using var file = FileAccess.Open(path, FileAccess.ModeFlags.Write);
        if (file == null)
        {
            GD.PrintErr($"Failed to open save file: {FileAccess.GetOpenError()}");
            return;
        }
        file.StoreString(json);
    }

    public SaveData LoadGame(int slot)
    {
        var path = $"user://saves/slot_{slot}.json";
        if (!FileAccess.FileExists(path))
        {
            return null;
        }

        using var file = FileAccess.Open(path, FileAccess.ModeFlags.Read);
        if (file == null)
        {
            GD.PrintErr($"Failed to open save file: {FileAccess.GetOpenError()}");
            return null;
        }

        var json = file.GetAsText();

        try
        {
            return JsonSerializer.Deserialize<SaveData>(json);
        }
        catch (JsonException e)
        {
            GD.PrintErr($"Failed to parse save file: {e.Message}");
            return null;
        }
    }
}
```

JSON good for:

- Most save data
- Files you might inspect manually
- Cross-language interop (e.g., backend reading saves)

Not good for:

- Binary data (textures, audio); base64 encoding bloated
- Tamper resistance (plain text, easy to edit)
- Very large saves where binary format smaller

Note on `Vector2`: Godot's `Vector2` is struct not serializing cleanly to JSON by default. Either implement converter or use wrapper class like `Vector2Save` above.

### Binary `FileAccess` — for compact or tamper-resistant saves

Binary save formats: use `FileAccess` directly:

```csharp
public void SaveBinary(int slot, SaveData data)
{
    var path = $"user://saves/slot_{slot}.dat";
    using var file = FileAccess.Open(path, FileAccess.ModeFlags.Write);

    file.Store32((uint)data.Version);
    file.StorePascalString(data.PlayerName);
    file.Store32((uint)data.Level);
    file.Store32((uint)data.Experience);
    file.StoreFloat(data.Position.X);
    file.StoreFloat(data.Position.Y);
    file.Store32((uint)data.Inventory.Count);
    foreach (var item in data.Inventory)
    {
        file.StorePascalString(item);
    }
    // ... etc
}

public SaveData LoadBinary(int slot)
{
    var path = $"user://saves/slot_{slot}.dat";
    if (!FileAccess.FileExists(path)) return null;

    using var file = FileAccess.Open(path, FileAccess.ModeFlags.Read);

    var version = (int)file.Get32();
    var data = new SaveData
    {
        Version = version,
        PlayerName = file.GetPascalString(),
        Level = (int)file.Get32(),
        Experience = (int)file.Get32(),
        Position = new Vector2Save { X = file.GetFloat(), Y = file.GetFloat() }
    };

    var inventoryCount = file.Get32();
    for (int i = 0; i < inventoryCount; i++)
    {
        data.Inventory.Add(file.GetPascalString());
    }

    return data;
}
```

Binary good for:

- Compact storage (smaller files than JSON)
- Some tamper resistance (not real security but raises bar)
- Speed (faster to read/write than JSON for large data)

Not good for:

- Debugging (can't read manually)
- Save format evolution (manage byte layout carefully)
- Cross-language sharing

Most indie projects: **JSON is right default**. Reach for binary only when JSON's downsides bite.

### `Resource.Save` — for Godot-native resources

Godot's `ResourceSaver` and `ResourceLoader` save/load any `Resource`, including custom ones:

```csharp
[GlobalClass]
public partial class SaveData : Resource
{
    [Export] public int Version { get; set; } = 1;
    [Export] public string PlayerName { get; set; }
    [Export] public int Level { get; set; }
    [Export] public Vector2 Position { get; set; }
    [Export] public Godot.Collections.Array<string> Inventory { get; set; } = new();
}

public void SaveGame(int slot)
{
    var data = new SaveData
    {
        PlayerName = "Glenn",
        Level = 5,
        Position = new Vector2(100, 200),
        Inventory = new Godot.Collections.Array<string> { "sword", "potion" }
    };

    var path = $"user://saves/slot_{slot}.tres";
    ResourceSaver.Save(data, path);
}

public SaveData LoadGame(int slot)
{
    var path = $"user://saves/slot_{slot}.tres";
    if (!ResourceLoader.Exists(path)) return null;
    return ResourceLoader.Load<SaveData>(path);
}
```

`Resource`-based saves convenient because:

- Native Godot serialization (handles `Vector2`, `Color`, etc.)
- Save data just `Resource` editable in inspector
- Type-safe in C#
- No JSON converters needed for Godot types

Downsides:

- Files in Godot's `.tres` text format (or binary `.res`); harder to inspect than JSON
- Less portable to other systems
- Loading bypasses `Resource` cache, can cause issues with reused references

Most save data: JSON more flexible. Use `Resource.Save` when save data genuinely just Godot objects.

## Save Versioning (Critical)

**Every save format must have version number.** Without one, cannot evolve save format without breaking existing saves. Non-negotiable.

```csharp
public class SaveData
{
    public int Version { get; set; } = CurrentVersion;
    public const int CurrentVersion = 3;

    // ... other fields
}

public SaveData LoadGame(int slot)
{
    var data = LoadRaw(slot);
    if (data == null) return null;

    if (data.Version < CurrentVersion)
    {
        data = MigrateSave(data);
    }

    return data;
}

private SaveData MigrateSave(SaveData data)
{
    if (data.Version == 1)
    {
        // Migrate v1 → v2
        // (Add new fields, transform existing ones)
        data.Version = 2;
    }

    if (data.Version == 2)
    {
        // Migrate v2 → v3
        data.Version = 3;
    }

    return data;
}
```

Two important rules:

1. **Migrations are step-by-step.** v1 → v2 → v3, not v1 → v3 directly. Skip steps → can't add v4 cleanly later.
2. **Migrations only go forward.** Don't try to make new saves work with old versions of game.

What needs migration:

- New fields with defaults (migration sets default)
- Renamed fields (migration copies old value to new name)
- Changed structure (migration restructures data)
- Removed fields (migration ignores them)

### When to bump the version

Any change to save format not purely additive with sensible defaults. Game can read v1 saves correctly without code changes → version doesn't need bump. Can't → bump it, write migration.

Conservative rule: **bump on every meaningful change, even if you think it's compatible.** Easier to have many small migrations than one big "what changed" investigation.

### Version mismatch — too new

Save file has version *higher* than current game (player downgraded?) → don't try to load. Show clear message: "This save was made with a newer version of the game. Please update."

```csharp
if (data.Version > CurrentVersion)
{
    GD.PrintErr("Save is from a newer version; cannot load");
    ShowError("This save is from a newer version of the game.");
    return null;
}
```

## Autosave

Most modern games autosave. Pattern:

```csharp
public partial class AutoSaveManager : Node
{
    [Export] public float AutoSaveInterval { get; set; } = 60.0f; // 1 minute

    private float _timeSinceLastSave = 0;

    public override void _Process(double delta)
    {
        _timeSinceLastSave += (float)delta;
        if (_timeSinceLastSave >= AutoSaveInterval)
        {
            AutoSave();
            _timeSinceLastSave = 0;
        }
    }

    public void AutoSave()
    {
        var saveData = GameState.GetCurrentSaveData();
        SaveSystem.Save("autosave", saveData);
        ShowAutosaveIndicator();
    }
}
```

Rules:

- **Don't autosave during action.** Save at safe points: between rooms, during pauses, when player idle.
- **Show brief indicator** when autosave happens, so player knows.
- **Don't block main thread for long saves.** Save heavy? Do it in background thread.
- **Have multiple autosave slots.** Autosave 1 corrupts → fall back to autosave 2.
- **Combine with manual save slots.** Autosave for safety; manual saves for player control.

## Save Errors

Saves fail. Disk full; file locked; game crashes mid-write. Handle errors gracefully:

```csharp
public bool TrySave(int slot, SaveData data)
{
    try
    {
        var path = $"user://saves/slot_{slot}.json";
        var tempPath = path + ".tmp";

        // Write to a temp file first
        using (var file = FileAccess.Open(tempPath, FileAccess.ModeFlags.Write))
        {
            if (file == null)
            {
                GD.PrintErr($"Failed to open temp save file: {FileAccess.GetOpenError()}");
                return false;
            }
            file.StoreString(JsonSerializer.Serialize(data));
        }

        // Replace the real file with the temp file
        if (FileAccess.FileExists(path))
        {
            DirAccess.RemoveAbsolute(path);
        }
        DirAccess.RenameAbsolute(tempPath, path);
        return true;
    }
    catch (Exception e)
    {
        GD.PrintErr($"Save error: {e.Message}");
        return false;
    }
}
```

"Write to temp, then rename" pattern prevents partial writes from corrupting existing save. Write fails or game crashes → existing save untouched.

Really paranoid: **keep N backups**. Every save, rotate previous file to `.bak.1`, `.bak.2`, etc. Current save corrupt → fall back.

## Tamper Resistance

Purely single-player games: full save security not needed — players can edit own saves if they want. Game has competitive features (leaderboards, achievements, multiplayer)? Some tamper resistance worth having.

Levels of protection:

1. **None** — JSON in plain text. Anyone can edit.
2. **Obfuscation** — base64 encoding, simple XOR. Stops casual modification, doesn't stop motivated players.
3. **Hashing** — include hash of data; reject saves where hash doesn't match. Stops most edits but reverse-engineerable.
4. **Encryption** — encrypt with key shipped in binary. Stops most players but key extractable.
5. **Server-side validation** — authoritative save lives on server; client never has unencrypted data. Only real protection.

Single-player game with leaderboards: hashing usually enough:

```csharp
private string ComputeHash(string data)
{
    var bytes = System.Text.Encoding.UTF8.GetBytes(data + "secret_salt");
    var hash = System.Security.Cryptography.SHA256.HashData(bytes);
    return Convert.ToHexString(hash);
}

public void SaveWithHash(SaveData data)
{
    var json = JsonSerializer.Serialize(data);
    var hash = ComputeHash(json);

    var wrapped = new { Data = json, Hash = hash };
    var wrappedJson = JsonSerializer.Serialize(wrapped);

    // Save wrappedJson
}

public SaveData LoadWithHash(string wrappedJson)
{
    var wrapper = JsonSerializer.Deserialize<JsonElement>(wrappedJson);
    var json = wrapper.GetProperty("Data").GetString();
    var savedHash = wrapper.GetProperty("Hash").GetString();

    var computedHash = ComputeHash(json);
    if (savedHash != computedHash)
    {
        GD.PrintErr("Save file tampered with");
        return null;
    }

    return JsonSerializer.Deserialize<SaveData>(json);
}
```

Not real security — salt in binary, extractable — but stops casual tampering.

## Cloud Saves

Steam, Epic, GOG, mobile stores, etc.: platform usually provides cloud save sync. Configure in:

- **Steam**: Steamworks settings; configure Steam Cloud quota and file paths. Save files in `user://` typically picked up.
- **Epic / GOG**: similar mechanisms.
- **iOS / Android**: platform-specific APIs (Game Center, Google Play Games).

Most desktop stores: cloud sync automatic if saving to `user://`. Verify on each platform.

## Common Save Patterns

### Profile system

Profile is player's identity (name, settings, achievements). Save slots are individual game runs by that profile.

```
user://
├── profiles/
│   ├── default/
│   │   ├── settings.cfg
│   │   ├── achievements.cfg
│   │   └── saves/
│   │       ├── slot_1.json
│   │       └── slot_2.json
│   └── second_player/
│       └── ...
```

### Save metadata

Each save has metadata visible in load menu — playtime, level, screenshot, save date. Store loadable *without* loading entire save:

```csharp
public class SaveMetadata
{
    public int Version { get; set; }
    public string PlayerName { get; set; }
    public int Level { get; set; }
    public TimeSpan Playtime { get; set; }
    public DateTime SavedAt { get; set; }
    public string ScreenshotPath { get; set; }
}
```

Metadata file small, quick to load. Full save data loaded only when player picks slot.

### Atomic level saves

Game has discrete "levels" or "rooms"? Save state of each separately. Player leaves room → save its state to own file. Return → load it. Makes saves smaller; avoids re-saving entire world every time.

## Anti-Patterns

- **No version field.** First time you change save format, every existing save breaks.
- **No migration code.** Bumped version but didn't write migration. Old saves crash on load.
- **Saving during gameplay** without considering cost. Frame hitches when disk write slow.
- **Direct write to real file.** Game crashes mid-write → save corrupted. Use temp + rename.
- **Saving everything in one giant file.** Slow to read/write; corruption risk; can't load partial state.
- **Plain-text saves with leaderboard scores.** Players edit them, submit fake scores.
- **Saving raw `Vector2` to JSON without converter.** Doesn't serialize correctly with `System.Text.Json`.
- **Loading without error handling.** Corrupted file → unhandled exception → game crash.
- **`res://` instead of `user://`.** Doesn't work; `res://` read-only at runtime.
- **No autosave at all.** Player loses progress on crash.
- **Autosave so frequent it hitches game.** Save at safe points, not every frame.
- **No backups.** One corrupt file = lost progress. Keep at least one previous save.
- **Saving editor-only state.** Some properties editor-only, don't make sense at runtime.
- **Cross-platform incompatible serialization.** `BinaryFormatter` is .NET-specific; .NET 8 even refuses to use it.
- **Saving `Node` references directly.** Don't serialize; save IDs, reconstruct.
- **Migration code not idempotent.** Running twice produces different results.
- **No way to tell which version save is.** Hidden in binary; debugging impossible.
- **Cloud sync conflicts not handled.** Two devices write different saves; no resolution strategy.
- **Save format coupled to scene structure.** Refactoring scene breaks every existing save.

## Related

- [godot-fundamentals.md](godot-fundamentals.md) — `Resource`, `FileAccess`
- [exporting-and-platforms.md](exporting-and-platforms.md) — platform-specific save locations and cloud sync
- the [`security-reviewer`](../../../agents/security-reviewer.md) agent — for tamper-resistant saves
- [godot-anti-patterns.md](godot-anti-patterns.md) — broader patterns to avoid

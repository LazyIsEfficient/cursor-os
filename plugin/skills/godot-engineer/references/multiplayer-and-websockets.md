# Multiplayer and WebSockets

File is specifically about **WebSocket-based multiplayer in Godot 4 with C#** — right pattern for browser-friendly games, asymmetric network conditions, games needing firewall traversal without UDP.

WebSockets right choice when:

- Game runs on **web** (UDP unavailable).
- Need **firewall traversal** without NAT punching or relays.
- Need **simple deployment model** (HTTP-style infrastructure, TLS, load balancers).
- Game is **turn-based or low-tempo** enough that TCP latency acceptable.

WebSockets *not* right choice when:

- Need **sub-50ms responsiveness** for fast-paced action (use ENet or UDP).
- Need **lockstep determinism** for fighting games (use deterministic protocol).
- Shipping **only to native platforms** with no web target (UDP faster).

For this skill, assumption is **WebSockets are chosen transport**. Godot 4 has first-class support via `WebSocketMultiplayerPeer`.

## Godot's High-Level Multiplayer

Godot's "high-level multiplayer" API is layer letting you call methods on remote peers (RPCs) and synchronize state across network. Transport-agnostic — same RPC code works over ENet, WebSockets, WebRTC. Pick transport via `MultiplayerPeer` you assign.

Architecture:

1. **A `MultiplayerPeer`** handles actual network connection. WebSockets: `WebSocketMultiplayerPeer`.
2. **The `MultiplayerAPI`** (one per `SceneTree`) manages high-level RPC system on top of peer.
3. **Nodes call RPCs** on each other; API serializes calls, sends over peer.
4. **Authority** determines which peer "owns" a node, is source of truth for it.

## Basic Setup

### Server

```csharp
public partial class Server : Node
{
    [Export] public int Port { get; set; } = 9000;

    public void Start()
    {
        var peer = new WebSocketMultiplayerPeer();
        var error = peer.CreateServer(Port);
        if (error != Error.Ok)
        {
            GD.PrintErr($"Failed to start server: {error}");
            return;
        }

        Multiplayer.MultiplayerPeer = peer;
        GD.Print($"Server started on port {Port}");

        Multiplayer.PeerConnected += OnPeerConnected;
        Multiplayer.PeerDisconnected += OnPeerDisconnected;
    }

    private void OnPeerConnected(long id)
    {
        GD.Print($"Peer {id} connected");
        // Spawn a player for this peer, etc.
    }

    private void OnPeerDisconnected(long id)
    {
        GD.Print($"Peer {id} disconnected");
        // Clean up that peer's state
    }
}
```

### Client

```csharp
public partial class Client : Node
{
    [Export] public string ServerUrl { get; set; } = "ws://localhost:9000";

    public void Connect()
    {
        var peer = new WebSocketMultiplayerPeer();
        var error = peer.CreateClient(ServerUrl);
        if (error != Error.Ok)
        {
            GD.PrintErr($"Failed to create client: {error}");
            return;
        }

        Multiplayer.MultiplayerPeer = peer;

        Multiplayer.ConnectedToServer += OnConnectedToServer;
        Multiplayer.ConnectionFailed += OnConnectionFailed;
        Multiplayer.ServerDisconnected += OnServerDisconnected;
    }

    private void OnConnectedToServer()
    {
        GD.Print("Connected to server");
    }

    private void OnConnectionFailed()
    {
        GD.PrintErr("Connection failed");
    }

    private void OnServerDisconnected()
    {
        GD.Print("Disconnected from server");
    }
}
```

Things to note:

- **`ws://`** for unencrypted WebSocket; **`wss://`** for TLS-encrypted (use in production).
- **`CreateServer(port)`** for server; **`CreateClient(url)`** for client.
- **Same `MultiplayerPeer` interface** works for both; difference is whether you call `CreateServer` or `CreateClient`.
- **`Multiplayer.PeerConnected` / `PeerDisconnected`** fire on *server*; client only sees own connection state.

## RPCs

Remote Procedure Call (RPC) is method that, called on one peer, executes on another peer (or many peers). In Godot 4 C#:

```csharp
public partial class Player : CharacterBody2D
{
    [Rpc(MultiplayerApi.RpcMode.Authority, CallLocal = true, TransferMode = MultiplayerPeer.TransferModeEnum.Reliable)]
    public void SpawnAt(Vector2 position)
    {
        GlobalPosition = position;
        Visible = true;
    }

    [Rpc(MultiplayerApi.RpcMode.AnyPeer, TransferMode = MultiplayerPeer.TransferModeEnum.Unreliable)]
    public void RequestMove(Vector2 newPosition)
    {
        // Validate on the server
        if (Multiplayer.IsServer())
        {
            // Sanity-check the move
            if (newPosition.DistanceTo(GlobalPosition) > MaxMoveDistance) return;
            GlobalPosition = newPosition;
            // Broadcast the new position to all clients
            Rpc(MethodName.SyncPosition, newPosition);
        }
    }

    [Rpc(MultiplayerApi.RpcMode.Authority, CallLocal = false, TransferMode = MultiplayerPeer.TransferModeEnum.Reliable)]
    public void SyncPosition(Vector2 newPosition)
    {
        GlobalPosition = newPosition;
    }
}
```

`[Rpc]` attribute marks method as RPC-callable. Parameters:

- **`RpcMode`**:
  - **`Authority`**: only peer with authority over this node can call it.
  - **`AnyPeer`**: any peer can call it.
- **`CallLocal`**: whether local peer also runs method when calling RPC. Default `false` (only remote runs).
- **`TransferMode`**:
  - **`Reliable`**: guaranteed delivery, in order. Slower. Use for important events.
  - **`Unreliable`**: fire and forget. Fastest. Use for high-frequency state updates where missing one fine.
  - **`UnreliableOrdered`**: fire and forget but ordered. Use for sequenced state updates.

To call RPC:

```csharp
// Call RPC on this node, on all peers (including server)
Rpc(MethodName.SpawnAt, new Vector2(100, 100));

// Call RPC on this node, on a specific peer
RpcId(targetPeerId, MethodName.SpawnAt, new Vector2(100, 100));

// Call RPC on this node, locally only (just calls the method)
SpawnAt(new Vector2(100, 100));
```

`MethodName.SpawnAt` is generated constant (similar to `SignalName.X`). Use for type safety.

**Important caveat for WebSockets**: WebSockets are TCP-based, so "Unreliable" RPCs still delivered reliably and in order. `TransferMode` is *advisory* — WebSocket peer ignores it, treats everything as reliable. Different from ENet, where unreliable genuinely faster. WebSocket-based games: design assuming all messages reliable.

## Authority

Each node has **authority** — peer ID that's source of truth for node. Default: server (peer ID 1) has authority over everything.

```csharp
// Set authority on a node
playerNode.SetMultiplayerAuthority(peerId);

// Check authority
if (playerNode.IsMultiplayerAuthority()) { ... }

// Get the authority's peer ID
var authority = playerNode.GetMultiplayerAuthority();
```

Authority pattern critical for security: only authoritative peer should make decisions about its node's state. Other peers see *result* of decisions, don't get to modify them.

Most networked games: **server is authority**. Clients send inputs (move requests, action requests); server validates, applies, broadcasts results. Prevents cheating — clients can't directly modify game state, only ask server to do things.

Opposite pattern (**clients have authority over own players**) simpler but vulnerable to cheating. Fine for cooperative or trusted games; wrong for competitive games.

## State Synchronization

State changing frequently (player positions, animations, health): several options:

### Manual sync (RPC every frame)

Simplest approach: send state via RPC every physics frame.

```csharp
public override void _PhysicsProcess(double delta)
{
    if (IsMultiplayerAuthority())
    {
        // Local player; do movement and broadcast
        DoMovement(delta);
        Rpc(MethodName.SyncTransform, GlobalPosition, Rotation);
    }
}

[Rpc(MultiplayerApi.RpcMode.Authority, CallLocal = false, TransferMode = MultiplayerPeer.TransferModeEnum.Reliable)]
public void SyncTransform(Vector2 position, float rotation)
{
    GlobalPosition = position;
    Rotation = rotation;
}
```

Works for small games, doesn't scale — every frame sends packet per player. 60 FPS × 8 players = 480 packets per second. Over WebSockets, can saturate.

### `MultiplayerSynchronizer` node

Godot 4 has `MultiplayerSynchronizer` node automatically synchronizing specified properties of node. Add as child of node to sync; configure which properties to replicate; engine handles rest.

```
Player (CharacterBody2D)
├── Sprite2D
├── MultiplayerSynchronizer
│   Replication Config:
│     - position
│     - rotation
│     - velocity
└── ...
```

`MultiplayerSynchronizer` reads properties on authority peer, replicates to all other peers. Default: sends every frame; configurable rate.

Recommended way to sync state in Godot 4. Less code than manual RPCs; engine optimizes wire format.

### `MultiplayerSpawner` node

Similarly, `MultiplayerSpawner` automatically replicates node spawning across network. Add to parent node, configure spawnable scenes; authority spawns one → all clients receive spawn.

```
Level
├── MultiplayerSpawner
│   Spawn Path: ../Players
│   Spawnable Scenes: [player.tscn, enemy.tscn]
└── Players (Node)
```

Server adds child to `Players` → spawner replicates it. Server removes it → all clients also remove it.

### Bandwidth considerations

WebSockets over TLS have per-message overhead. Hundreds of small messages per second wasteful. Two strategies:

- **Batch updates**: collect state changes for multiple objects, send in one RPC.
- **Reduce update frequency**: sync at 20Hz instead of 60Hz; interpolate visually on client.

```csharp
private float _syncTimer = 0;
private const float SyncInterval = 1.0f / 20.0f; // 20Hz

public override void _PhysicsProcess(double delta)
{
    if (IsMultiplayerAuthority())
    {
        DoMovement(delta);
        _syncTimer += (float)delta;
        if (_syncTimer >= SyncInterval)
        {
            Rpc(MethodName.SyncTransform, GlobalPosition, Rotation);
            _syncTimer = 0;
        }
    }
}
```

Client side: interpolate visually between received positions:

```csharp
private Vector2 _lastReceivedPosition;
private Vector2 _targetPosition;
private float _interpolationTimer = 0;

public override void _Process(double delta)
{
    if (!IsMultiplayerAuthority())
    {
        // Interpolate toward the latest received position
        _interpolationTimer += (float)delta;
        var t = Mathf.Min(_interpolationTimer / SyncInterval, 1.0f);
        GlobalPosition = _lastReceivedPosition.Lerp(_targetPosition, t);
    }
}

[Rpc(MultiplayerApi.RpcMode.Authority, CallLocal = false, TransferMode = MultiplayerPeer.TransferModeEnum.Reliable)]
public void SyncTransform(Vector2 position, float rotation)
{
    _lastReceivedPosition = GlobalPosition;
    _targetPosition = position;
    _interpolationTimer = 0;
    Rotation = rotation;
}
```

20Hz updates with client-side interpolation often look as smooth as 60Hz updates with much less bandwidth.

## Client-Side Prediction (Briefly)

Competitive games where input latency matters: want **client-side prediction** — client immediately applies own input locally, then reconciles with server's authoritative state.

Pattern:

1. Client sends input to server.
2. Client immediately applies input locally (predicted).
3. Server processes input, sends back authoritative state.
4. Client compares predicted state to server's state.
5. Differ → client rolls back, re-applies inputs.

This is *complex*. Implementing correctly is significant undertaking. High-level Godot API doesn't provide it; you build on top.

Most WebSocket-based games: **don't bother with prediction**. WebSockets usually slow enough that prediction isn't appropriate; need prediction-quality responsiveness → probably shouldn't use WebSockets in first place.

Really need prediction over WebSockets (e.g., fast-paced game that must run on web)? Consider:

- **Predictive movement only**, not predictive combat.
- **Authoritative server for combat** to prevent cheating.
- **Visual interpolation everywhere** to hide network roughness.

## Server vs Peer-to-Peer

Two architectures:

### Dedicated server

- One process is server; all clients connect to it.
- Server has authority over all game state.
- Clients send inputs, receive state.
- **Pros**: cheat resistance; consistent experience; hostable in cloud.
- **Cons**: requires server infrastructure; cost.

### Peer-to-peer with one host

- One client is "host", acts as server. Other clients connect to it.
- Host has authority over all game state.
- **Pros**: no server infrastructure cost.
- **Cons**: host has unfair advantage (zero latency to itself); host migration hard; vulnerable to host's network conditions; firewall traversal harder (though WebSockets help).

WebSocket games: **dedicated server is more practical choice**. WebSockets need server endpoint anyway; making dedicated server straightforward. P2P over WebSockets requires relay server — basically just dedicated server again.

## Hosting a Godot WebSocket Server

Godot multiplayer server can run as:

1. **Regular Godot exported binary** in headless mode (`--headless`).
2. **Separate "server" project** sharing code with client via shared module.
3. **Custom server** in another language speaking Godot's protocol (advanced).

First option easiest. Build client project with "server" feature flag; export as Linux server build; deploy to VPS or container.

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

Deployment: treat server like any long-running process. See:

- **infrastructure provisioning practice** for standing up host — out of scope for this skill
- **deployment-pipeline practice** for build and deploy
- **site-reliability-engineering** for keeping it running and observing it

## TLS / Secure WebSockets

Production WebSocket servers should use TLS (`wss://`). Godot handles TLS via either:

- **Godot's built-in TLS**: configure server with certificate.
- **Reverse proxy in front**: nginx, Caddy, or load balancer terminates TLS, forwards plain WebSocket to Godot.

Reverse proxy approach usually easier — proxy handles certificate renewal (Let's Encrypt); Godot server stays simple.

```nginx
server {
    listen 443 ssl;
    server_name game.example.com;

    ssl_certificate /etc/letsencrypt/live/game.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/game.example.com/privkey.pem;

    location /game {
        proxy_pass http://localhost:9000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Client connects with `wss://game.example.com/game`.

## Lobbies and Matchmaking

More than single fixed server → need lobby/matchmaking system. WebSockets work naturally with HTTP infrastructure; typical pattern:

1. **HTTP API** (separate from game server) handles authentication, lobby browsing, matchmaking.
2. **HTTP API tells client** which game server to connect to.
3. **Client connects to chosen game server** via WebSocket.

HTTP API can be:

- Custom backend (Node, Go, Python, .NET) — pair with [`engineer`](../../../agents/engineer.md) agent; hosting and provisioning out of scope for this skill.
- Managed service (PlayFab, Nakama, Heroic Labs).
- Game server itself (one server handles both lobby and game; simpler but doesn't scale to many concurrent rooms).

## Security

Multiplayer games are security concern. Basics:

### Server-side validation

Client cannot be trusted. Anything client says about own state validated by server before applied:

- **Move requests**: check move legal (distance, direction, collisions).
- **Action requests**: check action allowed (cooldowns, permissions).
- **State changes**: never let client directly set game state; always through validation.

Common pattern: clients send *intents* (what they want to do); server decides whether to allow.

```csharp
[Rpc(MultiplayerApi.RpcMode.AnyPeer)]
public void RequestAttack(int targetPlayerId)
{
    if (!Multiplayer.IsServer()) return;

    var sender = Multiplayer.GetRemoteSenderId();
    var attacker = GetPlayer(sender);
    var target = GetPlayer(targetPlayerId);

    // Validate
    if (attacker == null || target == null) return;
    if (attacker.Cooldown > 0) return;
    if (attacker.Position.DistanceTo(target.Position) > attacker.AttackRange) return;

    // Apply
    target.TakeDamage(attacker.AttackDamage);
    attacker.Cooldown = attacker.AttackCooldown;

    // Broadcast result
    Rpc(MethodName.OnAttack, sender, targetPlayerId, attacker.AttackDamage);
}
```

Server is only authority on attack outcomes. Clients just play visual result.

### Rate limiting

Clients can spam RPCs. Server should rate-limit per-client: max N RPCs per second per peer. Drop or disconnect peers exceeding.

### Authentication

Game has user accounts → authenticate WebSocket connection:

- Pass token in URL or as header during WebSocket handshake.
- Validate token on server before accepting connection.
- Reject unauthenticated connections.

```csharp
// Client
peer.CreateClient($"wss://game.example.com/game?token={authToken}");

// Server (need to check the URL during handshake — Godot exposes this via the underlying HTTP request)
```

Godot's `WebSocketMultiplayerPeer` doesn't expose handshake headers easily; production auth may need reverse proxy validating token before passing to game server.

### Anti-cheat

Beyond server-side validation, common anti-cheat measures:

- **Track suspicious patterns**: player whose actions too fast or too consistent might be bot.
- **Rate-limit movement and actions** strictly.
- **Refuse client-side hit confirmation** (always validate hits server-side).
- **Encrypt sensitive game state** before sending to client (so client can't see things it shouldn't, like enemy positions outside vision).

Competitive games: cheating real concern; refer to [`security-reviewer`](../../../agents/security-reviewer.md) agent for broader practices.

## Reconnection and Network Loss

Networks fail. Connections drop. Players reload tabs. Game must handle gracefully.

### Detecting disconnection

`Multiplayer.ServerDisconnected` signal fires on client when server connection lost. `Multiplayer.PeerDisconnected` signal fires on server when peer disconnects.

```csharp
public override void _Ready()
{
    Multiplayer.ServerDisconnected += OnServerDisconnected;
}

private void OnServerDisconnected()
{
    GD.Print("Lost connection to server");
    ShowReconnectDialog();
}
```

### Reconnection strategy

Brief disconnects (network blip): automatically reconnect with backoff:

```csharp
private int _reconnectAttempts = 0;
private const int MaxReconnectAttempts = 5;

private async void TryReconnect()
{
    if (_reconnectAttempts >= MaxReconnectAttempts)
    {
        ShowReconnectFailed();
        return;
    }

    var backoff = Mathf.Pow(2, _reconnectAttempts) * 1000; // 1s, 2s, 4s, 8s, 16s
    await ToSignal(GetTree().CreateTimer(backoff / 1000.0), Timer.SignalName.Timeout);

    _reconnectAttempts++;
    Connect();
}
```

Session continuity: server needs to remember player's state for some time after disconnect, let them re-claim on reconnect (often with session token).

### Graceful failure

Reconnection fails → game should:

- Show clear error message ("Lost connection to server").
- Offer way to retry or return to main menu.
- Save any progress savable locally.
- Not crash or hang.

## Anti-Patterns

- **Trusting client.** Clients lie. Validate everything server-side.
- **Authority on client** in competitive game. Clients can cheat.
- **State changes via direct property set.** Use RPCs through high-level API.
- **Sending large RPCs every frame.** Batch and rate-limit.
- **Using "unreliable" RPCs over WebSockets** thinking they'll be faster. They aren't.
- **No client-side interpolation** with low-frequency updates. Player positions look jerky.
- **No reconnection logic.** Network blip kicks player out permanently.
- **Hardcoded server URLs.** Configure via build flag or runtime input.
- **Connecting without TLS in production.** Plaintext WebSockets intercept-able.
- **No authentication on game server connections.** Anyone with URL can join.
- **No rate limiting.** Clients spam RPCs, DoS server.
- **Storing game state in scenes only on host.** Host crashes → game lost.
- **No graceful shutdown.** Server kill leaves clients hanging.
- **No observability on server.** Can't tell why running slowly or crashing.
- **Mixing P2P and server-authoritative patterns.** Inconsistent who-decides-what semantics.
- **Synchronizing things not needing synchronizing.** Particle effects, audio, UI — local-only.
- **Replicating physics state** instead of inputs. Bandwidth-heavy, prone to divergence.
- **Long blocking operations on server's main thread.** Stalls all clients.
- **No server-side logging of suspicious actions.** Can't detect or investigate cheating.
- **Different game logic on client and server.** Drift; cheating; debugging hell.

## Related

- [godot-fundamentals.md](godot-fundamentals.md) — `Node`, `MultiplayerApi`
- [signals-and-events.md](signals-and-events.md) — connection signals
- the [`security-reviewer`](../../../agents/security-reviewer.md) agent — server-side validation, anti-cheat
- system-architect — server architecture, scaling
- infrastructure provisioning practice — hosting server, out of scope for this skill
- deployment-pipeline practice — building and deploying server
- site-reliability-engineering — running server in production
- [godot-anti-patterns.md](godot-anti-patterns.md) — broader patterns to avoid

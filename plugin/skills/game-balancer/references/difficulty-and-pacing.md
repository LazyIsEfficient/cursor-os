# Difficulty and pacing

Difficulty ≠ challenge. **Difficulty** = how hard system is. **Challenge** = player's experience of being meaningfully tested. Game can be difficult without challenging (just unfair), challenging without difficult (asks player to think, not react fast).

## The flow channel

Classical model: player improves → system should get harder. Skill outpaces challenge → boredom. Challenge outpaces skill → anxiety. "Flow channel" = band where they roughly match.

Visualized as graph:
- X-axis: time / progress
- Y-axis: difficulty (challenge)
- Two diagonals: boredom floor, anxiety ceiling
- Flow channel: band between

Well-tuned game keeps players in flow channel for bulk of experience, with deliberate excursions:
- **Just-above-floor** (early game, breathers, victory laps)
- **Just-below-ceiling** (boss fights, climactic moments, late game)

Constant-flow game exhausting; constant-floor game forgettable.

## The first failure

Where *first* failure lands shapes whole experience. Two patterns:

- **Failure-as-tutorial** — player fails early, low-stakes, learns something. Forms opinion "this game is fair and teaches me." Best for Challenge games.
- **Failure-after-investment** — player succeeds for hours, then hits wall. Forms opinion "this game ambushed me." Catastrophic for retention.

Schedule first failure deliberately. Playtest-validate *first* failure feels fair, not just *most* failures.

## Difficulty curve shape

Difficulty has shape choices like progression curves:

- **Smooth ramp** — gentle continuous increase. Best for narrative-led games.
- **Stepped** — long flats interrupted by spikes (boss fights, world transitions). Best for traditional action games.
- **Wave** — alternating high/low intensity. Best for survival, horror, long-session games (gives breather).
- **Choose-your-own** — player picks difficulty (easy / normal / hard / nightmare). Best for replay value, accessibility, broad audiences.
- **Adaptive (DDA)** — system measures player success rate, tunes real-time. Best for games where one curve can't fit audience (e.g. *Resident Evil 4*'s adaptive ammo drops).

Pick shape; constants come from playtest data, not spreadsheet.

## DDA (dynamic difficulty adjustment)

DDA hides difficulty change from player. Done well, players feel game "just gets them." Done badly, players feel cheated realizing game secretly made things easy/hard.

Rules:
- **Adjust resources, not rules.** Struggling player → boss drops more ammo; boss should NOT change behavior mid-fight in ways breaking player's mental model.
- **Adjust slowly.** Per-encounter, per-level, per-session — not per-hit.
- **Don't punish improvement.** Improving player should *feel* difficulty rise to match, not auto-scaled to 50% win rate forever.
- **Disclose if asked.** Don't deny DDA exists; players reverse-engineer it. Just don't *explain* loudly during play.

## Rubber-banding (specific case)

Racing games, some MOBAs — keeps matches close. Often hated when over-applied.

- **Light rubber-banding** — lead car loses small % speed; trailing car gets small boost. Middle players see "anyone can win until last lap."
- **Heavy rubber-banding** — first place actively punished; last place catches up effortlessly. First place rage-quits.

Use light rubber-banding when goal is *parity of session experience*. Don't use when goal is *recognition of skill*.

## Pacing within a level/encounter

Well-paced encounter has:
- **Open** — establish threat at moderate intensity
- **Build** — escalate; additional pressure (more enemies, less time, harder choices)
- **Twist** — change conditions (new mechanic, environmental shift, reveal)
- **Climax** — peak intensity; player uses everything learned in encounter
- **Resolve** — intensity falls; reward; transition to next encounter

Flat-intensity encounter exhausting. Start-climax encounter anti-climactic. Never-twisting encounter forgettable.

## Pacing across a session

Single session: layer multiple encounter-arcs:

- **First encounter:** moderate intensity (warmup)
- **Middle encounters:** alternating high/low (breathers between intense moments)
- **Final encounter:** highest session intensity
- **Post-final:** quiet beat — player reflects / saves / quits on high note

Sessions ending low (defeat, chore) reduce return rate. Sessions ending high (victory, level-up, reveal) increase it. Schedule "exit ramps" deliberately.

## Difficulty and aesthetic

Difficulty curve must serve dominant aesthetic:

- **Challenge** — needs real curve; players opt in for difficulty
- **Discovery** — moderate difficulty; *exploration* is reward, not survival
- **Sensation** — easier; player here for feel, not trial
- **Narrative** — easier; *story* is reward; hard fights interrupt it
- **Fellowship** — variable; some want harder for bragging rights, others easier for hangout
- **Submission** — flat; difficulty barely matters

Roguelike pitched on Challenge shipping smooth easy curve = aesthetic betrayal.

## Output for the design / balance

In balance docs:
- **Chosen difficulty curve shape** + rationale
- **First-failure plan** — where it lands, why fair, what player keeps
- **Per-encounter difficulty target** (often target first-attempt completion-rate, e.g. 60%)
- **DDA rules** if any (what adjusts, by how much, how often)
- **Telemetry** — success/failure events to track for post-launch curve validation

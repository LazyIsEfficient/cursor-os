# Cohesion checklist

Run every system in design doc through these tests. Failing system is *cut* or *reworked* — silently keeping failing system is how feature soup ships.

## The compounding test

Per system, name:

- **What other systems is this system *better* because of?** (which amplify it)
- **What other systems does this system make *better*?** (which it amplifies)

Both answers "none" → system isolated — cut it or merge into related system.

One answer "many", other "none" → system parasitic (consumes value without giving back) or feeder (produces value nothing consumes). Both need rework.

Healthiest systems are *both consumers and producers* of value from at least 2–3 other systems.

## The fantasy test

Per system:
- **Which aesthetic from design doc does this system serve?**
- **Which player verb does this system support?**

Serves no aesthetic, supports no verb → feature without fantasy. Cut.

## The cut test

Per system, ask team: *if we cut this system, what does the game lose?*

- "Nothing important" → cut it.
- "A whole pillar of the experience" → keep it; load-bearing.
- "The game would feel less rich" → suspicious; "richness" often euphemism for clutter. Probe further.

## The seam test

Per interaction between two systems, ask:
- **Is the seam visible to player?** (Do they understand A and B are connected?)
- **Is the seam *enjoyable*?** (Does player like A and B interacting, or find it confusing/unfair?)

Hidden, unenjoyable seams are where players say "the game is buggy" when really systems fight each other.

## The currency test

Count currencies (any tracked resource gating content):

- **1–2 currencies** — usually right
- **3 currencies** — workable if each has *clearly different role* (e.g. soft / hard / time)
- **4+ currencies** — almost always broken; consolidate

Each currency needs:
- **Source** (how player earns it) connecting to a verb
- **Sink** (what player spends it on) producing meaningful choice
- **Velocity** (accumulation/depletion rate) tuned to session cadence

Currencies with no source / no sink / no velocity discipline are spreadsheet rows, not systems.

## The new-player test

Walk hypothetical new player through first hour. Per system:

- **Has player seen this system yet?**
- **Is it relevant to what they're doing right now?**
- **Gated until later? What's the unlock pacing?**

12 systems all visible from minute one = overwhelming. 12 systems gated behind 30 hours = content-starved early. Most healthy designs reveal 2–4 systems in first hour, rest over next 5–10 hours.

## The team-capacity test

Per system:
- **Engineering work?** (Rough order of magnitude — days, weeks, months)
- **Content volume to feel rich?** (Number of items / levels / variations)
- **Who maintains it after launch?** (Live-ops cadence, balance updates, bug fixes)

8 systems each needing months of engineering + ongoing maintenance = 50-person studio project. 3-person team with same design ships 2 of 8, broken.

## The rails-fit test

Per system, check against chosen payment rails (from [game-concept-creator](../../game-concept-creator/SKILL.md)):

- **F2P / IAP-heavy:** does system create *fair, optional* spending opportunity, or paywalls?
- **Premium:** does system require live-ops to feel complete? If yes, model is wrong, not system.
- **Web3 tokens:** does system create token sinks or only token sources? (Token-source-only systems collapse economy.)
- **Web3 NFTs:** does system require *rebalancing* characters/items? (NFT'd content hard to nerf.)
- **Subscription:** does system give subscribers *ongoing reasons* to stay subscribed?

Systems fighting rails are landmines for [game-monetization-strategist](../../game-monetization-strategist/SKILL.md) and `iap-manager` later. Surface conflict in design doc, don't bury it.

## The five-system limit (heuristic)

Most teams, most games: ship **3–5 major systems** in launch version. Add new systems in updates.

Design with 8+ major systems → two things likely true:
- Team ships a quarter of them well, rest poorly.
- Player never internalizes all of them.

Fix is *not* adding tutorial for extra systems. Fix: cut them or convert to *expansions / live-ops content* shipping after launch.

## What to do with a failing system

System fails checklist:

1. **Cut it.** Default. Most "interesting ideas" should die at design stage.
2. **Merge it.** Combine with related load-bearing system.
3. **Defer it.** Move to planned post-launch update.
4. **Rework it.** Only if system load-bearing and failure fixable.

"Keep it as is, we'll figure it out later" = path to feature soup. Don't take it.

## Output

After checklist, design doc's systems list should be:

- 3–5 systems all passing compounding test
- Each labeled with aesthetic and verb it serves
- Each with clear connection to at least 2 other systems
- Each with defensible team-capacity story

List still has 8 systems, can't cut → route back to `game-design-shaper` for scope clarification.

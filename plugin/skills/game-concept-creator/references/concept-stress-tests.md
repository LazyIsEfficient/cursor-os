# Concept stress tests

Run every one-pager through these tests before handing off to `game-systems-designer`. Each failed test goes in one-pager's `Risks` section — do not silently fix.

## 1. The elevator test

Stranger reads one-pager in 60 seconds, describes game back in their own words.

**Failure mode:** logline too abstract ("an experience about loss"), too generic ("an action game with progression"), or too dense (six concepts smuggled into one paragraph).

**Fix direction:** rewrite logline using `[Genre] where you [verb] to [goal] in [setting] with [twist]` template. Cut anything that doesn't survive.

## 2. The hook test

One-pager describes specific moment in first 30 seconds of play that makes player text a friend.

**Failure mode:** "the hook is gradually unlocking new mechanics" — not a hook, that's a curve. Hooks are *moments*, not *eventual properties*.

**Fix direction:** name the moment. *Vampire Survivors* hook = "the screen is suddenly full of enemies and you survive anyway." *Among Us* hook = "you watched the body get reported and you have no idea who did it." Can't name the moment → concept needs more shaping.

## 3. The comp-differentiation test

One-pager lists 2–3 comp titles and one specific thing this game does *differently*.

**Failure mode:** "It's like X but better." Better-but-same loses to X every time — X already shipped, polished, known.

**Fix direction:** name the wedge. Wedge can be mechanic ("but with deck-building"), setting ("but in feudal Japan"), audience ("but for cozy players"), session length ("but as a 5-minute commute game"), or constraint ("but on a single screen"). No wedge → concept is a clone.

## 4. The rails-fit test

Chosen payment rails do not fight concept. See `payment-rails-decision.md`.

**Failure modes:**
- F2P with no daily-engagement loop
- Premium with mandatory live ops
- Subscription on a finite experience
- Web3 with no liquidity story
- Cosmetic IAP in a single-player game
- IAP-heavy in a culturally premium category (e.g. story-driven indie)

**Fix direction:** change rails, change concept, or surface conflict in `Risks` and let team decide.

## 5. The scope-realism test

Scope estimate matches concept's content needs.

**Failure modes:**
- "Two-person team, six months" attached to open-world RPG
- "Solo developer" attached to 32-player PvP shooter
- "Four-week prototype" attached to 100-character roster
- "Live game" with no plan for ongoing content cadence

**Fix direction:** cut scope (smaller world, fewer characters, fewer modes) or raise team/timeline. Neither possible → surface in `Risks`.

## 6. The risk inventory

One-pager lists **top 3 risks**, ranked.

Risk types:
- **Mechanical risk** — "the core loop might not be fun" (almost always true for novel ideas; prototype exists to disprove it)
- **Market risk** — "this audience may not exist at this price point"
- **Platform risk** — "App Store / Google Play / Steam may reject this category" (loot boxes, crypto, gambling-adjacent)
- **Technical risk** — "this needs custom netcode / server cost / engine work we don't have"
- **Regulatory risk** — "loot box rules / crypto rules / age rating in target markets"
- **Team risk** — "we don't have the discipline / craft / experience for this genre"
- **Content risk** — "content-hungry genre, we can't produce content fast enough"
- **Monetization risk** — "economy could be broken by whales, bots, or RMT"

Concept with no risks listed = not thought through. Concept with all-mechanical risks = commercial side under-considered. Push for breadth.

## 7. The "what would kill it" test

One sentence: what specific event (signal, KPI, market change, platform action) would convince team to **stop development** of this concept?

**Failure mode:** team has no kill criterion — usually means no success criterion either.

**Fix direction:** force team to write kill criterion. Without it, concept defended past point of evidence.

## What "passing" looks like

- All seven tests have explicit answer or are flagged as risk.
- One-pager useful to designer who never spoke to user.
- Skeptical reader identifies upside and downside in under two minutes.

Passes all tests → hand off to `game-systems-designer`. Fails elevator or hook test → do not hand off — concept not ready.

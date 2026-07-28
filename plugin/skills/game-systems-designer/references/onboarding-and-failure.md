# Onboarding and failure

Two most undervalued areas in systems design. Onboarding is what most players see before they bounce. Failure is what every player feels every session for entire game life. Both are *systems*, not afterthoughts.

## Onboarding is the first hour

"Tutorial" is tiny fraction of onboarding. Onboarding = entire first hour — first time player meets every verb, every system, every loop, forms opinion on coming back tomorrow.

Per verb in design:
- **When** is it introduced?
- **In what context** (under threat? safely? as reward?)
- **How is mastery shown** (animation, feedback, player's own success)
- **How long** does player practice it before next verb arrives?

Verbs introduced in wrong order, too close together, without practice space → player overwhelmed, quits.

## The first 60 seconds

Single most important window. In 60 seconds, player should have:

- **Touched the controls.** No menus, no story. Player presses something, world responds.
- **Seen the fantasy.** Glimpse of what game *is*, in motion, not described.
- **Hit a moment of agency.** Choice that mattered, however small.

First 60 seconds = logo + cutscene + main menu + difficulty select + character creator → game spent first 60 seconds *not playing*.

## The first 10 minutes

By 10-minute mark:
- **Core loop has run** at least 3–5 times.
- **Dominant aesthetic felt** at least once (sensation, fantasy, challenge — whatever design promises).
- **One verb being practiced.** Not all verbs introduced — one verb practiced.
- **Meta-progression hint shown** (something unlocks, accumulates, something player can imagine continuing).

Games failing 10-minute test usually spent too long *teaching*, not enough *playing*.

## The first hour

By 1-hour mark:

- **All major verbs introduced** at least once each, in *separate contexts*.
- **At least one meta loop fired** (run ended, day passed, level cleared, season-progress visible).
- **Player has failed and recovered.** Failure design (below) lands here.
- **Player made a *meaningful* choice** in meta loop (which path, which build, which faction).
- **Player can describe fantasy in own words.** Test: ask playtester at 1-hour mark "what's this game about?" and listen.

## Tutorial styles

Pick one style, commit:

- **Discovered tutorial** — player figures it out from environmental cues, level design, systems themselves. High craft to make legible. Best for Discovery aesthetic.
- **Guided tutorial** — UI prompts, "press X to Y" hints, contextual tooltips. Cheap, common, often badly done. Best for complex systems, tight teaching budgets.
- **Hidden tutorial** — early levels *are* tutorial; player doesn't know they're taught. Best craft, requires excellent level design. Examples: *Half-Life 2*, *Portal*.
- **Contextual tutorial** — tutorials trigger when player about to *need* information, not before. Best for sprawling systems (RPGs, sims) where front-loading overwhelms.

Mixing styles feels inconsistent. Pick one for game spine; second sparingly for specific systems.

## Failure design

Failure is system, not event. Players experience it every session for game life. Bad failure design produces game feeling *unfair*, *punishing*, *cheap* — even when underlying balance fine.

Four pillars of fair failure:

1. **Attribution** — player can identify *what they did wrong*. Failures with no attribution feel arbitrary.
2. **Recoverability** — player can reverse failure (undo, retry, second chance) or take *something* from it (resources, knowledge, progression).
3. **Pacing of failure** — failure at rate player can absorb. Three rapid failures in a row breaks confidence; one failure per 30 minutes feels like system isn't trying.
4. **Aesthetic of failure** — losing should *feel like promised aesthetic*. Roguelike death = *Discovery* (you learned something) + *Challenge* (you'll do better). Cozy farming sim failure = *Submission* (relax, try tomorrow).

## Failure types and when to use them

- **Soft fail** — player loses progress in current attempt, keeps meta-progression. Roguelike standard. Best for Challenge aesthetic.
- **Hard fail** — player loses meta-progression. Permadeath, ironman. Best when *risk of permanent loss* is dominant aesthetic.
- **Setback** — player loses time, not progress. Common in MMOs, story-driven games. Lowest cost; lowest emotional weight.
- **Cosmetic fail** — player "loses" but world / character carries loss as flavor. Best for Narrative aesthetic.
- **Multi-attempt fail** — N tries before any meta-progression lost. Common in F2P (energy / lives systems). Care: can feel like paywall, not failure design.

## Failure friction (the rage-quit budget)

Each failure spends player emotional budget. Minimize friction:

- **Fast restart.** Failure → "trying again" in seconds, not a load screen.
- **Visible delta.** Show what changed between attempts (better gear, more knowledge, new option).
- **Optional context.** Short replay, "what hit you" callout, stat summary — opt-in, never forced.
- **No menu detour.** Failure → restart = one or two button presses, not screen navigation.

## Onboarding-failure interaction

The two interact in first hour:

- **Players should fail in first hour.** Game letting you win first hour teaches it's easy; later difficulty spike feels unfair.
- **First failure should land in context demonstrating fair failure.** First death feeling arbitrary → player forms opinion about *whole game's failure design* in that moment.
- **First recovery should be visible, rewarding.** Player learns "failure means I try again with X more / better Y."

## Output for the design doc

In §10 of design doc:
- **First 60 seconds** — what player does, sees, feels
- **First 10 minutes** — verbs introduced, in what order
- **First hour** — systems unlocked, mastery shown
- **Tutorial style** chosen

In §11:
- **How player fails** in core loop
- **Why failure feels fair** (attribution chain)
- **What they keep** after failure
- **Death / loss rate target** (design intent — actual numbers from `game-balancer`)

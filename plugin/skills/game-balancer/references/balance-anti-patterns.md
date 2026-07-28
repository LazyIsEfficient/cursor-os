# Balance anti-patterns

Common balance-work failures. Most surface months after launch, when retention decays and model no longer useful map.

## 1. Vibes balance

Numbers picked because they "feel right" — no spreadsheet, no comp benchmarks, no sensitivity analysis. Works until first content drop changes inputs and whole economy drifts off (nonexistent) model.

**Fix:** model first. Model can be rough; must exist.

## 2. Spreadsheet trance

Beautiful spreadsheet, plays terribly. Model proves design balanced; player feels nothing. Happens when balancer optimizes single metric (ARPDAU, time-to-content) without playtest.

**Fix:** every spreadsheet revision followed by engine playtest. Two different sources of truth.

## 3. Tuning to the median

Model targets median player; whales bored, minnows quit, free players never reach payoff. Median-only tuning = *measured* metrics look fine, population still bleeds.

**Fix:** every model has multiple profile rows. Every balance change checked against all profiles.

## 4. Power creep

Each new content drop at least as strong as last. Old content devalues; returning players fall behind; skill ceiling becomes power-floor.

**Fix:** sideways content (new options, not raw power), rotating buffs/nerfs, intentional resets, gating new content behind older content.

## 5. Dominant-strategy collapse

One option (build, character, deck) dominates meta. Everyone plays it. Pick rate concentration → 60–80%. Skill expression collapses; game reduces to "execute dominant strategy correctly."

**Fix:** nerf dominant option *or* (often better) buff alternatives. Re-tune patch cadence faster than meta calcifies.

## 6. Treadmill economy

Players grind for upgrades that only let them grind faster for next upgrade. Loop has no terminus, no novelty. Submission aesthetic dressed as Challenge.

**Fix:** upgrades change *kind* of play, not just *speed*. Add lateral options. Add capstone goals.

## 7. Whale-gated economy

Whale-tier content locked behind hard paywalls, no aspirational free path. Free players quit (no future); whales cap (no goal beyond paying). Population collapses.

**Fix:** every paid achievement has free analog (slower, less convenient, reachable). Free path keeps population alive for whales to *play with*.

## 8. Drop-rate dishonesty

Advertised drop rates differ from actual table. Or advertised rates technically correct but *pity* and *PRD* algorithms hidden. Players reverse-engineer in days. Trust takes months to recover.

**Fix:** disclose. Many jurisdictions require it. Even where not required, disclosure is good practice, better long-term outcomes than concealment.

## 9. Silent nerf

Monetized item nerfed without comms. Paying players find out via gameplay. Refund storm; community trust drop; sometimes regulator attention.

**Fix:** announce in advance. Compensate. Grandfather where possible. Don't be studio that nerfed the thing players paid for.

## 10. Single-currency overload

One currency does everything: power, cosmetics, repairs, time-skips. Players can't *choose* what to spend on; spending feels mandatory; sinks compete with each other.

**Fix:** split into 1–3 currencies with clearly different roles (soft / hard / time-gated). Each currency's sinks coherent.

## 11. Multi-currency proliferation

Opposite: 5+ currencies, one per content stream. Cognitive load explodes. Players don't know what to spend where. Designers can't reason about economy.

**Fix:** consolidate. 1–3 currencies, period. New content streams use existing currencies.

## 12. Exit-ramp denial

Session has no good place to stop. Players wanting to log off feel they're "wasting" session. Eventually log off mid-session, feeling bad. Return rate drops.

**Fix:** design exit ramps. End-of-day pauses, end-of-run summaries, save-and-quit prompts. Let players quit feeling good.

## 13. Boss difficulty without learning

Hard boss fight providing no information on *how* to win. Players retry, no improvement; rage quits.

**Fix:** every failure teaches something. Tells, patterns, recoverable mistakes. Challenge is *learning the boss*, not *surviving randomly*.

## 14. Token-source dominance (web3)

"Play to earn" game: strong token sources, weak sinks. Token price collapses; new players' earnings worthless; player base evaporates.

**Fix:** sinks before sources. Design *attractive* token sinks (cosmetics, status, premium content) so economy isn't extraction loop. Failing that, model token velocity in spreadsheet *seriously*, budget for re-tunes on drift.

## 15. NFT'd content nerfs

Critical balance change required, affected item is NFT. Owners revolt; nerf reversed; meta stays broken; population leaves.

**Fix:** *don't NFT content needing balance.* NFTs for cosmetic / identity / collection items, not combat-effective items. Must touch NFT'd item? Prefer *additions* (adding alternatives) over *subtractions* (nerfing the NFT).

## 16. Re-tune storms

Frequent small re-tunes back-to-back. Players never feel a change before next one. Trust erodes; players assume team panicked.

**Fix:** patch cadence discipline. 4–8 weeks between major balance changes. Hotfixes only for emergencies. Communicate cadence.

## 17. Patch notes as data dumps

Patch notes listing 50 numerical changes, no context. Players can't tell what matters. Discord guesses; misinformation spreads.

**Fix:** lead with why. Group changes by intent ("we're moving the meta away from X because..."). Highlight 3–5 most-impactful changes. Rest at bottom.

## 18. The unmeasured KPI

Balance shipped without validation telemetry. Six months later, nobody knows whether change worked.

**Fix:** every balance change ships with measurement plan. Hand to [site-reliability-engineering](../../site-reliability-engineering/SKILL.md) (alerts) and `growth-engine` (experiments).

## 19. Symmetric "balance" by removal

To "balance" PvP, team removes everything making characters distinct. Result: every character identical. Win rates equalize; engagement collapses; game has no identity.

**Fix:** asymmetric balance is goal. Distinct identities with distinct match-up profiles, not interchangeable characters.

## 20. The forever beta

Team avoids declaring balance "shipped" — wants flexibility. Players never feel game *done*; meta-game stress constant.

**Fix:** declare balance shipped on a date. Commit to patch cadence after. Players relax; team gets focus; next balance pass has weight.

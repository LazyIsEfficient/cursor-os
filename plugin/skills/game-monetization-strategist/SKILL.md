---
name: game-monetization-strategist
description: "Use when picking and shaping the monetization model of a game — premium / F2P / subscription / ad-supported / hybrid / web3 — including LTV / ARPDAU / ROAS targets, retention-to-monetization mapping, soft-launch KPI floors, and the macro economy. Triggers on \"monetization model\", \"monetization strategy\", \"F2P vs premium\", \"LTV\", \"ARPDAU\", \"ROAS\", \"soft launch KPIs\", \"battle pass\", \"subscription model\", \"web3 token economy\", or a design doc with the model still open. Produces a monetization strategy doc, KPI floors, and macro economy spec. Stops at strategy — does not set per-SKU prices (iap-manager) or tune economy numbers (game-balancer). For per-SKU catalog see iap-manager; for economy curves see game-balancer; for CPI see game-marketer."
---

# Game Monetization Strategist

Pick **monetization model** for a game; define **macro commercial frame**: LTV target, ARPDAU floor, ROAS payback window, retention-to-monetization mapping, segment economics, soft launch KPI floors. Do not set per-SKU prices (`iap-manager`), tune in-game economy curves (`game-balancer`), or design systems (`game-systems-designer`).

Game needs *per-SKU pricing* → route to `iap-manager`. Economy needs tuning → route to `game-balancer`. Question is "should we make this game" → route to `game-design-shaper`.

## Procedure

1. **Read design doc and payment-rails decision.** Rails + player verbs / aesthetics constrain shippable models.
2. **Pick the model** — [references/monetization-models.md](references/monetization-models.md): premium, F2P, subscription, ad-supported, battle pass, hybrid, web3-native.
3. **Map retention to monetization** — [references/retention-to-monetization.md](references/retention-to-monetization.md). ARPDAU = ARPU × (1 − churn). LTV = integrated ARPDAU over payback horizon.
4. **Set segment economics** — [references/segment-economics.md](references/segment-economics.md). Whale / dolphin / minnow / non-spender splits; expected ARPU per segment.
5. **Set KPI floors** — [references/kpis-and-floors.md](references/kpis-and-floors.md). D1/D7/D30 retention; ARPDAU floor; conversion to first IAP; ROAS payback window.
6. **Define macro economy** — frame only: how many currencies, role of each, catalog *shape*. No curves (that's `game-balancer`).
7. **Stress-test the model** — [references/model-stress-tests.md](references/model-stress-tests.md). 30% retention shortfall? 50% IAP conversion shortfall? Platform fee change?
8. **Fill `assets/monetization-strategy-template.md`** — canonical output.
9. **Hand off** — KPI floors to `game-balancer`; catalog shape to `iap-manager`; soft launch CPI floor to `game-marketer`; surface system changes to `game-systems-designer`.

## Universal Rules

- Pick *one* dominant model — hybrids valid but must be designed
- Model must fit design and rails
- Retention is upstream — broken retention can't be fixed by monetization tactics
- No per-SKU prices — strategy sets price-tier ladder shape; `iap-manager` places SKUs
- No in-game economy numbers — strategy targets (ARPDAU ~$0.30) not balance (1 gem = 5 min skip)
- Always model multiple segments — median-only model produces no whales
- Always plan for soft launch — define "what we'd watch" even if skipping formal soft launch
- Stop at strategy — hand catalog work to `iap-manager`, balance to `game-balancer`, growth to `game-marketer`

## Related Skills

- [game-concept-creator](../game-concept-creator/SKILL.md) — produces payment-rails decision
- [game-systems-designer](../game-systems-designer/SKILL.md) — produces design model assumes
- [game-balancer](../game-balancer/SKILL.md) — receives KPI floors; tunes in-game economy
- [iap-manager](../iap-manager/SKILL.md) — receives catalog shape and price-tier ladder
- [game-marketer](../game-marketer/SKILL.md) — receives ROAS targets, CPI floors, soft-launch plan
- `finance-ops` — studio-level revenue forecasting, runway impact, P&L
- [content-ops](../content-ops/SKILL.md) — expert-panel scoring of strategy doc before it locks

# Payment-rails decision

Rails decision constrains what concepts can ship, what KPIs realistic. Surface **before** expanding any concept.

Concept-time filter, not deep monetization design — that lives in [`game-monetization-strategist`](../../game-monetization-strategist/SKILL.md). Here: check concept and rails not in obvious conflict.

## The rails

| Rail | What it is | Concepts it fits | Concepts it fights |
|---|---|---|---|
| **None (premium one-time)** | Buy once, play forever | Story-driven, finite, replayable indie; high-craft single-player | Live ops; long-tail revenue games; F2P-attention-budget concepts |
| **Web2 IAP (App Store / Google Play / Steam DLC)** | Players buy items, currency, content inside game | F2P with grind/skip loops; cosmetic-rich games; expandable content; gacha | Strict pay-to-win sensitivity (e.g. competitive PvP without skill differentiation); single-session jam games |
| **Web2 ads (rewarded / interstitial / banner)** | Ad networks pay for impressions / completions | Casual mobile, hyper-casual, idle, puzzle, lifestyle | Premium-feel games; concepts where flow-state is value prop; web/PC/console |
| **Web2 subscription** | Recurring fee for access or perks | Service-shaped games (MMO, GaaS); ad-free tier on top of F2P; battle-pass-like content drips | Concepts without continuous content cadence; concepts where one-time mastery is the appeal |
| **Web3 tokens** | In-game currency on-chain, often with secondary market | Trading / market verbs; player-driven economies; speculation as gameplay; loops where value transfer between players is the fantasy | Concepts where fantasy *not* commercial; players uncomfortable with money-shaped UX; jurisdictions hostile to crypto; players without wallets |
| **Web3 NFTs** | Items / characters / land as transferable tokens | Collector-as-fantasy; identity-through-items; persistent-world stakes; community-curated content | Concepts where item iteration / nerfs / rebalances gameplay-critical; concepts with frequent character resets |
| **Hybrid** | Mix of above (e.g. premium + cosmetic IAP, or web3 + traditional IAP) | Mature studios with capacity to manage two storefronts; bridging web2 audiences into web3 | Solo / small teams; concepts where simplicity of "buy and play" is part of appeal |

## Decision questions

Rails decision unclear? Work user through these:

1. **Player's relationship with money in the fantasy?** Money/trade *part of fantasy* → web3 tokens or IAP economy natural. Money *invisible to fantasy* → premium or non-intrusive ads natural.
2. **Session length and cadence?** 3-min sessions × 4× day → ad-friendly. 30-min sessions × 3× week → IAP / sub. One-and-done 20-hour story → premium.
3. **Where does player live?** Mobile-only audience → IAP/ads dominant. PC/Steam → premium dominant. Web → ads or premium-via-Stripe. Console → premium + DLC.
4. **Platform policy?** App Store and Google Play restrict crypto IAP heavily. Steam restricts NFT/crypto. Web freer but loses storefront discovery.
5. **Team capacity for live ops?** Live ops is *team commitment*, not feature. F2P, subscription, web3-with-secondary-market all imply ongoing operation. Premium does not.
6. **Regulatory floor in target jurisdictions?** Loot boxes restricted/banned in some markets. Crypto IAP restricted in others. Subscription auto-renew rules vary.
7. **Web2 fallback?** Answer "web3" → how does game work for player without wallet? Answer "they can't play" → reachable market shrinks dramatically.

## Concept-vs-rails red flags

Surface in one-pager's `Risks` section if applicable.

- **"Cosmetic-only IAP" with single-player game**: cosmetics monetize because *other players see them*. Single-player cosmetic IAP rarely works.
- **"Free-to-play" with no daily-engagement loop**: F2P depends on retention compounding ARPDAU. Concepts without daily reason to return cap out fast.
- **"Web3" with no buyer for player assets**: secondary markets require liquidity. Concept where 99% of players net buyers, 1% sell, collapses.
- **"Premium" with planned live ops**: premium games can do DLC and seasons, but design *requiring* ongoing content to retain is service-shaped — pricing fights it.
- **"Subscription" with no recurring value**: subscriptions need ongoing reasons to stay. Subscription on finite, completable experience churns fast.

## Output

Capture answer in one-pager:
- Chosen rails (one or hybrid)
- One sentence on **why these rails fit this concept**
- One sentence on **where these rails fight this concept** — honesty, not pessimism

Hand deeper trade-offs (LTV target, KPI floors, soft launch plan) to `game-monetization-strategist`.

# Web2 vs Web3 monetization models

Monetization math identical; constants and constraints differ. Treat web3 as *rails decision* (per `game-concept-creator`) and *model dimension*, not free pass.

## When web3 makes monetization sense

Web3 monetization fits when one or more true:

- **Trading is the verb.** Core enjoyment = buying / selling / market-making. Web3 secondary markets serve this.
- **Identity through items is the fantasy.** Owned, transferable assets carry social status. NFTs serve this.
- **Persistent consequence is the design.** Player choices propagate and persist. On-chain provenance serves this.
- **Cross-game / cross-app value matters.** Same asset travels between products. NFTs serve this (with platform politics).

Web3 monetization fights design when:

- Fantasy *not* commercial. Money-shaped UX disrupts immersion.
- Items need frequent rebalance. NFTs hard to nerf without revolt.
- Audience lacks wallets. Conversion friction kills funnel.
- Platform hostile. App Store and Google Play restrict crypto IAP heavily; Steam restricts NFT/crypto.

## Web3 model variants

### Token-only

Players earn / hold / trade in-game token. Token has real-money value via DEXes / CEXes.

**Revenue:**
- Token sale (primary issuance — often pre-launch presale)
- Marketplace transaction fees (on player trades)
- Tokens held by treasury / team
- IAP for token packs (where platform allows)

**Risks:**
- Token velocity collapse when sources outpace sinks (most common failure)
- Speculative crash decoupled from gameplay
- Regulatory reclassification (security token)
- Players treat earnings as wages, not gameplay → quit when ROI drops

### NFT-only

Items / characters / land are NFTs. Players own and trade.

**Revenue:**
- Primary mint
- Secondary market royalties (1–10% per trade, where chain enforces)
- Premium content packs

**Risks:**
- Floor-price collapse when minting outpaces demand
- NFT'd items can't be balanced (owners revolt at nerfs)
- Secondary market dries up; assets feel worthless
- Royalty enforcement weakening (recent EVM marketplace shifts)

### Hybrid web3 (token + NFT)

Both. Players have currencies (token) and items (NFTs). Common in "AAA web3" attempts.

**Revenue:**
- Both above
- Plus: cross-asset interaction fees (use token to upgrade NFT, etc.)

**Risks:**
- Both above, compounded
- Operational complexity (two on-chain systems to monitor)

### Hybrid web2 + web3

Web2 storefront (App Store / Google Play / Steam) for mass market + optional web3 layer for crypto-native players.

**Revenue:**
- Web2 IAP (majority for most launches)
- Web3 token / NFT sales (minority, crypto-curious segment)

**Risks:**
- Platform hostility (App Store / Google Play restrict crypto coexistence)
- Segment cannibalization
- Messaging confusion ("is this a crypto game or not?")

## Token economy fundamentals

Three rules for any token economy:

1. **Sinks before sources.** Plan how token *leaves* player possession before planning how it enters. Sources without sinks = inflation = collapse.
2. **Velocity discipline.** Token velocity (cycling speed) determines price stability. Low velocity (holders) → price holds. High velocity (immediate sellers) → price falls.
3. **Demand drivers.** Tokens need *reasons to want them* — usually: content access, status, governance, staking rewards. "Speculation" alone = fragile demand driver.

## NFT design fundamentals

Three rules for NFT-as-content:

1. **Don't NFT what needs balancing.** Combat-effective items, PvP characters, anything with a "meta" → keep web2. NFT cosmetics, identity items, collection items, narrative artifacts.
2. **Plan additions, not subtractions.** New content rebalances meta naturally; nerfing existing NFTs → owner revolt.
3. **Royalty fragility.** Recent EVM marketplaces weakened royalty enforcement. Don't bet model on secondary royalties; treat as bonus.

## Web2 fallback

Rails include web3 → game *must* answer: "How does game work for player who can't or won't connect wallet?"

Options:
- **Custodial wallet on signup** — game creates wallet; player claims later. Friction-low; trust-low (custody question).
- **Optional wallet** — fully playable without; on-chain features optional. Friction-low; ROI-on-web3 also low.
- **Required wallet** — won't run without one. Friction-high; reachable market shrinks dramatically.

Choice constrains acquisition cost and reachable market. Capture in strategy.

## Platform constraints (web2 vs web3)

| Platform | Web2 IAP | Web3 token IAP | Web3 NFT mint | Notes |
|---|---|---|---|---|
| App Store | Allowed | Restricted (esp. crypto rails) | Restricted (no in-app NFT mint allowed in many cases) | Apple takes 30%; web3 features must comply |
| Google Play | Allowed | Restricted | Restricted (similar) | Google takes 15–30%; web3 IAP-adjacent flagged |
| Steam | Allowed | Banned | Banned | Steam disallows crypto in published games |
| Epic | Allowed | Allowed (case-by-case) | Allowed (case-by-case) | More open than Steam |
| Web (desktop) | Allowed | Allowed | Allowed | No platform tax; weaker discovery |
| Console (PS / Xbox / Switch) | Allowed (per platform) | Effectively banned | Effectively banned | Console policies block web3 currently |

Rails include web3 → document platform exclusions in strategy. They constrain reachable market significantly.

## Jurisdictional constraints

Crypto regulation varies by region:

- **US** — securities scrutiny on tokens; state-level restrictions (e.g. NY)
- **EU** — MiCA framework; KYC requirements; NFT classification varies
- **UK** — FCA registration requirements
- **China / Korea / Japan** — restrictive on crypto IAP
- **Tier-3 markets** — often web3-friendly but lower paying capacity

Check before model lock. Excluded geos shrink reachable market, change LTV math.

## Output for the strategy

Rails include web3:
- **Token role:** currency / governance / reward / speculation
- **NFT role:** cosmetic / collection / identity / gameplay (last with nerf-risk note)
- **Sinks plan:** what absorbs token supply
- **Secondary market policy:** royalty rate, allowlist
- **Web2 fallback:** what non-wallet players can do
- **Platform / jurisdictional exclusions:** documented
- **Risk register:** token velocity, NFT illiquidity, regulatory action — with mitigations

# Web3 IAP notes

Rails include web3 → catalog has additional complexity. *Operational* layer on top of strategy decisions by [game-monetization-strategist](../../game-monetization-strategist/SKILL.md).

## Token IAP

Players buy tokens with fiat (typically via on-ramps).

**Catalog patterns:**
- **Token packs** — fixed-amount fiat → token bundles ($4.99 → 500 GAME tokens)
- **Token + bonus** — promotional packs ($9.99 → 1,200 GAME + 100 bonus)
- **Subscription with token grant** — sub tier granting daily tokens

**Operational concerns:**
- **Volatility** — token USD value floats; peg to USD → on-chain amount varies; peg to token → USD amount varies
- **On-ramp fees** — fiat → token typically costs 2–5%; absorb (margin compression) or pass through (player friction)
- **KYC** — required by jurisdiction and on-ramp; flag in jurisdiction matrix
- **Custodial vs non-custodial** — affects flow (custodial = sign-up creates wallet for player; non-custodial = player connects own)

**Platform restrictions:**
- App Store: strongly restricted; explicit crypto IAP usually not allowed
- Google Play: similar restrictions
- Steam: banned
- Web: typically permitted (route web3 monetization through web)

## NFT mints

Players mint NFT items at primary issuance.

**Catalog patterns:**
- **Single mint** — one item per mint transaction; clear price + chain gas
- **Pack mint** — multiple items per mint (gacha-pack-like)
- **Tiered allowlist** — earlier tiers (with discount) for early supporters
- **Public mint** — open to all after allowlist

**Operational concerns:**
- **Total supply** — declared upfront; do not change after launch (massive trust break)
- **Reveal timing** — reveal at mint vs reveal later (reveal-later common; reveal mechanism must be unmanipulable)
- **Royalty enforcement** — declining on EVM marketplaces; don't rely on royalty as load-bearing revenue
- **Gas spikes** — mint events congest networks; schedule off-peak or use L2

**Coordinate with:**
- `web3-smart-contract-engineering` — contract design and deployment
- `security-engineering` — contract audit
- [game-marketer](../../game-marketer/SKILL.md) — mint event marketing, allowlist comms

## Token-required content

Content gated behind token holdings (staking, holding-required, "must own X tokens").

**Catalog patterns:**
- **Staking unlock** — stake N tokens to access feature; tokens returnable after unstake period
- **Hold-required** — must hold N tokens at snapshot time
- **Spend-to-access** — burn tokens for permanent access

**Operational concerns:**
- **Snapshot mechanics** — when holding measured; how verified
- **Sybil resistance** — preventing one whale from creating many wallets to qualify
- **Web2 fallback** — what non-wallet players can access

## Secondary market integration

Players trade NFTs / tokens between each other on external marketplaces.

**Catalog patterns:**
- **Display floor price** — show current floor price for NFT type in-game
- **Marketplace deep-link** — "Buy on OpenSea / Magic Eden / Blur"
- **In-game peer-to-peer market** — own marketplace (high operational complexity)

**Operational concerns:**
- **Royalty rate** — declared up-front; respected by some marketplaces, ignored by others
- **Liquidity monitoring** — floor price collapse → trust collapse
- **Anti-fraud** — wash trading, sybil bidding, scam listings (with `security-engineering`)

## Custodial wallet for IAP

Common mass-market web3 pattern: game creates wallet per player at sign-up; players spend without learning crypto.

**Catalog implications:**
- IAP with fiat (Apple / Google / Stripe) → tokens land in custodial wallet
- Player can claim to non-custodial wallet later (claim flow has own UX)
- Custody = studio responsibility — security and regulatory burden

**Operational concerns:**
- **Compliance** — custody may classify as money transmission in some jurisdictions
- **Insurance** — custodial assets may need insurance
- **Recovery** — player recovery flow on forgotten password / lost access

Coordinate heavily with `security-engineering` and legal.

## Cross-chain considerations

Game spans multiple chains:

- **Wrapped tokens** — token on chain A bridged to chain B; bridge has security implications
- **Per-chain catalog** — different SKUs per chain
- **Bridge fees** — pass through to player or absorb

Most games stick to single chain, avoiding complexity. Multi-chain is for scale.

## Reporting

Web3 IAP needs different reporting than web2:

- **On-chain volume** — primary mints, secondary market activity
- **Token velocity** — circulation rate, sink saturation
- **Wallet metrics** — connected wallets, active wallets, wallet age distribution
- **Per-region wallet penetration** — which markets connect wallets vs use web2 fallback

Hand to `revenue-intelligence` for cohort revenue analysis combining web2 + web3 data.

## Anti-patterns

- **Web3-as-decoration** — NFTs / tokens added because "everyone is doing it", no design reason. Alienates both web3 and web2 audiences.
- **Hidden custody** — players don't realize studio holds wallet; studio fails → players lose assets
- **Manipulated rarity** — claiming "1 of 100", minting more later
- **Royalty evasion** — selling NFTs in ways bypassing on-chain royalties
- **Mint-and-abandon** — primary mint sells out; team disappears; secondary collapses
- **Pump-and-dump** — token launched with team allocation; team sells; token collapses; players holding bag

Existential trust breaks for web3 games. Avoid them; even the *appearance* damages studio long-term.

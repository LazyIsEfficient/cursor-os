# Store-side UX

Store is a UI surface, not just SKU list. Same catalog with bad UX converts dramatically worse. Coordinate with `ux-design` for screen-level work; this reference covers IAP-specific patterns.

## Paywall placement

Where player encounters store determines conversion:

- **Always-on store tab** — players who *want* to spend can. Lowest pressure; lowest conversion per view.
- **Currency-low pop-up** — surfaces when player runs out of soft currency. Mid pressure; mid conversion. Don't make this only path (feels punitive).
- **Energy-empty pop-up** — surfaces when player runs out of plays. Conversion-friendly but "pay to continue" pattern; tune carefully.
- **Defeat / failure pop-up** — surfaces after player loses. Converts well in some categories (puzzle, casual); exploitative-feeling in others (challenge, narrative). Use carefully.
- **Achievement / wow pop-up** — surfaces after player succeeds. Less common; converts well for cosmetic SKUs ("celebrate your win with this!").
- **Time-limited offer** — surfaces with clear end time. Strong conversion when real; trust-destroying when fake.

## Offer flow shape

Standard flow:

1. **Trigger** — what surfaces offer (in-game event, time, button click)
2. **Pre-paywall** — short context ("Need more gems?" or "New bundle available!")
3. **Offer detail** — composition + price + countdown if applicable + CTA
4. **Confirm purchase** — platform IAP UI takes over (sandbox first; live billing second)
5. **Receipt → entitlement** — server validates; client receives confirmation
6. **Reward animation** — feedback giving purchase emotional weight (delivery beat)
7. **Post-purchase** — return to gameplay or surface related offer (carefully)

Each step = drop-off candidate. Instrument all.

## Dismissibility

Every paywall **dismissible** with clear "no thanks" or "X" button. Forced paywalls (no exit) = App Store / Google Play policy violations, trust-destroying.

Dismiss button **easy to find** (corner X fine; hidden behind menu hostile).

## Soft pop-ups

*Soft* pop-up offers without blocking play. Examples:
- New bundle banner on home screen
- "Buy gems" button in HUD
- Small "limited offer" indicator on store tab

Soft pop-ups: lower conversion per view, vastly higher view counts, no retention damage. Lean on these.

## Hard pop-ups

*Hard* pop-up interrupts play. Examples:
- "Currency low" modal
- "Limited-time offer!" interstitial
- Energy-out paywall

Hard pop-ups convert better per view, cost retention. Tune *frequency*:
- During onboarding: *never* (drives bounce)
- Early game: *rarely* (max 1 per session)
- Mid-late game: *moderate* (1–2 per session)
- For whales: *minimal* (whales know where store is; don't punish them)

## Display copy

Offer text matters. Rules:

- **Lead with player benefit** — "Save 50% on the Halloween Bundle!" not "Halloween Bundle: $9.99"
- **Honest discount** — "30% off" only if truly 30% off (comp must be real)
- **Plain language** — "500 gems + Halloween skin + 5,000 gold" not "premium currency package mk-II"
- **Avoid pressure tactics** — "Last chance!" only if genuine last chance; "Limited stock!" only if actual stock
- **Localize** — translated text per region

Coordinate with [game-marketer](../../game-marketer/SKILL.md) for copy, `ux-design` for typography / hierarchy.

## Comparison and decoy display

Multiple SKUs side-by-side:

- **Highlight a "best value" SKU** — usually mid-tier, not cheapest, not most expensive
- **Place decoy SKUs adjacent** — small pack near bundle makes bundle look better
- **Show "save X%" delta** vs equivalent singles for bundles
- **Color and badge** highlighted SKU consistently across store

Decoy effects work; deceptive comparisons don't. Players notice fake comps.

## Subscription UX

Subscriptions need extra care:

- **Pre-checkout disclosure** — clearly state recurring billing, billing date, cancellation method
- **Free trial communication** — when trial ends, when billing starts, how to cancel
- **Cancellation flow** — accessible inside app, not buried, no friction
- **Sub status display** — players see they're subbed, renewal date, how to manage

App Store / Google Play policies require some of this; do *more* than minimum. Players reward respectful subs.

## Restore purchases

Critical for long-term trust:

- **Always-available restore button** in store
- **Cross-device restore** if platform supports
- **Receipt re-validation** server-side; entitlements re-granted
- **Test flow** for every SKU type (consumable, non-consumable, sub)
- **Don't gate restore behind sign-in** if platform identifier suffices

## Web3 store UX

Rails include web3:

- **Wallet connect prompt** — clear, branded, handles connection failures
- **Gas / fee disclosure** — player sees total cost before signing
- **Transaction confirmation** — feedback during pending state (typically seconds; sometimes longer)
- **Failed transaction recovery** — clear error messaging; retryable
- **Web2 fallback** — non-wallet players have clear path

## Anti-patterns

- **Forced paywall** — no dismiss; policy violation
- **Fake countdown** — "23:59:58" timer resetting every load
- **Hidden subscription cost** — sub price in tiny text or after click-through
- **Dark-pattern cancellation** — multiple confirms, "are you sure" loops, surprise re-bills
- **Buried restore-purchases** — under settings, under help, three taps deep
- **Confused currencies** — multiple similar-looking soft currencies; players can't tell what costs what
- **Predatory targeting** — segment-specific offers targeting whales with high-pressure copy

## Output

Coordinate with `ux-design` to specify:
- Paywall screens (always-on, low-currency, low-energy, defeat, victory, time-limited)
- Offer detail screens
- Confirm + receipt screens
- Restore-purchases flow
- Subscription management flow
- Web3 wallet connection flow (if applicable)

# Re-engagement

Re-engaging lapsed players = highest-ROI marketing in live game lifecycle. Lapsed players know the game; cost is reactivation, not acquisition.

## Defining lapsed

Per-game, typical thresholds:

- **D14 lapsed** — no play in 14 days. First re-engagement trigger.
- **D30 lapsed** — no play in 30 days. Second trigger; harder to bring back.
- **D90+ lapsed** — long-tail; bring back via content events, not generic "we miss you" comms.

Segments lapse for different reasons:
- **Whales** — content drought, status loss, paid item nerf, competitor migration
- **Dolphins** — content cadence slowdown, pass burnout
- **Minnows** — natural single-purchase path; many forever-lapsed by design
- **Free** — natural decay; ad fatigue; game not sticky enough

Tactics differ by segment.

## Channels for re-engagement

### Email
- Highest-control channel
- Best for: detailed content tease, welcome-back bundle promotion
- Frequency: monthly for D14+; less often for D90+
- Open / click rates: typical 15–30% open / 2–5% click for game emails

### Push notifications
- Mobile games only; require permission grant
- Best for: event-specific triggers ("Halloween event starts now!")
- Frequency: limited; over-pushing causes opt-out
- Conversion: typical 1–3% reactivation per push

### Paid retargeting
- Custom audiences on Meta / Google / TikTok built from lapsed user IDs
- Best for: lapsed cohorts large enough to build audience (typically 10,000+)
- Cost per reactivation typically lower than CPI (player already played; reactivation cheaper)
- Coordinate with privacy policies (some jurisdictions restrict this)

### In-app (for installed-but-inactive)
- Local notifications, in-app banners on next open
- Best for: returning players bouncing off "what's new" — surface event / pass / content immediately

## Re-engagement triggers (when to act)

- **Lapse date passed** (D14, D30, D90)
- **Big event launching** (season start, anniversary, expansion)
- **Content drop** (new heroes / characters / levels)
- **Welcome-back bundle** available (with `iap-manager`)
- **Friend / clan activity** (if game has social hooks)
- **Birthday / anniversary** of player's account

Best campaigns combine triggers ("season start + welcome-back bundle for D14+ lapsed players").

## Welcome-back bundles (with `iap-manager`)

*One-time* bundle offered to returning players:

- **Heavy discount** (often 80% off equivalent)
- **Mix of currency + cosmetic + utility** (starter-pack-like composition)
- **Time-limited** (48–72 hours after first surface)
- **One-time per account** (no v2)

Welcome-back bundles convert at 8–15% for D14–D30 lapsed returners — much higher than starter packs; player already invested time.

## Comms templates

### "We miss you" (D14)

```
Subject: <game> just shipped <event name>

Body:
Hi <name>,

It's been a couple of weeks. <Event name> just dropped, and we want you back.

[Trailer/screenshot]

What's new:
- <new content beat 1>
- <new content beat 2>
- <welcome-back bundle teaser>

Tap to play: <CTA>
```

### Season start (D30+)

```
Subject: Season X is here — your spot is waiting

Body:
A new season just started, and <game> has a lot of new things since you last played.

[Trailer]

The pass is fresh. Welcome-back bundles are waiting. Your old <progress / cosmetics / titles> are still yours.

Play Season X: <CTA>
```

### Long-tail (D90+)

Generic "we miss you" reads spammy at this distance. Better:

```
Subject: <game> Year One Recap

Body:
A year ago, you played <game>. Here's what's happened since:

- <major content drop 1>
- <major content drop 2>
- <community moment>

If you're curious, your account is still there. <CTA>
```

## Per-segment re-engagement

### Whales
- Higher-touch comms (personalized email, "we noticed you've been quiet")
- VIP-exclusive comms (founders, top-spenders)
- Custom welcome-back bundles at higher tiers ($49.99+)

### Dolphins
- Standard welcome-back bundle ($9.99–$19.99)
- Season pass tease + free pass trial
- Themed event hooks

### Minnows
- Welcome-back bundle ($4.99) — same shape as starter pack
- Limited-time event content
- Friend / social hooks ("your friends played 23 hours since you left")

### Free
- Free events ("free login this week!")
- Free new content unlocks
- Referral / friend re-engagement (peer pressure works)

## Multi-channel orchestration

Strongest reactivation campaigns coordinate channels:

1. **Day -3:** push notification ("Halloween starts in 3 days — your seat is held!")
2. **Day -1:** email ("Halloween starts tomorrow")
3. **Day 0:** in-app banner on first open + welcome-back bundle pop-up
4. **Day 1:** retargeting ad served via Meta / TikTok
5. **Day 3:** follow-up email if not yet returned

Don't over-orchestrate (becomes spam). Cap at 3–5 touches per re-engagement window.

## KPIs

- **Reactivation rate** — % of targeted lapsed who return
- **D7 retention of reactivated** — did they stick?
- **Per-segment ROAS of re-engagement spend** — paid retargeting + bundle revenue / cost
- **Long-term value of reactivated cohort** — reactivated players often *out-pay* new acquisitions

## Anti-patterns

- **Generic "we miss you"** with no hook — needy and ineffective
- **Same comms for all segments** — minnow vs whale need different messages
- **Over-frequency** — push 3× per day reads as harassment
- **Welcome-back bundle without comms** — bundle exists, nobody knows
- **Re-engaging during known content drought** — bringing players back to nothing burns trust
- **Ignoring D90+ cohort** — long-tail reactivatable at events; most teams skip them

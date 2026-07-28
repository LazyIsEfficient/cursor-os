# Catalog types

Four flavors of catalog work. Identify kind before opening spreadsheet.

## 1. New launch catalog

**Signal:** game ships within months; catalog has *shape* from [game-monetization-strategist](../../game-monetization-strategist/SKILL.md) but no SKUs.

**Inputs:** strategy doc, segment economics, price-tier-ladder intent, soft-launch KPI floors.

**Outputs:** filled `iap-catalog-template.md`; per-tier SKUs populated; bundles + starter pack designed; A/B price tests planned for soft launch; storefronts configured.

**Pitfalls:**
- Skipping starter pack (single biggest F2P conversion lever)
- Mid-tier vacuum
- Storefront config not sandbox-tested before launch

## 2. Live catalog re-tune

**Signal:** game live; data shows specific SKUs underperforming or bundles need refresh.

**Inputs:** live telemetry, IAP funnel data, segment migration data, comp-title catalog moves.

**Outputs:** SKU-level changes (new bundles, retired SKUs, re-priced SKUs); A/B price tests ramped; cadence calendar (weekly bundle / monthly themed / seasonal pass).

**Pitfalls:**
- Re-pricing existing paid bundles without comms (trust break)
- Killing SKU without measuring whether it serves small-but-sticky segment
- Bundle bloat (catalog grows, conversion drops from choice paralysis)

## 3. New region

**Signal:** game expanding to new region (e.g. Brazil, India, Korea, China).

**Inputs:** local market data, platform tier maps for region, local payment rails (PayPay in JP, Pix in BR, UPI in IN), local price-psychology research.

**Outputs:** region price table; localized SKU names; region-specific bundles (local holidays, local cosmetic themes); local payment-rails integration (with `godot-engineer`).

**Pitfalls:**
- Flat USD conversion (loses local price psychology)
- Missing local payment rails (Western IAP options dominate but local rails convert better in many regions)
- Not localizing display copy beyond price

## 4. Platform shift

**Signal:** Apple / Google / Steam policy change requires catalog re-architecture (e.g. App Store Connect API change, Google Play billing v6, Steam DLC restructure, web3 platform restriction).

**Inputs:** platform documentation, deprecation timeline, compliance requirements.

**Outputs:** catalog-shape change; SKU migration plan; player communication; rollout timeline.

**Pitfalls:**
- Missing deprecation deadline (catastrophic — payments stop)
- Not coordinating with engineering for SDK migration
- Player-visible disruption without comms (especially restore-purchases)

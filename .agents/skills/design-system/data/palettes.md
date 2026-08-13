# Palette database

A curated set of committed palettes. Each is one dominant brand hue + one sharp accent (rationed), an optional metallic, and tuned neutrals (a warm or cool paper for light, a tuned near-black for dark, never `#000`). Pick one that fits the brief, then adapt the exact values. None are generic SaaS-blue or AI-purple.

How to read: `dominant` carries the identity (CTA, links, focus). `accent` pops against it, used sparingly. `metallic` is a thin premium detail (hairlines, marks), never a large fill. From `paper` and `near-black` you derive `--bg-base`, `--surface`, `--text` per `color.md`.

## Fintech, crypto, money
- **Sound orange** (digital gold, sovereign): dominant `#f7931a`, accent `#2bd4a8`, metallic `#e8b65a`. paper `#f7f5f0`, near-black `#0b0b0e`. Why: warm conviction, mint reads "confirmed".
- **Calm aqua** (neobank, trust): dominant `#0aa6b8`, accent `#ff7a45`, metallic none. paper `#f4f7f8`, near-black `#06121f`. Why: water-calm money, warm CTA.
- **Midnight ledger** (self-custody, quiet): dominant `#3da9fc`, accent `#5fe0b8`, metallic `#cbb88a`. paper `#eef2f6`, near-black `#0a0f24`. Why: deep-night security, green = settled.
- **Vault green** (wealth, stability): dominant `#1f7a52`, accent `#e7b84b`, metallic `#caa24a`. paper `#f3f1ea`, near-black `#0c130f`. Why: evergreen money, gold restraint.

## Luxury, fashion, hospitality
- **Oxblood** (heritage, wine, leather): dominant `#7a1f2b`, accent `#d9a441`, metallic `#caa24a`. paper `#f2ece2`, near-black `#150b0c`. Why: deep red gravitas, gold seam.
- **Noir gold** (couture, dark luxury): dominant `#c8a96a` (used as gold accent on near-black), accent `#c8a96a`, metallic `#c8a96a`. paper `#ede7dc`, near-black `#0b0b0d`. Why: monochrome dark, gold is the whole voice. Sans 300, wide tracking.
- **Champagne burgundy** (boutique hotel): dominant `#5c1a2e`, accent `#caa583`, metallic `#caa583`. paper `#f4efe6`, near-black `#160d10`. Why: quiet-luxury venue, warm neutrals.
- **Blush rose** (beauty, modern feminine): dominant `#b03a5b`, accent `#1f3b4d`, metallic `#caa24a`. paper `#fbf2f1`, near-black `#1c0f14`. Why: rose with a navy anchor, not pink-on-pink.
- **Pine prestige** (sustainable luxury): dominant `#1a3a2a`, accent `#cda349`, metallic `#cda349`. paper `#f1efe6`, near-black `#0a120d`. Why: forest depth, gold thread.

## Editorial, publishing, culture
- **Ink vermilion** (magazine, opinion): dominant `#1c1a17`, accent `#d8462a`, metallic none. paper `#f4f1ea`, near-black `#14110d`. Why: near-black text, one hot red. Serif display.
- **Stone clay** (slow journalism, craft): dominant `#a8492f`, accent `#7fa66a`, metallic none. paper `#f3efe6`, near-black `#1c1b19`. Why: terracotta + sage, warm and considered.
- **Cobalt paper** (design weekly, sharp): dominant `#1b3bdb`, accent `#f5d000`, metallic none. paper `#f6f5f2`, near-black `#0c1024`. Why: primary blue + lemon, Swiss energy.
- **Spectral plum** (essays, literary): dominant `#3a1f3d`, accent `#d98a4e`, metallic `#caa24a`. paper `#f4f0ea`, near-black `#160d17`. Why: aubergine restraint, warm apricot lift.

## SaaS, data, dev tools
- **Graphite cyan** (analytics, calm SaaS): dominant `#4f8cff`, accent `#22d3ee`, metallic none. paper `#f4f7fb`, near-black `#0e1422`. Why: blue + cyan, cool and precise, no purple.
- **Terminal lime** (dev tool, CLI): dominant `#c6f24e`, accent `#7aa2ff`, metallic none. paper `#f3f4ee`, near-black `#0a0a0b`. Why: electric lime, builder energy, rationed.
- **Slate ember** (infra, B2B): dominant `#33415c`, accent `#ff6b3d`, metallic none. paper `#f4f5f7`, near-black `#0e131c`. Why: steel structure, warm action.
- **Vault dark** (secrets, security): dominant `#238636`, accent `#3fb950`, metallic none. paper `#eef2ee`, near-black `#0d1117`. Why: GitHub-green confidence on near-black.

## Health, wellness, science
- **Teal coral** (healthtech, human): dominant `#0f766e`, accent `#ff6b5e`, metallic none. paper `#f1f6f5`, near-black `#08201c`. Why: clinical teal warmed by coral.
- **Sage mineral** (wellness, calm): dominant `#5a6b3b`, accent `#c98a3a`, metallic none. paper `#f4f3ea`, near-black `#141710`. Why: olive + amber, grounded and natural.
- **Cool mint** (pharma, clean): dominant `#1f9d8f`, accent `#3a5bdb`, metallic none. paper `#f2f8f6`, near-black `#0a1714`. Why: trustworthy mint, indigo for emphasis.

## Industrial, B2B, architecture, real estate
- **Trade graphite** (industrial B2B): dominant `#2b2f36`, accent `#f7931a`, metallic none. paper `#f4f4f2`, near-black `#0e0f12`. Why: heavy neutral, safety-orange action.
- **Architect sand** (studio, structural): dominant `#b89b72`, accent `#1c1a17`, metallic none. paper `#f1ede4`, near-black `#15130f`. Why: stone + ink, restraint and grid.
- **Steel safety** (engineering, machinery): dominant `#5b6b7a`, accent `#ffd400`, metallic none. paper `#f2f3f4`, near-black `#12161a`. Why: steel + hi-vis yellow, function-first.
- **Maroon mustard** (heritage trade, craft): dominant `#6b1f2e`, accent `#d9a441`, metallic `#caa24a`. paper `#f3eee4`, near-black `#160c0f`. Why: old-house red, mustard warmth.

## Food, hospitality, agriculture
- **Olive rust** (farm-to-table, food): dominant `#5a6b3b`, accent `#b5532a`, metallic none. paper `#f5f1e7`, near-black `#13160e`. Why: field olive, rust accent, appetite-warm.
- **Ferment amber** (slow kitchen, craft food): dominant `#d99a4e`, accent `#7fa66a`, metallic none. paper `#f4ede0`, near-black `#1a1614`. Why: warm amber, herb-green pop.
- **Mediterranean clay** (travel, coastal): dominant `#c1502e`, accent `#0b6e6e`, metallic none. paper `#f4ede2`, near-black `#1a100c`. Why: terracotta + sea-teal, sun-warm.

## Creative, agency, music, youth
- **Bauhaus trio** (agency, bold): dominant `#1b3bdb`, accent `#e4342c`, metallic `#f5d000`. paper `#f5f3ee`, near-black `#101216`. Why: primary red/blue/yellow, geometric confidence.
- **Indigo peach** (creative studio): dominant `#1e2a78`, accent `#ff9e7a`, metallic none. paper `#f3f1ec`, near-black `#0c1030`. Why: deep indigo, soft peach lift.
- **Royal magenta** (music, nightlife): dominant `#2747c9`, accent `#ff4d8d`, metallic none. paper `#f4f3f6`, near-black `#0a0b1f`. Why: electric blue + hot pink, never the crypto-purple.
- **Concrete hi-vis** (brutalist, raw): dominant `#111111` (near-black as dominant), accent `#ffe600`, metallic none. paper `#e9e7e2`, near-black `#0d0d0d`. Why: stark concrete + safety yellow, no soft edges.

## Fintech, crypto, money (more)
- **Carbon mint** (modern bank app): dominant `#10b981`, accent `#f59e0b`, metallic none. paper `#f3f7f5`, near-black `#0a1410`. Why: confident green money, amber for warmth.
- **Royal indigo note** (private banking, premium card): dominant `#27408b`, accent `#d4af37`, metallic `#d4af37`. paper `#f1f2f6`, near-black `#0a0e1c`. Why: deep blue authority, real gold leaf.
- **Ledger ink** (accounting, bookkeeping): dominant `#1f3a34`, accent `#e0533d`, metallic none. paper `#f4f2ea`, near-black `#0d1714`. Why: green-ledger calm, red for the figure that matters.
- **Bull copper** (trading, markets): dominant `#b5471f`, accent `#16a085`, metallic `#c9874e`. paper `#f4efe7`, near-black `#160d0a`. Why: copper heat, teal as the counter-move.

## Luxury, fashion, hospitality (more)
- **Onyx silver** (watches, hardware luxury): dominant `#9aa3ab`, accent `#9aa3ab`, metallic `#b8c0c6`. paper `#ecebe8`, near-black `#0c0d0f`. Why: cold metal precision, monochrome, silver is the voice.
- **Emerald velvet** (jewelry, opulent): dominant `#0f5132`, accent `#d4af37`, metallic `#d4af37`. paper `#f2efe6`, near-black `#08130d`. Why: deep emerald, gold seam, gemstone weight.
- **Ivory cocoa** (patisserie, fine food): dominant `#4a2c1d`, accent `#c98a3a`, metallic `#caa583`. paper `#f6f0e6`, near-black `#170f0a`. Why: chocolate and caramel, edible richness.
- **Smoke lavender** (modern boutique, restrained): dominant `#5d5470`, accent `#c2a878`, metallic `#c2a878`. paper `#f2f0ee`, near-black `#14111a`. Why: a greyed lavender that stays sophisticated, gold thread, never the crypto wash.
- **Coastal linen** (resort, spa hotel): dominant `#3f6f6a`, accent `#e6a15a`, metallic none. paper `#f4f0e6`, near-black `#0d1817`. Why: sea-pine and sand, easy luxury.

## Editorial, publishing, culture (more)
- **Riso blue red** (zine, indie press): dominant `#2b4cf0`, accent `#ff4438`, metallic none. paper `#f6f4ed`, near-black `#0b0e22`. Why: risograph duotone energy, raw print.
- **Forest paper** (nature writing, long-read): dominant `#26432f`, accent `#bf6a35`, metallic none. paper `#f3f1e6`, near-black `#0d1410`. Why: woodland green, autumn rust, calm reading.
- **Slate marigold** (current affairs, weekly): dominant `#2d3a45`, accent `#f0a500`, metallic none. paper `#f4f2ec`, near-black `#10161b`. Why: serious slate, one bright marigold pull.
- **Mono red** (photography, gallery): dominant `#161616`, accent `#e63223`, metallic none. paper `#efece6`, near-black `#0d0d0d`. Why: near-black on paper, a single red frame.

## SaaS, data, dev tools (more)
- **Electric cobalt** (developer platform): dominant `#2f6bff`, accent `#00d18f`, metallic none. paper `#f3f6fb`, near-black `#0a1020`. Why: confident blue, green reads "passing".
- **Magma slate** (observability, alerting): dominant `#33415c`, accent `#ff5630`, metallic none. paper `#f3f5f7`, near-black `#0d121c`. Why: calm slate broken by alert-orange.
- **Signal teal** (API, infra): dominant `#0d9488`, accent `#facc15`, metallic none. paper `#f1f7f6`, near-black `#08201d`. Why: teal trust, yellow for state.
- **Plum data** (analytics, BI): dominant `#6b2d5c`, accent `#46d6a0`, metallic none. paper `#f6f1f4`, near-black `#1a0f17`. Why: a committed berry with a mint counter, deliberately not the default violet.
- **Rust console** (CLI tool, warm dev): dominant `#ff6a3d`, accent `#3ad6c0`, metallic none. paper `#f4efe9`, near-black `#0d0c0b`. Why: warm terminal, teal cursor.

## Health, wellness, science (more)
- **Clinical indigo** (medtech, serious): dominant `#1e40af`, accent `#22c2a6`, metallic none. paper `#f2f5fb`, near-black `#0a1124`. Why: deep medical blue, calm green vitals.
- **Apothecary green** (supplements, botanical): dominant `#3a5a40`, accent `#d98c5f`, metallic none. paper `#f3f2e8`, near-black `#101810`. Why: herbal green, terracotta warmth.
- **Sky calm** (mental health, meditation): dominant `#4a90c2`, accent `#f3a953`, metallic none. paper `#f1f6fa`, near-black `#0a1620`. Why: open sky-blue, gentle sun, low arousal.
- **Plasma coral** (biotech, research): dominant `#0b7285`, accent `#ff6f61`, metallic none. paper `#f1f7f8`, near-black `#07191e`. Why: lab-teal precision, living coral.

## Industrial, B2B, architecture (more)
- **Hazard black** (construction, safety): dominant `#1c1c1c`, accent `#ffcc00`, metallic none. paper `#ecebe7`, near-black `#0e0e0e`. Why: caution-stripe black and yellow, jobsite.
- **Diesel blue** (logistics, fleet): dominant `#1f4e79`, accent `#ff7a18`, metallic none. paper `#f1f4f6`, near-black `#0c1622`. Why: workwear blue, hi-vis orange.
- **Foundry red** (manufacturing, steel): dominant `#8c2f1f`, accent `#5b6b7a`, metallic `#9aa3ab`. paper `#f1efe9`, near-black `#150c0a`. Why: molten red, cold steel grey.
- **Concrete sage** (modern real estate): dominant `#6b7167`, accent `#c08a4a`, metallic none. paper `#f2f1ec`, near-black `#13140f`. Why: concrete-sage neutral, warm brass accent.

## Food, hospitality, agriculture (more)
- **Tomato basil** (Italian, trattoria): dominant `#c0392b`, accent `#3a7d44`, metallic none. paper `#f5efe2`, near-black `#160c0a`. Why: appetite red, basil green, classic.
- **Honey rye** (bakery, brewing): dominant `#b9772b`, accent `#7d4f2a`, metallic none. paper `#f5eddc`, near-black `#1a130a`. Why: golden crust and toasted brown.
- **Matcha cream** (cafe, tea, modern): dominant `#6f8f4e`, accent `#d98a4e`, metallic none. paper `#f5f2e6`, near-black `#13160d`. Why: matcha green, warm cream, calm.
- **Berry harvest** (orchard, market, jam): dominant `#7d234b`, accent `#e0a32e`, metallic none. paper `#f5efe6`, near-black `#190b11`. Why: deep berry, harvest gold.

## Creative, agency, music, youth (more)
- **Acid sun** (streetwear, youth): dominant `#101010`, accent `#d6ff3f`, metallic none. paper `#ededeb`, near-black `#0c0c0c`. Why: black canvas, acid-yellow shout.
- **Hot coral navy** (creative SaaS, fun but pro): dominant `#1b2a4a`, accent `#ff5a5f`, metallic none. paper `#f3f4f6`, near-black `#0a1020`. Why: navy structure, coral energy.
- **Cyber teal pink** (music app, nightlife): dominant `#08d9d6`, accent `#ff2e63`, metallic none. paper `#101418`, near-black `#0a0d10`. Why: electric teal and magenta on dark, club energy. Dark-first.
- **Tangerine grape** (festival, events): dominant `#ff7a00`, accent `#3b2a6d`, metallic none. paper `#f5f0e8`, near-black `#150f0c`. Why: tangerine pop over grape depth.
- **Marker primary** (design studio, playful): dominant `#0047ff`, accent `#ffd000`, metallic none. paper `#f4f3ef`, near-black `#0a0c1a`. Why: marker blue and yellow, sketchbook honesty.

## Travel, outdoors, adventure
- **Trail clay** (hiking, gear): dominant `#9c5a33`, accent `#2e7d5b`, metallic none. paper `#f4eee3`, near-black `#180f0a`. Why: dirt-trail clay, forest green.
- **Alpine ice** (ski, mountain): dominant `#2b6ca3`, accent `#e8503a`, metallic none. paper `#f1f5f8`, near-black `#0b1620`. Why: glacier blue, rescue-red warmth.
- **Desert dusk** (overland, southwest): dominant `#b5532a`, accent `#3a4a78`, metallic none. paper `#f5ece0`, near-black `#190f0a`. Why: canyon rust, dusk blue.
- **Ocean kelp** (surf, coastal travel): dominant `#0b6e6e`, accent `#e8b84b`, metallic none. paper `#f1f5f3`, near-black `#071816`. Why: deep ocean, sun gold.
- **Safari khaki** (expedition, wildlife): dominant `#7a6a3a`, accent `#c25a2e`, metallic none. paper `#f3f0e4`, near-black `#15130b`. Why: khaki and sunset rust, dust and distance.

## Education, civic, nonprofit
- **Scholar navy** (university, edtech): dominant `#1d3461`, accent `#e0a93b`, metallic none. paper `#f2f3f6`, near-black `#0a0f1e`. Why: academic navy, gold tradition.
- **Chalk coral** (kids learning, friendly): dominant `#2a9d8f`, accent `#ff6b5e`, metallic none. paper `#f3f5f2`, near-black `#0a1c1a`. Why: teal and coral, approachable, bright.
- **Civic green** (gov, public service): dominant `#1f6f54`, accent `#3a5bdb`, metallic none. paper `#f2f4f2`, near-black `#0b1612`. Why: trustworthy green, dependable blue.
- **Library oxblood** (archive, culture nonprofit): dominant `#6b2434`, accent `#c9a24a`, metallic `#c9a24a`. paper `#f3eee4`, near-black `#160b0f`. Why: old-leather red, brass, heritage.

## Sports, fitness, energy
- **Track volt** (athletic, performance): dominant `#0a0a0a`, accent `#caff00`, metallic none. paper `#ededea`, near-black `#080808`. Why: black kit, volt energy.
- **Boxing red** (combat, gym): dominant `#c11919`, accent `#1c1c1c`, metallic none. paper `#f1efe9`, near-black `#0e0e0e`. Why: blood-red drive, black grit.
- **Hydro blue** (running, endurance): dominant `#0066ff`, accent `#ff8a00`, metallic none. paper `#f1f4fa`, near-black `#0a1024`. Why: cold hydration blue, sunrise orange.
- **Pitch green** (football, team): dominant `#1f7a34`, accent `#eaff00`, metallic none. paper `#f1f5f1`, near-black `#0a1810`. Why: grass-pitch green, floodlight yellow.

## Beauty, cosmetics
- **Nude bronze** (makeup, modern): dominant `#a86b4f`, accent `#2c2622`, metallic `#caa583`. paper `#f6efe8`, near-black `#181210`. Why: skin-bronze warmth, espresso anchor.
- **Petal noir** (perfume, dark beauty): dominant `#8a2d4d`, accent `#caa583`, metallic `#caa583`. paper `#f7eef0`, near-black `#170c10`. Why: deep petal, champagne, allure.
- **Clean clay** (skincare, minimal): dominant `#b08968`, accent `#5a7a6a`, metallic none. paper `#f5f0e9`, near-black `#161210`. Why: clay and sage, honest and bare.

## Kids, games, entertainment
- **Arcade pop** (casual game): dominant `#ff3d7f`, accent `#00d1ff`, metallic none. paper `#14101c`, near-black `#0c0a12`. Why: candy pink and cyan, playful. Dark-first.
- **Bubble sun** (kids app): dominant `#ff9f1c`, accent `#2ec4b6`, metallic none. paper `#fff7ea`, near-black `#1a1208`. Why: sunny orange, mint, friendly.
- **Pixel forest** (indie game, cozy): dominant `#3a7d44`, accent `#f4a259`, metallic none. paper `#f2efe2`, near-black `#0d1610`. Why: cozy woodland, warm lantern.
- **Neon court** (esports): dominant `#0b0f1a`, accent `#39ff88`, metallic none. paper `#e8eaee`, near-black `#080b12`. Why: dark arena, neon-green rationed.

## AI, deep tech (deliberately anti-violet)
- **Signal red AI** (AI infra, anti-cliché): dominant `#0e1116`, accent `#ff4d2e`, metallic none. paper `#f1f1ef`, near-black `#0a0c10`. Why: refuse the violet, dark plus one hot signal.
- **Quantum teal** (research lab): dominant `#0b3d4f`, accent `#36e0c8`, metallic none. paper `#eff6f6`, near-black `#061a20`. Why: deep teal, bright cyan-mint, scientific.
- **Graphene amber** (hardware AI, chips): dominant `#26211c`, accent `#ffb020`, metallic `#caa24a`. paper `#f2efe8`, near-black `#14110d`. Why: carbon body, amber circuit glow.

## Climate, energy, sustainability
- **Solar field** (renewables): dominant `#1f7a52`, accent `#ffb200`, metallic none. paper `#f3f3e8`, near-black `#0b1410`. Why: green energy, solar gold.
- **Tidal blue** (water, ocean tech): dominant `#0a7d9e`, accent `#9ad14a`, metallic none. paper `#eff6f8`, near-black `#06181f`. Why: tidal blue, fresh green growth.
- **Earthen rust** (regenerative ag, climate): dominant `#8a4b2f`, accent `#5a7a3a`, metallic none. paper `#f4eee2`, near-black `#160e09`. Why: soil rust, crop green.
- **Wind slate** (grid, cleantech): dominant `#3a5a6b`, accent `#7ed957`, metallic none. paper `#f1f4f5`, near-black `#0c1820`. Why: cool slate sky, turbine green.

## E-commerce, retail, DTC
- **Checkout black** (premium DTC): dominant `#111114`, accent `#ff5a36`, metallic none. paper `#f4f2ee`, near-black `#0c0c0e`. Why: confident black store, one hot CTA.
- **Mint commerce** (fresh DTC, friendly): dominant `#10a37f`, accent `#ff8a3d`, metallic none. paper `#f2f7f4`, near-black `#0a1714`. Why: fresh green, warm buy-button.
- **Plum retail** (fashion ecom): dominant `#5e2750`, accent `#f0b429`, metallic none. paper `#f6f1f4`, near-black `#180d15`. Why: rich berry, gold price, boutique.
- **Coral market** (marketplace): dominant `#ff5252`, accent `#1f6f8b`, metallic none. paper `#f5f1ec`, near-black `#190d0d`. Why: lively coral, trustworthy teal-blue.

## Automotive, mobility
- **Carbon racing** (performance auto): dominant `#141414`, accent `#e10600`, metallic `#9aa3ab`. paper `#ececea`, near-black `#0c0c0c`. Why: carbon black, racing red, silver trim.
- **EV mint** (electric mobility): dominant `#0fb37f`, accent `#1c2733`, metallic none. paper `#f1f7f4`, near-black `#0a1612`. Why: clean-energy green, graphite body.
- **Transit amber** (micro-mobility, scooters): dominant `#1f2a44`, accent `#ffb400`, metallic none. paper `#f2f3f6`, near-black `#0a1020`. Why: night-navy, amber light.

## Mood-led (any sector)
- **Sunset warm** (warm hero, gradient-pair): dominant `#ff6a3d`, accent `#ffd23f`, metallic none. paper `#f6efe6`, near-black `#1a100c`. Why: orange to gold warmth, one committed gradient, not purple.
- **Jewel emerald-sapphire** (rich, festive): dominant `#0f5132`, accent `#1d3461`, metallic `#d4af37`. paper `#f1efe6`, near-black `#08130d`. Why: gemstone pairing, gold seam.
- **Pastel committed** (soft but not weak): dominant `#5a7d9a`, accent `#e8a08d`, metallic none. paper `#f6f3ee`, near-black `#11161c`. Why: dusty blue and clay-rose, soft yet anchored.
- **Monochrome blue** (one-hue restraint): dominant `#1e4db7`, accent `#7aa2ff`, metallic none. paper `#f2f4fa`, near-black `#0a1024`. Why: a single blue family, light and deep, maximum discipline.
- **Earth triad** (grounded, organic): dominant `#6b4f2a`, accent `#3a5a40`, metallic `#caa24a`. paper `#f4efe2`, near-black `#161109`. Why: soil, leaf, brass, natural.
- **Noir neon** (one electric on black): dominant `#0c0c0e`, accent `#00ffa3`, metallic none. paper `#ececec`, near-black `#0a0a0c`. Why: total black, one neon-mint, rationed.

## Minimal / configurable
- **Mono accent** (minimalist, any sector): dominant `{pick one vivid hue}`, accent same hue lighter, metallic none. paper `#f5f3ee`, near-black `#0a0a0b`. Why: near-monochrome, one committed hue, maximum restraint.
- **Warm paper ink** (timeless, editorial-neutral): dominant `#1c1a17`, accent `{one warm hue}`, metallic none. paper `#f4f1ea`, near-black `#14110d`. Why: paper + ink + a single warm signal.

## Rules when picking
- One dominant, one accent. If you add a metallic or a third, keep it subordinate (hairlines, marks).
- Never pure black on text/surface, never the purple-on-white gradient.
- Verify contrast 4.5:1 for body text in both light and dark (see `color.md`).
- Two clients in the same sector must not get the same palette. Vary the dominant or the accent.

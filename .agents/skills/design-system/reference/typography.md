# Choosing a distinctive type pairing

The fastest way to look generic is the font. Inter, Roboto, Arial, and system-ui as the PRIMARY family are the tell. Fallbacks after a real font are fine.

## Method
- Pair a display font (headings, hero, brand) with a body font (text, UI). Two voices, one conversation.
- Self-host as woff2 with `font-display: swap`. Zero external calls (RGPD), no layout shift.
- Match the personality. The pairing IS half the identity.
- Vary it. Do not pick the same pairing twice across clients. Never default to Space Grotesk (the converged AI choice).

## A starting palette (by mood)
Drawn from what works in the house systems and beyond. Seeds, not a fixed menu; do not always reach for the same row.

| Mood | Display | Body |
|------|---------|------|
| Refined / app (MVP) | Clash Display | Satoshi |
| Techy / precise (PLR) | Geist | Geist, mono labels in Kode Mono |
| Editorial / Swiss (Vigie) | Fraunces | Hanken Grotesk, code in JetBrains Mono |
| Luxury / fashion | Playfair Display or a high-contrast serif | a clean grotesk |
| Bold / energetic | Cabinet Grotesk, General Sans | Inter Tight, General Sans |
| Brutalist / raw | a heavy grotesk or a monospace | system mono |
| Institutional / trust (LeCoffre) | conservative end: a grotesk such as Inter is tolerated as body here, chosen deliberately for the client | Poppins, nav in Montserrat |

LeCoffre is the conservative exception, an inherited client constraint, not the default. Prefer distinctive faces.

Free, self-hostable, distinctive foundries: Fontshare by Indian Type Foundry (Clash Display, Satoshi, General Sans, Cabinet Grotesk), Vercel (Geist), and the usual open faces (Fraunces, Hanken Grotesk, Playfair, JetBrains Mono).

## Scale and weights
- A type scale as `--fs-*` tokens, e.g. 12, 14, 16, 18, 20, 24, 28, 32, 40, 44, 52, 56.
- Letter-spacing -0.01 to -0.02em on large headings, weight 600 to 800.
- Body 16px, line-height 1.5, weight 400. Tabular figures for data and prices.

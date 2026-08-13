# Building a committed palette and the light/dark map

## Commit
- Pick ONE dominant brand hue. It carries the identity. (LeCoffre blue `#005bcb`, MVP orange `#ff9500`, PLR green `#00d974`.)
- Pick ONE sharp accent that pops against it, a near-complement or a hot secondary. (MVP pairs orange with system blue/green/red; LeCoffre blue with an orange-red secondary.)
- Add semantic colors (success, warning, danger) and tuned neutrals.
- Timid, evenly spread palettes read as generic. Dominant + accent beats a rainbow.

## Never
- Pure black `#000` on text or surface. Use a tuned near-black (MVP `#0b0b10`, LeCoffre `#0e1326`, PLR `#08080a`).
- The purple-on-white gradient.
- Raw hex inside components. Everything is a token.

## Tint and on-tint
For badges and states, build a low-opacity tint of each semantic hue (~16% light, ~20% dark) plus a readable on-tint text color. (MVP: `--tint-green` for the fill, `--green-text` for the label.)

## The light/dark token map
Decide for each token whether it inverts or holds.

- Usually CONSTANT (same in both): brand hue, accent, system colors.
- Usually INVERTS: `--bg-base`, `--surface`, `--text`, `--text-secondary`, `--separator`, `--glass*`, `--control-bg`, the tints and the on-tint text.

Light is the `:root` default, dark is the override block. Test both: contrast 4.5:1 for body text, 3:1 for large text and UI glyphs, in BOTH themes. Do not assume light values work in dark.

## Surface language
Pick one and hold it across the system:
- Flat: solid `--surface`, hairline `--separator`.
- Soft: `--surface` + a soft `--shadow-card` (e.g. `0 4px 18px rgba(0,0,0,.15)`).
- Glass: translucent `--glass` + `--glass-border` + `--glass-reflect` (inner sheen: top highlight + 0.5px edge + low glow) + a colored halo behind. This is MVP's liquid glass. Expensive in attention; use when the brand earns it.

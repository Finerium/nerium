# Kenney UI Pack RPG Expansion

Primary Kenney CC0 source for HUD chrome fallback in the NERIUM RV build. Hesperus (Opus SVG chrome author) treats this pack as the second-line fallback when Opus SVG output is unavailable for a given HUD element.

## Source

- **Author**: Kenney (kenney.nl)
- **Pack URL**: https://kenney.nl/assets/ui-pack-rpg-expansion
- **License**: CC0 1.0 Universal Public Domain Dedication (see `LICENSE.txt`)
- **Version pulled**: 2023-03-01 archive (`kenney_ui-pack-rpg-expansion.zip`, Kenney hash `b1e1f298c6-1677661824`)

## Committed files

- `sheet.png`: `uipack_rpg_sheet.png`, packed HUD chrome atlas.
- `sheet.xml`: Kenney-standard XML sprite definition file, legible by the `scripts/pack-atlas.ts` parser.
- `LICENSE.txt`: CC0 license text verbatim.

## Not committed

- `PNG/`: individual panel PNGs redundant with the packed sheet.
- `Vector/`: SVG originals; Hesperus prefers Opus-authored SVG for chrome consistency and does not re-use Kenney vectors.

## Usage

Referenced as source key `kenney_ui_pack_rpg_expansion` in `src/data/assets/asset_registry.ts`. Erato-v2 HUD components fall through to panel sprites from this pack via the registry lookup when the Opus SVG chrome atlas is not loaded.

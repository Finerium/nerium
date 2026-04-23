# Kenney Roguelike RPG Pack

Primary Kenney CC0 source for Medieval Desert baseline sprites in the NERIUM RV build.

## Source

- **Author**: Kenney (kenney.nl)
- **Pack URL**: https://kenney.nl/assets/roguelike-rpg-pack
- **License**: CC0 1.0 Universal Public Domain Dedication (see `LICENSE.txt`)
- **Version pulled**: 2023-03-01 archive (`kenney_roguelike-rpg-pack.zip`, Kenney hash `1cb71b28fb-1677697420`)

## Committed files

- `sheet.png`: `roguelikeSheet_transparent.png` (transparent alpha-channel variant, 94 KB), the master 16x16 tile sprite sheet used by `scripts/pack-atlas.ts`.
- `spritesheetInfo.txt`: Kenney's official tile coordinate metadata.
- `LICENSE.txt`: CC0 license text verbatim from the upstream archive.

## Not committed

- `roguelikeSheet_magenta.png`: the magenta-chroma variant; unused because the transparent variant already exposes per-pixel alpha.
- `Map/`: pre-rendered demonstration maps, not needed for NERIUM's atlas packing.

## Usage

Invoked by `scripts/pack-atlas.ts` during Talos Sub-Phase 2. Downstream consumers are Thalia-v2 (`preload-asset-pack.json`) and Erato-v2 (UI fallback). The sheet is referenced as source key `kenney_roguelike_rpg` in `src/data/assets/asset_registry.ts` (owned by Pythia-v2 contract).

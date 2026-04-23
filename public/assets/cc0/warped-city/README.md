# Warped City

Primary CC0 source for Cyberpunk Shanghai world tiles plus sprites in the NERIUM RV build.

## Source

- **Author**: Ansimuz (OpenGameArt handle), via Warped City Files release
- **Pack URL**: https://opengameart.org/content/warped-city
- **License**: CC0 1.0 Universal Public Domain Dedication
- **Version pulled**: `warped_city_files.zip` as hosted on opengameart.org (archive date 2019-01-24)

## Committed subset

- `tileset.png`: master environment tileset (7 KB), the 16x16 tile grid used by `scripts/pack-atlas.ts` for Cyberpunk Shanghai ground plus wall layers.
- `sprites/`: player, vehicles, misc sprite directories.
- `background/`: parallax background layers.
- `props/`: cyberpunk urban props.

## Not committed

- `__MACOSX/`: macOS archive metadata, gitignored.
- `PSD/`: Photoshop sources, gitignored for repo size hygiene (see `.gitignore`).
- `demo/`: packaged demo HTML, not needed for the atlas pipeline.

## Attribution note

CC0 does not require attribution. NERIUM credits Ansimuz and OpenGameArt voluntarily in `public/assets/CREDITS.md` for transparency and as an honest-claim courtesy. Honest-claim discipline is a NERIUM meta-narrative requirement, not a license requirement.

## Usage

Referenced as source key `opengameart_warped_city` in `src/data/assets/asset_registry.ts`. Thalia-v2 Cyberpunk Shanghai scene preload asset pack lists these paths explicitly.

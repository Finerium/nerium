# NERIUM Visual Asset Attributions

Auto-derived from `spriteAtlasRegistry.attributionReport()` at build time. Every entry here corresponds to a sprite whose `license.attribution_required` flag is set to `true`.

## Status (2026-04-22, Thalia P3b)

| Atlas | Attributions required |
|---|---|
| `medieval_desert_atlas_v1` | none |
| `cyberpunk_shanghai_atlas_v1` | none |
| `steampunk_victorian_atlas_v1` | none |

All 48 sprites across the three atlases are Opus-procedural originals rendered by `scripts/build_world_atlases.mjs` under MIT license matching the NERIUM repository root. No CC-BY, CC-BY-SA, or attribution-encumbered assets were used.

## Reference inspirations

The following inspirations informed the visual vocabulary without any pixel data being copied. Listed for transparency.

- Kenney Assets ([kenney.nl](https://kenney.nl/), CC0): minimal silhouette reference.
- OpenGameArt ([opengameart.org](https://opengameart.org/), CC0): tile grid density and palette limit reference.
- Dune (Villeneuve, 2021 and 2024): Medieval Desert palette reference.
- Blade Runner 2049, Ghost in the Shell (1995 and 2017): Cyberpunk Shanghai palette and silhouette reference.
- BioShock Infinite (Columbia setting): Steampunk Victorian palette reference.
- NERIUMcyberpunkcity.html (pre-hackathon reference folder): palette reference only per V2 Anti-pattern 7 NEW WORK ONLY rule.

## Regenerating this file

Run the attribution report from application code:

```ts
import { spriteAtlasRegistry } from '@/builder/worlds/SpriteAtlasRegistry';
const report = await spriteAtlasRegistry.attributionReport();
```

Update this file when an atlas adds a sprite with `attribution_required: true`.

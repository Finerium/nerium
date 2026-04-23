---
name: fal-nano-banana-sprite
description: >
  DORMANT reference for fal.ai Nano Banana 2 sprite generation. Documents the
  pipeline (style-bible prompt prefix, master-sheet plus /edit reference,
  3x3 turnaround grid, client-side Pillow slicing, asset-ledger append). NOT
  INVOKED in the shipped RV build per Ghaisan personal fund $0 constraint per
  RV_PLAN RV.14 and M2 Section 9.4. Trigger: "nano banana", "fal sprite",
  "character turnaround", "3x3 grid sprite", "fal.ai image", "sprite generation".
  Activation requires V4 ferry approval and an ADR superseding ADR-override-antipattern-7.md.
---

<!-- SKILL ORIGIN: reconstructed by Talos from M1 Section 6.1 (fal.ai Nano Banana 2 deep dive) and https://github.com/fal-ai-community/skills. The upstream https://github.com/chongdashu/vibe-isometric-sprites repo returned PERMISSIONS_ERROR at clone time (M1 Section 2.2) so the pipeline is reconstructed from sibling artifacts and documented research, not copied verbatim. -->
<!-- LICENSE: original_mit (documentation only; upstream fal.ai model card governs inference terms: partner_inference_commercial) -->
<!-- TRANSPLANTED BY: Talos on 2026-04-23 -->
<!-- DORMANT: Not invoked in shipped build per Ghaisan personal fund $0 constraint per RV_PLAN RV.14. fal.ai Nano Banana 2 entries ship with status: 'dormant_deprecated' in docs/contracts/game_asset_registry.contract.md. lib/falClient.ts is authored but NOT imported by production code; scripts/slice-sprite.py is authored but NOT invoked. Activation requires V4 ferry approval and an ADR that supersedes docs/adr/ADR-override-antipattern-7.md. -->

# Fal.ai Nano Banana 2 Sprite Pipeline (DORMANT)

Documentation-only skill. Describes how NERIUM would generate sprites via fal.ai Nano Banana 2 if the lane were activated. Shipped RV build uses CC0 packs (Kenney, Oak Woods brullov, Warped City) and Opus SVG/Canvas procedural assets only.

---

## Dormancy Policy

- Status in `docs/contracts/game_asset_registry.contract.md`: `dormant_deprecated` for every `fal_nano_banana_2*` entry.
- `lib/falClient.ts` is authored by Talos as a reserved wrapper but never imported by any production file; dead-code elimination keeps it out of the client bundle.
- `scripts/slice-sprite.py` (Pillow-based slicer) ships in the repo but is not invoked during build or demo.
- `asset-ledger.jsonl` schema retains `event_kind: 'external_generate'`, `source_key: 'fal_nano_banana_2'`, full `GenerationParameters` and `CostRecord` fields so a future activation writes directly into the existing ledger without migration.
- Any active use of fal.ai Nano Banana 2 in a shipped build is a **strategic decision hard stop** and requires a V4 ferry plus an ADR that supersedes `docs/adr/ADR-override-antipattern-7.md`.

If a downstream agent proposes activating this lane, halt and ferry to V4 with the cost projection and the reason the CC0 plus Opus procedural path is insufficient.

---

## Pipeline Overview (documentation reference only)

1. Per-world **style-bible JSON** injected as a prompt prefix (palette hex codes, pixel era, lighting mood, outline policy).
2. Generate a **character sheet master** per named NPC at 2K 1:1 using `fal-ai/nano-banana-2` text-to-image.
3. For each variant (supporting NPC, alternate pose), call `fal-ai/nano-banana-2/edit` with up to 3 reference images including the master sheet; reuse the same seed.
4. For turnarounds, request an **8-direction 3x3 grid** on one 2K 1:1 canvas, center cell empty. Slice client-side via `scripts/slice-sprite.py`.
5. For tilesets, request a **16-tile 4x4 grid** on one 2K 1:1 canvas, edges tileable. Slice into 32x32 frames.
6. Append a `LedgerEntry` to `public/assets/ledger/asset-ledger.jsonl` with `prompt`, `seed`, `model_identifier`, `resolution_tier`, `cost_usd`, and reviewer decision.

---

## Pricing Reference (April 2026)

| Resolution | $ per image |
|---|---|
| 0.5K | $0.06 |
| 1K (default) | $0.08 |
| 2K | $0.12 |
| 4K | $0.16 |

`enable_web_search` adds $0.015; `thinking_level: "high"` adds $0.002. Nano Banana Pro is $0.15 at 1K.

Budget math per M1 Section 6.1: one vertical-slice quest generates approximately 25 images across tilesets, NPCs, icons, teasers, and A/B retries for about **$2.32**. Full Phase 1 (3 villages, 30 NPCs, 10 tilesets) projects to $10 to $15. The $40 cap in M1 was comfortable even after retries.

None of this is spent in the shipped RV build. Cost is zero because the lane is dormant.

---

## API Sketch (reserved; not wired)

```typescript
// lib/falClient.ts
// DORMANT. Imported nowhere in shipped code. Kept so activation is a single
// status flip in game_asset_registry.contract.md plus one import from whatever
// agent successor takes over asset generation.
import { fal } from '@fal-ai/client';

export interface NanoBanana2Input {
  prompt: string;
  aspect_ratio?: '1:1' | '3:4' | '4:3' | '16:9' | '9:16';
  output_format?: 'png' | 'jpeg' | 'webp';
  resolution?: '0.5K' | '1K' | '2K' | '4K';
  seed?: number;
  thinking_level?: 'low' | 'medium' | 'high';
  enable_web_search?: boolean;
  num_images?: number;
}

export async function generate(input: NanoBanana2Input): Promise<string> {
  fal.config({ credentials: process.env.FAL_KEY });
  const result = await fal.subscribe('fal-ai/nano-banana-2', {
    input,
    logs: true,
  });
  const images = (result.data as { images?: Array<{ url: string }> })?.images ?? [];
  if (images.length === 0) throw new Error('fal.ai returned no images');
  return images[0].url;
}
```

---

## Prompt Profile Template (style-bible)

```text
Pixel art, SNES 16-bit era, 32x32 top-down 3/4 JRPG tile, limited 16-color
palette: {{WARM_SAND #E8C48A}}, {{TERRACOTTA #B4613C}}, {{IVORY #F5ECD1}},
{{DUSTY_BLUE_SHADOW #6B7A99}}, {{BRONZE #8A5A2B}}. Subject: {{SUBJECT}}.
Cel-shaded flat fill, 1px black outline, no anti-alias, no dithering, magenta
(#FF00FF) chroma background. Sun-bleached mediterranean-aegean mood,
low-contrast midday light. Orthographic projection. Consistent with Apollo
Village art bible. {{TURNAROUND_NOTE: 3x3 grid, 8 directions plus center empty}}
```

Store the three worlds (Medieval Desert, Cyberpunk Shanghai, Steampunk Victorian) as separate style-bible files if the lane is ever activated. Never mix worlds in one prompt.

---

## Slicer Sketch (reserved; not invoked)

```python
# scripts/slice-sprite.py
# DORMANT. Not invoked during build or demo. Kept as a reference implementation
# for the client-side slicing step of the dormant pipeline.
from PIL import Image
import json
from pathlib import Path
import sys

def slice_grid(input_path: str, cols: int, rows: int, output_dir: str) -> None:
    img = Image.open(input_path)
    cw = img.width // cols
    ch = img.height // rows
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    manifest: list[dict] = []
    for r in range(rows):
        for c in range(cols):
            box = (c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)
            frame = img.crop(box)
            out = Path(output_dir) / f'frame_{r}_{c}.png'
            frame.save(out)
            manifest.append({'row': r, 'col': c, 'path': str(out)})
    with open(Path(output_dir) / 'manifest.json', 'w') as f:
        json.dump(manifest, f, indent=2)

if __name__ == '__main__':
    slice_grid(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4])
```

---

## Activation Checklist (requires V4 ferry plus ADR supersedence)

Do not tick any of the boxes below unless Ghaisan has explicitly approved activation.

- [ ] V4 ferry approval documented in `_meta/RV_PLAN.md` or successor plan file.
- [ ] New ADR authored at `docs/adr/ADR-activate-fal-nano-banana-2.md` that supersedes `ADR-override-antipattern-7.md`.
- [ ] Budget allocation assigned (Anthropic credit cannot cover fal.ai; a fresh funding source is required).
- [ ] `FAL_KEY` provisioned as a repo secret; never committed.
- [ ] `docs/contracts/game_asset_registry.contract.md` edited to flip entries from `dormant_deprecated` to `active`.
- [ ] `lib/falClient.ts` is imported from the successor asset-generation agent.
- [ ] `asset-ledger.jsonl` pipeline verified end-to-end with a single 1K test image before batch work.

---

## Anti-Patterns (applies on reactivation)

| Anti-Pattern | Why it breaks | What to do instead |
|---|---|---|
| Free-write style per subject | Style drift between NPCs | Hold the style-bible prefix verbatim; vary only `{{SUBJECT}}` |
| Generate 8 directions in 8 calls | Eight times cost, identity drift | One 2K 3x3 grid, slice client-side |
| Committing `FAL_KEY` to repo | Secret leak, abuse risk | Load from environment; never log the value |
| Uploading fal-hosted URLs to the repo | URLs are ephemeral | Download PNGs immediately; commit binaries or reference by content hash |
| Activating without ADR | Violates override anti-pattern 7 | Author a superseding ADR first |
| Mixing worlds in one batch | Style bible contamination | Separate runs per world |

---

## Related Skills

- `phaser-scene-authoring`: consumer of the sprites that would be generated here.
- `quest-json-schema` and `dialogue-tree-authoring`: reference NPCs that would become generated art.

---

## Reactivation Evidence Trail

Any activation ADR must reference:

- `_meta/RV_PLAN.md` RV.6 (anti-pattern 7 override allowing asset gen in principle)
- `_meta/RV_PLAN.md` RV.14 (budget constraint zeroing fal.ai spend for RV)
- `docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md` Section 9.4 (fal.ai budget zeroed)
- `docs/adr/ADR-override-antipattern-7.md` (the override itself, which this skill's dormancy status implements)

#!/usr/bin/env python3
"""
slice-sprite.py

DORMANT fal.ai Nano Banana 2 turnaround slicer.

Authored by: Talos (RV W1 Sub-Phase 1 carry-over completed in W2 Sub-Phase 2).
Status: NOT INVOKED anywhere in the shipping pipeline. See docs/adr/ADR-override-antipattern-7.md
        and _meta/RV_PLAN.md RV.14 for the full rationale.

This script is committed as reserved infrastructure for post-hackathon fal.ai reactivation.
The NERIUM RV shipped build ships with CC0 (Kenney plus OpenGameArt Warped City plus Oak Woods
brullov) plus Opus procedural SVG and Canvas gap-fill only. Zero fal.ai invocations are made
in any code path that reaches the shipped Phaser 3 runtime, the React HUD, the landing page,
or the leaderboard. Ghaisan personal fund USD 0 constraint makes this non-negotiable per RV.14.

Activation gate (POST-HACKATHON ONLY):
  1. Superseding ADR that rescinds ADR-override-antipattern-7 via a fresh CLAUDE.md entry.
  2. FAL_KEY environment variable set plus a live fal.ai credit balance.
  3. Explicit invocation from a fal.ai pipeline (e.g., a Calliope specialist workflow).
  4. Budget allocation documented in the superseding ADR.

Reference flow (matches the vibe-isometric-sprites pipeline reconstructed in M1 Section 2.2):
  1. fal.ai Nano Banana 2 returns a 3x3 turnaround grid on a single 1:1 canvas (e.g., 2048 px).
  2. Save to disk as hero_sheet_master.png.
  3. Run this script to slice into 8 directional frames plus a center spacer.
  4. Feed the sliced frames to scripts/pack-atlas.ts for Phaser atlas assembly.

Usage (post-activation):
  pip install pillow
  python scripts/slice-sprite.py \
      --input hero_sheet_master.png \
      --output-dir public/assets/procedural/apollo_hero/ \
      --grid 3x3 \
      --name apollo_hero

The script raises SystemExit with a DORMANT marker if run in the RV hackathon window.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

DORMANT_MARKER_ENV = 'NERIUM_FAL_REACTIVATED'
DORMANT_MESSAGE = (
    'scripts/slice-sprite.py is dormant in the RV shipped build. '
    'See docs/adr/ADR-override-antipattern-7.md and _meta/RV_PLAN.md RV.14. '
    'Activation requires a superseding ADR plus setting the env var NERIUM_FAL_REACTIVATED=1.'
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Slice a fal.ai Nano Banana 2 turnaround grid.')
    parser.add_argument('--input', type=Path, required=True, help='Path to the source master sheet PNG.')
    parser.add_argument('--output-dir', type=Path, required=True, help='Directory where sliced frames are written.')
    parser.add_argument('--grid', type=str, default='3x3', help='Grid dimensions, e.g. 3x3 or 4x4.')
    parser.add_argument('--name', type=str, required=True, help='Base name for sliced frames.')
    return parser.parse_args()


def guard_dormant() -> None:
    if os.environ.get(DORMANT_MARKER_ENV) != '1':
        print(DORMANT_MESSAGE, file=sys.stderr)
        raise SystemExit(2)


def main() -> int:
    guard_dormant()

    try:
        from PIL import Image
    except ImportError:
        print('Pillow not installed. Run `pip install pillow` before invoking this script.', file=sys.stderr)
        return 3

    args = parse_args()
    cols_str, rows_str = args.grid.lower().split('x')
    cols = int(cols_str)
    rows = int(rows_str)

    if not args.input.exists():
        print(f'Input PNG not found: {args.input}', file=sys.stderr)
        return 4

    args.output_dir.mkdir(parents=True, exist_ok=True)
    master = Image.open(args.input).convert('RGBA')
    tile_w = master.width // cols
    tile_h = master.height // rows

    directions = ['sw', 's', 'se', 'w', 'center', 'e', 'nw', 'n', 'ne']
    for idx in range(cols * rows):
        row = idx // cols
        col = idx % cols
        frame = master.crop((col * tile_w, row * tile_h, (col + 1) * tile_w, (row + 1) * tile_h))
        direction = directions[idx] if idx < len(directions) else f'frame{idx}'
        out = args.output_dir / f'{args.name}_{direction}.png'
        frame.save(out, format='PNG', optimize=True)
        print(f'wrote {out}')

    return 0


if __name__ == '__main__':
    raise SystemExit(main())

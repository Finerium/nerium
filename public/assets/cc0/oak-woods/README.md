# Oak Woods by brullov

Staging directory for the Oak Woods pixel-art pack by brullov. Used as the Medieval Desert accent source for the NERIUM RV build.

## Source

- **Author**: brullov
- **Canonical URL**: https://brullov.itch.io/oak-woods
- **License**: custom permissive. From the pack readme: "This asset pack can be used in free and commercial projects. You can modify it to suit your own needs. Credit is not necessary, but would be appreciated. You cannot redistribute it or resell it."

## Why this directory is empty in the committed repo

The Oak Woods pack lives behind an itch.io download page that does not expose a direct file URL suitable for unattended fetching. Talos Sub-Phase 2 respects the no-redistribution clause by leaving this directory empty in source control and documenting the canonical pull procedure instead. Anyone cloning this repo locally and wanting the Oak Woods accent sprites should follow the instructions below.

## Local pull procedure

```
open https://brullov.itch.io/oak-woods
# accept the itch.io download terms
# place Oak_Woods_v1.0.zip (or later) at this path and extract
cd public/assets/cc0/oak-woods
unzip Oak_Woods_v1.0.zip
```

After unzip, the `background`, `decorations`, `character`, and `props` directories become available to the atlas packer. Add a `LICENSE.txt` extract noting brullov plus a link back to the itch.io page. The `asset-ledger.jsonl` schema already accepts `brullov_oak_woods` as a source key, so appending a `pack_ingest` line after local extraction keeps downstream QA consistent.

## Attribution requirement

`public/assets/CREDITS.md` always lists brullov and the Oak Woods URL in the Medieval Desert section, irrespective of whether this directory is populated in a given clone. The credit is non-optional per NERIUM Talos halt-trigger spec (Strategic Hard Stop: skipping brullov attribution requires V4 ferry).

## Relationship to Sub-Phase 2 atlas packing

`scripts/pack-atlas.ts` reads from this directory when invoked and skips with a log line if empty. The shipped RV build uses Opus procedural Medieval Desert tiles as the primary Medieval source and treats Oak Woods as an optional accent layer when the clone has it locally staged.

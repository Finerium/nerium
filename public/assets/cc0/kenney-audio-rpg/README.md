# Kenney RPG Audio

Upstream Kenney CC0 audio pack for Euterpe (Howler.js integration, NERIUM RV sound layer).

## Source

- **Author**: Kenney (kenney.nl)
- **Pack URL**: https://kenney.nl/assets/rpg-audio
- **License**: CC0 1.0 Universal Public Domain Dedication (see `LICENSE.txt`)
- **Version pulled**: 2023-03-01 archive (`kenney_rpg-audio.zip`, Kenney hash `706161bc16-1677590336`)

## Committed files

All OGG Vorbis files from the original archive are committed (aggregate ~824 KB). This includes `bookClose`, `bookFlip1-3`, `bookOpen`, `bookPlace1-3`, `clothBelt`, `clothBelt2`, `cloth1-4`, `creak1-3`, `chop`, `doorClose_1-4`, `drawKnife1-3`, `footstep08-09`, `handleSmallLeather`, `metalClick`, `metalLatch`, `beltHandle1-2`, and a handful of companions. No MP3s, no WAVs.

## Usage

Consumed by Euterpe Session B via `src/audio/audioEngine.ts` Howler wrapper and mapped to quest triggers plus dialogue nodes per `euterpe.md` agent spec. Source key `kenney_audio_rpg_sfx` in `src/data/assets/asset_registry.ts`.

## Coverage gap

Ambient loops for the three worlds (Apollo Village, Cyberpunk Shanghai, Steampunk Victorian) are not included in this pack. Euterpe is expected to source ambient loops from OpenGameArt CC0 ambient packs or synthesize with Howler's oscillator primitives. That pull is Euterpe's responsibility, not Talos's.

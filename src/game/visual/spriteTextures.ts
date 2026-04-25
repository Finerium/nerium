//
// src/game/visual/spriteTextures.ts
//
// DEPRECATED in W3 S0 (legacy reference cleanup). This file ships the
// hand-placed pixel-rect character sprite texture approach from prior
// session SHA 1a8484b. The W3 visual revamp full restart pivot replaces
// this approach with AI-generated PNG character sprites from
// `_Reference/ai_generated_assets/characters/`. S1 will replace the
// consumer call sites (Player + NPC + TreasurerNPC + Caravan) with a
// `this.load.image()` preload of AI-asset PNGs flow, then rename this
// file to `spriteTextures.ts.deprecated` and drop the barrel export from
// `src/game/visual/index.ts`. Until then this file remains live to keep
// the build green and the active scenes rendering at their current SHA.
//
// Helios-v2 W3 CORRECTION origin (historical): hand-placed pixel-rect
// character sprite textures generated via
// Phaser.GameObjects.Graphics.generateTexture() at scene boot. Each
// character was a 12-16 px tall multi-row pixel grid (head, torso, arms,
// legs) distinguished by color tokens from the per-world palette so
// silhouettes read recognizably (Apollo cloak + halo, treasurer robe +
// scale icon, caravan vendor cart apron, cyberpunk synth vendor visor,
// etc.).
//
// Why generated textures were used (historical justification):
//   - The shipped CC0 atlas at /assets/worlds/medieval_desert/atlas_32.png
//     ships only 16 schematic 32x32 slots (floor, wall, generic agent_idle).
//     The agent_idle slot is a tiny generic robot which renders as
//     unrecognizable cone / square / pyramid in the Run #1 snapshot.
//   - Hand-placed pixel-rect sprites delivered a tier closer to the
//     Sea of Stars / Crosscode polish target where every character has a
//     distinct silhouette + accessory + walk-cycle hint.
//   - Generated once per scene boot, cached in Phaser.Textures by key,
//     then referenced by Player + NPC constructors via texture key swap
//     so existing object class behavior (proximity detection, interact,
//     y-sort) stays untouched.
//
// Each builder returns the cached texture key so the calling scene can
// pass it to Player / NPC constructors.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import * as Phaser from 'phaser';
import { MEDIEVAL_DESERT, CYBERPUNK_SHANGHAI, SHARED } from './palette';

/**
 * Internal helper: paint a list of [rx, ry, w, h, color] rectangles into a
 * Phaser.GameObjects.Graphics, then generate a texture from the bounding
 * box of the painted area. The returned texture key is cached so repeat
 * calls within the same scene reuse the existing texture.
 *
 * Uses fillStyle / fillRect rather than the Rectangle GameObject so the
 * generated sprite is a single texture (one draw call per sprite later in
 * the scene), not a Container of rect objects.
 */
function paintAndGenerateTexture(
  scene: Phaser.Scene,
  textureKey: string,
  width: number,
  height: number,
  rects: Array<[number, number, number, number, number]>,
): string {
  if (scene.textures.exists(textureKey)) return textureKey;
  const g = scene.add.graphics({ x: 0, y: 0 });
  for (const [rx, ry, w, h, color] of rects) {
    g.fillStyle(color, 1);
    g.fillRect(rx, ry, w, h);
  }
  g.generateTexture(textureKey, width, height);
  g.destroy();
  return textureKey;
}

/**
 * Render a sprite from rows + palette (multi-row pixel-grid pattern). Each
 * character cell of `rows[y]` maps to a 1x1 pixel using `palette[char]`.
 * `.` is transparent. Width = max row length; height = rows.length.
 *
 * Returns array of fillRect tuples ready to feed paintAndGenerateTexture.
 */
function spriteRowsToRects(
  rows: string[],
  palette: Record<string, number>,
): Array<[number, number, number, number, number]> {
  const out: Array<[number, number, number, number, number]> = [];
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    let runChar: string | null = null;
    let runStart = 0;
    for (let x = 0; x <= row.length; x++) {
      const ch = x < row.length ? row[x] : null;
      if (ch !== runChar) {
        if (runChar !== null && runChar !== '.') {
          const color = palette[runChar];
          if (color !== undefined) {
            out.push([runStart, y, x - runStart, 1, color]);
          }
        }
        runChar = ch;
        runStart = x;
      }
    }
  }
  return out;
}

// ============================================================================
// MEDIEVAL DESERT CHARACTER SPRITES
// ============================================================================

/**
 * Player character: sand-tunic adventurer with backpack, generic enough to
 * read in any world but tuned warm for Apollo Village. 14 px tall.
 */
export function buildPlayerTexture(scene: Phaser.Scene): string {
  const key = 'helios_player_default';
  const rows = [
    '...hhhh...',
    '..hssssh..',
    '..hsoosh..', // hair tuft + face
    '..hssssh..',
    '..hssssh..',
    '..ttttt...',
    '.tttttttt.',
    '.tbtttttb.',
    '.tttttttt.',
    '.bbttttbb.',
    '.bb...bb..',
    '.bb...bb..',
    '.kk...kk..',
    '.k.....k..',
  ];
  const palette: Record<string, number> = {
    h: MEDIEVAL_DESERT.plankDeep, // hair / outline
    s: MEDIEVAL_DESERT.skinPale, // skin
    o: MEDIEVAL_DESERT.plankDeep, // eye dot
    t: MEDIEVAL_DESERT.tentTerracotta, // tunic
    b: MEDIEVAL_DESERT.plankMid, // belt + pants
    k: MEDIEVAL_DESERT.plankDeep, // boots
  };
  const rects = spriteRowsToRects(rows, palette);
  return paintAndGenerateTexture(scene, key, 10, rows.length, rects);
}

/**
 * Apollo NPC: cloaked priest with golden halo + violet trim, central glyph.
 * Recognizable from afar so the player heads to him on scene entry.
 */
export function buildApolloTexture(scene: Phaser.Scene): string {
  const key = 'helios_npc_apollo';
  const rows = [
    '....gg....',
    '...gggg...',
    '..pppppp..',
    '..pccccp..',
    '..cwwwwc..',
    '..cwooowc',
    '..pwwwwp..',
    '..pcccpp..',
    '..pppppp..',
    '.pppppppp.',
    '.prrrrrrp.',
    'pprrgggrrp',
    'prrrrrrrrp',
    'prrrrrrrrp',
    '.pp....pp.',
    '.bb....bb.',
  ];
  const palette: Record<string, number> = {
    g: MEDIEVAL_DESERT.apolloGold, // halo
    p: MEDIEVAL_DESERT.canyonFar, // dark cloak outline
    c: MEDIEVAL_DESERT.clothPurple, // cloak mid
    r: 0x7a4a8a, // cloak highlight (purple lighter)
    w: MEDIEVAL_DESERT.skinPale, // face
    o: MEDIEVAL_DESERT.plankDeep, // eyes
    b: MEDIEVAL_DESERT.plankDeep, // boots
  };
  const rects = spriteRowsToRects(rows, palette);
  return paintAndGenerateTexture(scene, key, 10, rows.length, rects);
}

/**
 * Treasurer NPC: green ledger robe + amber scale + skullcap. The amber
 * scale icon catches the eye so the player can spot the trade district.
 */
export function buildTreasurerTexture(scene: Phaser.Scene): string {
  const key = 'helios_npc_treasurer';
  const rows = [
    '...kkkk...',
    '..kkkkkk..',
    '..kssssk..',
    '..ksoosk..',
    '..kssssk..',
    '..kkkkkk..',
    '..gggggg..',
    '.gggggggg.',
    'ggaaaaagg.',
    'gaaaaaagg.',
    '.gggggggg.',
    '.gg....gg.',
    '.bb....bb.',
    '.bb....bb.',
  ];
  const palette: Record<string, number> = {
    k: MEDIEVAL_DESERT.plankDeep, // skullcap + outline
    s: MEDIEVAL_DESERT.skinTan,
    o: MEDIEVAL_DESERT.plankDeep,
    g: 0x2a4838, // bottle green robe (treasurer ledger color)
    a: MEDIEVAL_DESERT.clothGold, // amber scale icon center
    b: MEDIEVAL_DESERT.plankDeep,
  };
  const rects = spriteRowsToRects(rows, palette);
  return paintAndGenerateTexture(scene, key, 10, rows.length, rects);
}

/**
 * Caravan vendor: brown apron + cart-style hat, holds a coin pouch. Used
 * in both ApolloVillage (initial) and CyberpunkShanghai (post-step-7
 * relocation) so the silhouette stays recognizable across worlds.
 */
export function buildCaravanVendorTexture(scene: Phaser.Scene): string {
  const key = 'helios_npc_caravan_vendor';
  const rows = [
    '..mmmmmm..',
    '.mmmmmmmm.',
    '..msssm...',
    '..msoosm..',
    '..mssssm..',
    '..mmmmmm..',
    '..nnnnnn..',
    '.nnaaaann.',
    'nnaaaaaann',
    'nnaaaaaann',
    '.nnaaaann.',
    '.nn....nn.',
    '.bb....bb.',
    '.bb....bb.',
  ];
  const palette: Record<string, number> = {
    m: MEDIEVAL_DESERT.tentTerracotta, // hat / outline
    s: MEDIEVAL_DESERT.skinPale,
    o: MEDIEVAL_DESERT.plankDeep,
    n: MEDIEVAL_DESERT.plankMid, // apron base
    a: MEDIEVAL_DESERT.clothGold, // coin pouch / brass pin
    b: MEDIEVAL_DESERT.plankDeep,
  };
  const rects = spriteRowsToRects(rows, palette);
  return paintAndGenerateTexture(scene, key, 10, rows.length, rects);
}

/**
 * Generic villager: simple 4-color blue tunic + brown belt, populates Apollo
 * Village ambient density per agent prompt scene matrix Session 2 (5-8
 * ambient NPCs).
 */
export function buildVillagerTexture(scene: Phaser.Scene, accent: 'blue' | 'olive' | 'rose' = 'blue'): string {
  const key = `helios_npc_villager_${accent}`;
  const rows = [
    '..hhhhhh..',
    '..hssssh..',
    '..hsoosh..',
    '..hssssh..',
    '..tttttt..',
    '.tttttttt.',
    '.tbtttttb.',
    '.tttttttt.',
    '.bbttttbb.',
    '.bb....bb.',
    '.kk....kk.',
  ];
  const tunic =
    accent === 'olive'
      ? MEDIEVAL_DESERT.tentOlive
      : accent === 'rose'
        ? 0xa04848
        : MEDIEVAL_DESERT.clothBlue;
  const palette: Record<string, number> = {
    h: MEDIEVAL_DESERT.plankDeep,
    s: MEDIEVAL_DESERT.skinPale,
    o: MEDIEVAL_DESERT.plankDeep,
    t: tunic,
    b: MEDIEVAL_DESERT.plankMid,
    k: MEDIEVAL_DESERT.plankDeep,
  };
  const rects = spriteRowsToRects(rows, palette);
  return paintAndGenerateTexture(scene, key, 10, rows.length, rects);
}

/**
 * Guard sprite: gray helm + spear, gates the courtyard.
 */
export function buildGuardTexture(scene: Phaser.Scene): string {
  const key = 'helios_npc_guard';
  const rows = [
    '..gggggg..',
    '..gggggg..',
    '..gssssg..',
    '..gsoosg..',
    '..gssssg..',
    '..cccccc..',
    '.cccccccc.',
    '.cciiiicc.',
    '.cccccccc.',
    '.bbcccbbb.',
    '.bb....bb.',
    '.kk....kk.',
  ];
  const palette: Record<string, number> = {
    g: 0x6a6a6a, // helmet gray
    s: MEDIEVAL_DESERT.skinTan,
    o: MEDIEVAL_DESERT.plankDeep,
    c: MEDIEVAL_DESERT.clothBlue, // tunic
    i: 0xa0a0a0, // chestplate gleam
    b: MEDIEVAL_DESERT.plankMid,
    k: MEDIEVAL_DESERT.plankDeep,
  };
  const rects = spriteRowsToRects(rows, palette);
  return paintAndGenerateTexture(scene, key, 10, rows.length, rects);
}

/**
 * Child villager: smaller silhouette running near firepit.
 */
export function buildChildTexture(scene: Phaser.Scene): string {
  const key = 'helios_npc_child';
  const rows = [
    '..hhhh..',
    '..hssh..',
    '..hooh..',
    '..hssh..',
    '..rrrr..',
    '.rrrrrr.',
    '.rrbbrr.',
    '.b....b.',
  ];
  const palette: Record<string, number> = {
    h: MEDIEVAL_DESERT.plankDeep,
    s: MEDIEVAL_DESERT.skinPale,
    o: MEDIEVAL_DESERT.plankDeep,
    r: 0xc26c40, // rust tunic
    b: MEDIEVAL_DESERT.plankDeep,
  };
  const rects = spriteRowsToRects(rows, palette);
  return paintAndGenerateTexture(scene, key, 8, rows.length, rects);
}

/**
 * Elder villager: white-haired with cane.
 */
export function buildElderTexture(scene: Phaser.Scene): string {
  const key = 'helios_npc_elder';
  const rows = [
    '..wwwwww..',
    '.wwwwwwww.',
    '.wwssssww.',
    '.wwsoosww.',
    '.wwssssww.',
    '.cccccccc.',
    'cccccccccc',
    'cccccccccc',
    '.cc....cc.',
    '.bb....bb.',
  ];
  const palette: Record<string, number> = {
    w: 0xd8d4c8, // white hair / bone
    s: MEDIEVAL_DESERT.skinTan,
    o: MEDIEVAL_DESERT.plankDeep,
    c: 0x6a4a3a, // brown robe
    b: MEDIEVAL_DESERT.plankDeep,
  };
  const rects = spriteRowsToRects(rows, palette);
  return paintAndGenerateTexture(scene, key, 10, rows.length, rects);
}

// ============================================================================
// CARAVAN ROAD CHARACTER SPRITES (re-uses MEDIEVAL_DESERT palette + cool tints)
// ============================================================================

/**
 * Traveler with hooded cloak + walking staff. Used 3x along the caravan road
 * for ambient density.
 */
export function buildTravelerTexture(
  scene: Phaser.Scene,
  variant: 'a' | 'b' | 'c' = 'a',
): string {
  const key = `helios_npc_traveler_${variant}`;
  const rows = [
    '..cccccc..',
    '.cccccccc.',
    '.cchhcc...',
    '.chsschc..',
    '.chsoochc.',
    '.chssschc.',
    '.cccccccc.',
    'cccccccccc',
    'ccaaaaaacc',
    'cccccccccc',
    '.bb....bb.',
    '.bb....bb.',
    '.kk....kk.',
  ];
  const cloakColor =
    variant === 'b'
      ? MEDIEVAL_DESERT.tentSand
      : variant === 'c'
        ? MEDIEVAL_DESERT.tentOlive
        : 0x4a2818;
  const palette: Record<string, number> = {
    c: cloakColor,
    h: MEDIEVAL_DESERT.skinTan,
    s: MEDIEVAL_DESERT.skinPale,
    o: MEDIEVAL_DESERT.plankDeep,
    a: MEDIEVAL_DESERT.clothGold, // sash
    b: MEDIEVAL_DESERT.plankMid,
    k: MEDIEVAL_DESERT.plankDeep,
  };
  const rects = spriteRowsToRects(rows, palette);
  return paintAndGenerateTexture(scene, key, 10, rows.length, rects);
}

// ============================================================================
// CYBERPUNK SHANGHAI CHARACTER SPRITES
// ============================================================================

/**
 * Synth vendor: trench coat + visor + neon armband. Cyber-tinted version of
 * the medieval vendor.
 */
export function buildSynthVendorTexture(scene: Phaser.Scene): string {
  const key = 'helios_npc_synth_vendor';
  const rows = [
    '..mmmmmm..',
    '..mvvvvm..', // visor band
    '..msssm...',
    '..msoosm..',
    '..mssssm..',
    '..mmmmmm..',
    '..nnnnnn..',
    'nnnnnnnnnn',
    'nncccccann',
    'nnccccccnn',
    '.nnaaaann.',
    '.nn....nn.',
    '.bb....bb.',
    '.kk....kk.',
  ];
  const palette: Record<string, number> = {
    m: CYBERPUNK_SHANGHAI.chromeBlack,
    v: CYBERPUNK_SHANGHAI.neonCyan, // visor
    s: CYBERPUNK_SHANGHAI.skinPale,
    o: CYBERPUNK_SHANGHAI.chromeBlack,
    n: CYBERPUNK_SHANGHAI.clothChrome, // trench coat outer
    c: CYBERPUNK_SHANGHAI.clothBlack, // shirt
    a: CYBERPUNK_SHANGHAI.neonMagenta, // armband
    b: CYBERPUNK_SHANGHAI.chromeBlack,
    k: CYBERPUNK_SHANGHAI.chromeBlack,
  };
  const rects = spriteRowsToRects(rows, palette);
  return paintAndGenerateTexture(scene, key, 10, rows.length, rects);
}

/**
 * Cyborg guard: chrome skull plate + crimson chest light, scarier silhouette.
 */
export function buildCyborgGuardTexture(scene: Phaser.Scene): string {
  const key = 'helios_npc_cyborg_guard';
  const rows = [
    '..gggggg..',
    '..gggggg..',
    '..gssssg..',
    '..gsoosg..',
    '..gssssg..',
    '..gggggg..',
    '..cccccc..',
    '.cccccccc.',
    '.ccciiccc.',
    '.cccccccc.',
    '.bbcccbbb.',
    '.bb....bb.',
    '.kk....kk.',
  ];
  const palette: Record<string, number> = {
    g: CYBERPUNK_SHANGHAI.chromeSteel,
    s: CYBERPUNK_SHANGHAI.skinDark,
    o: CYBERPUNK_SHANGHAI.neonCyan, // cybernetic eye glow
    c: CYBERPUNK_SHANGHAI.chromeBlack,
    i: CYBERPUNK_SHANGHAI.clothBlood, // chest LED
    b: CYBERPUNK_SHANGHAI.chromeRust,
    k: CYBERPUNK_SHANGHAI.chromeBlack,
  };
  const rects = spriteRowsToRects(rows, palette);
  return paintAndGenerateTexture(scene, key, 10, rows.length, rects);
}

/**
 * Street rat: hooded thief, magenta accent.
 */
export function buildStreetRatTexture(scene: Phaser.Scene): string {
  const key = 'helios_npc_street_rat';
  const rows = [
    '...hhhh...',
    '..hhhhhh..',
    '..hssssh..',
    '..hsoosh..',
    '..hhhhhh..',
    '.hhhhhhhh.',
    '.hhmmmmhh.',
    '.hhmmmmhh.',
    '.hhhhhhhh.',
    '.bb....bb.',
    '.kk....kk.',
  ];
  const palette: Record<string, number> = {
    h: CYBERPUNK_SHANGHAI.voidUp, // hood (deep purple)
    s: CYBERPUNK_SHANGHAI.skinPale,
    o: CYBERPUNK_SHANGHAI.neonMagenta, // glowing eye
    m: CYBERPUNK_SHANGHAI.neonMagenta, // utility belt LED
    b: CYBERPUNK_SHANGHAI.chromeBlack,
    k: CYBERPUNK_SHANGHAI.chromeBlack,
  };
  const rects = spriteRowsToRects(rows, palette);
  return paintAndGenerateTexture(scene, key, 10, rows.length, rects);
}

/**
 * Salaryman: white shirt + dark suit + briefcase silhouette hint.
 */
export function buildSalarymanTexture(scene: Phaser.Scene): string {
  const key = 'helios_npc_salaryman';
  const rows = [
    '..hhhhhh..',
    '..hhhhhh..',
    '..hssssh..',
    '..hsoosh..',
    '..hssssh..',
    '..wwwwww..',
    '.wwccccww.',
    '.wccrrccw.',
    '.wccccccw.',
    '.bb....bb.',
    '.bb....bb.',
    '.kk....kk.',
  ];
  const palette: Record<string, number> = {
    h: CYBERPUNK_SHANGHAI.chromeBlack,
    s: CYBERPUNK_SHANGHAI.skinTan,
    o: CYBERPUNK_SHANGHAI.chromeBlack,
    w: SHARED.bone, // white shirt collar (from SHARED palette)
    c: CYBERPUNK_SHANGHAI.clothBlack, // suit
    r: CYBERPUNK_SHANGHAI.clothBlood, // necktie accent
    b: CYBERPUNK_SHANGHAI.chromeBlack,
    k: CYBERPUNK_SHANGHAI.chromeBlack,
  };
  const rects = spriteRowsToRects(rows, palette);
  return paintAndGenerateTexture(scene, key, 10, rows.length, rects);
}

// ============================================================================
// SCENE-WIDE BOOTSTRAP
// ============================================================================

/**
 * Build every Apollo Village character texture in one call. Returns the map
 * of npcId -> textureKey so the scene can dispatch into Player + NPC
 * constructors.
 */
export interface ApolloSpriteKeys {
  player: string;
  apollo: string;
  treasurer: string;
  caravanVendor: string;
  guard: string;
  child: string;
  elder: string;
  villagerBlue: string;
  villagerOlive: string;
  villagerRose: string;
}

export function buildApolloVillageSprites(scene: Phaser.Scene): ApolloSpriteKeys {
  return {
    player: buildPlayerTexture(scene),
    apollo: buildApolloTexture(scene),
    treasurer: buildTreasurerTexture(scene),
    caravanVendor: buildCaravanVendorTexture(scene),
    guard: buildGuardTexture(scene),
    child: buildChildTexture(scene),
    elder: buildElderTexture(scene),
    villagerBlue: buildVillagerTexture(scene, 'blue'),
    villagerOlive: buildVillagerTexture(scene, 'olive'),
    villagerRose: buildVillagerTexture(scene, 'rose'),
  };
}

export interface CaravanRoadSpriteKeys {
  player: string;
  travelerA: string;
  travelerB: string;
  travelerC: string;
}

export function buildCaravanRoadSprites(scene: Phaser.Scene): CaravanRoadSpriteKeys {
  return {
    player: buildPlayerTexture(scene),
    travelerA: buildTravelerTexture(scene, 'a'),
    travelerB: buildTravelerTexture(scene, 'b'),
    travelerC: buildTravelerTexture(scene, 'c'),
  };
}

export interface CyberpunkShanghaiSpriteKeys {
  player: string;
  caravanVendor: string;
  synthVendor: string;
  cyborgGuard: string;
  streetRat: string;
  salaryman: string;
}

export function buildCyberpunkShanghaiSprites(
  scene: Phaser.Scene,
): CyberpunkShanghaiSpriteKeys {
  return {
    player: buildPlayerTexture(scene),
    caravanVendor: buildCaravanVendorTexture(scene),
    synthVendor: buildSynthVendorTexture(scene),
    cyborgGuard: buildCyborgGuardTexture(scene),
    streetRat: buildStreetRatTexture(scene),
    salaryman: buildSalarymanTexture(scene),
  };
}

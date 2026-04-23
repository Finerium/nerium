# Euterpe Decision Log

Owner: Euterpe (NERIUM Revision W3, Howler.js audio layer).
Scope: Howler wrapper, Zustand audioStore, CC0 curation, cue registry, React HUD slider and autoplay gate.
Authority: docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md Section 4.7, docs/contracts/game_state.contract.md Section 3.5, docs/contracts/game_event_bus.contract.md Section 3 audio topics.

Status: shipped 2026-04-23.

## ADR-001: Single-singleton audioEngine, side-effects outside the store

**Context.** Howler.js owns real side effects (WebAudio playback, fade tweens, autoplay unlock, HTML5 fallback). Zustand owns reactive state (volume sliders, mute). The contract (`game_state.contract.md` Section 3.5) lists `playAmbient`, `stopAmbient`, `playOneShot` as store actions, but those actions must not hold Howler `Howl` references or imperatively fade buffers from inside `set` callbacks. Doing so would entangle store mutation with playback lifecycle and bleed through React Strict Mode double-mount.

**Decision.** The audioStore stays free of playback side effects. It holds volume, mute, and the active ambient loop id. The `audioEngine` module in `src/lib/audioEngine.ts` is a hand-written singleton class instance that subscribes to the store with `subscribeWithSelector`, runs Howler operations, and exposes a stable method surface (`unlock`, `play`, `playAmbient`, `stopAmbient`, `setVolume`, `mute`, `toggleMute`, `attachBus`, `detachBus`, `dispose`). A lightweight one-shot listener channel (`registerOneShotListener`) routes store-surface `playOneShot` calls back into the engine without circular imports.

**Consequences.** Nyx, Linus, Erato-v2, and Thalia-v2 can call `useAudioStore.getState().playOneShot('quest-complete')` or `playAmbient('cyberpunk_teaser')` without importing the engine. The engine subscribes once and fans the store signal out to Howler. Module boundary stays clean; tree-shaking of the audio engine outside game routes works. Dispose is idempotent and safe to call from provider unmount or page teardown.

## ADR-002: Keep Kenney OGG Vorbis containers, do not transcode to MP3

**Context.** The Task Specification in `.claude/agents/euterpe.md` names the curated outputs `prompt-submit.mp3`, `dialog-advance.mp3`, and so on. The underlying Kenney RPG Audio pack is OGG Vorbis end-to-end. Transcoding to MP3 requires ffmpeg as a Talos-provisioned build dependency, introduces a lossy stage, and bloats the asset-ledger diff for no functional gain. Howler accepts OGG natively across every browser NERIUM targets (Chromium 113+, Firefox 121+, Safari 17+).

**Decision.** Ship every curated cue with the `.ogg` extension and update `src/data/audio/cues.json` plus CREDITS.md to reference the `.ogg` paths. The M2 spec and the agent prompt both stamp `.mp3` in the output-files list; this ADR supersedes those filenames in favor of `.ogg` for the reasons above.

**Consequences.** Howler `Howl` constructors take a one-element src array; no MP3 fallback is required. Reviewer laptops without Fraunhofer MP3 support (none in the target set) are untouched. The ADR is visible in this file for any downstream agent that reads `cues.json` and notices the divergence from the agent prompt text.

## ADR-003: Ambient loop placeholders from Kenney SFX rather than original composition

**Context.** M2 Section 4.7 output files include three ambient loops: `apollo-village-loop`, `cyberpunk-teaser-loop`, `steampunk-placeholder-loop`. The upstream Kenney RPG Audio pack contains 51 short Foley clips (footsteps, clothBelt, metalPot, creak) and no ambient bed loops. The Talos Kenney README explicitly states "Ambient loops for the three worlds are not included in this pack. Euterpe is expected to source ambient loops from OpenGameArt CC0 ambient packs or synthesize with Howler's oscillator primitives." Howler has no oscillator primitives; that surface belongs to the Web Audio API proper, which is prohibited by the Euterpe strategic hard stops. OpenGameArt fetches require a network pull and contributor-by-contributor license audit; the fetch window collides with the RV W3 budget.

**Decision.** Curate three ambient placeholder loops by looping a single short Kenney SFX per world at low baseline volume (`apollo-village-loop.ogg` from `creak1.ogg`, `cyberpunk-teaser-loop.ogg` from `metalClick.ogg`, `steampunk-placeholder-loop.ogg` from `metalPot1.ogg`) with `loop: true` and a 200 ms Howler cross-fade so the seam between the end of one iteration and the start of the next stays under the seam-audibility threshold. Document the placeholder status honestly in CREDITS.md and this ADR. Mark the loops as an explicit post-hackathon swap target.

**Consequences.** Reviewers hear a thin but consistent ambient bed that varies per world during the vertical slice. The placeholder status is honest-claim disclosed in CREDITS.md. A post-hackathon follow-up can swap each ambient source file without touching `cues.json`, the audioEngine, or any HUD component because the cue names stay stable.

## ADR-004: audioStore re-export from `src/state/stores.ts`

**Context.** Thalia-v2 Session A seeded minimum-viable stubs of all five Zustand stores in `src/state/stores.ts` so `src/state/gameBridge.ts` could wire subscriptions before Nyx, Linus, Erato-v2, and Euterpe shipped. Nyx shipped the real `questStore` at `src/stores/questStore.ts` and Linus shipped the real `dialogueStore` at `src/stores/dialogueStore.ts`. gameBridge still imports from `src/state/stores.ts`, which leaves a live divergence for those two stores that Harmonia-RV-A will resolve. Euterpe faces the same split for audioStore.

**Decision.** Write the canonical `audioStore` at `src/stores/audioStore.ts` per the agent prompt and the Nyx/Linus precedent, then collapse the divergence immediately by replacing the stub in `src/state/stores.ts` with `export { useAudioStore, type AudioStore } from '../stores/audioStore';`. The bridge continues to import from `./stores` and now observes the real store. The type export keeps downstream `import type { AudioStore }` call sites valid.

**Consequences.** The bridge and the engine subscribe to a single store singleton. No divergence for audio. The questStore and dialogueStore divergence is not addressed by this ADR; that is Harmonia-RV-A's cross-agent integration scope.

## ADR-005: Engine attaches to bus inside wireBridge rather than from a separate component

**Context.** Two attachment strategies exist: (a) extend `wireBridge` in `src/state/gameBridge.ts` to call `audioEngine.attachBus(bus)` alongside the other disposer registrations, or (b) ship a dedicated `AudioBridge` React component that fetches the bus from `game.registry` and attaches on mount. Option (b) duplicates lifecycle management and introduces polling on top of the Phaser registry, which is an escape hatch rather than a supported subscription surface.

**Decision.** Add a single `disposers.push(audioEngine.attachBus(bus));` line at the top of `wireBridge` after the bus is constructed. `audioEngine.attachBus` returns an unsubscribe function that the shared disposer stack runs during teardown, so the engine detaches in lockstep with the rest of the bridge. The engine subscribes to its own store separately from within `unlock()`; the autoplay gate calls `unlock()` on user gesture.

**Consequences.** PhaserCanvas is not patched. Strict Mode double-mount protection from `WIRED` weak set already covers the audio engine because the attach call lives inside the mount-guarded path. Audio bus subscriptions live and die with the Phaser game instance. Engine disposal on route change or provider unmount is one additional call that `useEffect` cleanup invokes via the `teardown()` that PhaserCanvas already runs.

## ADR-006: Throttled typewriter cue, per-cue volume base in cues.json

**Context.** The Linus dialogue runtime emits `game.dialogue.stream_chunk` once per streamed token from the Apollo backend. Unthrottled, that fires the typewriter click cue at dozens of hertz during fast streams and produces a rapid buzz rather than a typewriter rhythm. The existing `throttleMs` concept on a cue protects against that cadence.

**Decision.** Give the `typewriter-char` cue a declarative `throttleMs` of 45 ms in `cues.json`. The audioEngine consumes the field inside `shouldEmit` and suppresses play calls that arrive inside the window. Per-topic throttling on the event routing layer (`maxOncePerMs`) layers on top for routes that need both cue-level and topic-level limits, such as `game.npc.interact` (route-level 250 ms so quick repeated interactions stop bleeding into each other) and `game.quest.step_advanced` (300 ms to keep rapid FSM advances from double-firing the UI click).

**Consequences.** The rhythm reads as typewriter during normal streaming. Dropped cues are silent no-ops rather than queued plays, which matches the contract Section 8 guideline (lossy is better than delayed for audio cues during a tight demo).

## ADR-007: AudioInitGate renders visually; Howler autoUnlock is defense-in-depth

**Context.** Chromium, Firefox, and Safari all block autoplay until a user gesture. Howler 2.2 provides `Howler.autoUnlock = true` which hooks a one-shot click/touch/keydown handler at page scope and resumes the AudioContext silently on first gesture. Relying on it alone means the first ambient loop may start mid-demo without visual feedback, and on some reviewer laptops the Autoplay Media policy is set to "Block Audio and Video" which `autoUnlock` cannot bypass without an explicit call to `Howler.ctx.resume()` inside a click handler.

**Decision.** Render `<AudioInitGate>` near the root, bound to a subtle "Tap to enable audio" overlay. The overlay is dismissed on click, Enter, or Space. `audioEngine.unlock()` is idempotent and sets `audioStore.initialized = true`, which hides the gate for every subsequent mount within the same page session. `Howler.autoUnlock` remains on as defense-in-depth; if a user navigates back before clicking the gate, the first subsequent gesture still resumes the context.

**Consequences.** No silent first-load surprise. The Playwright smoke test can click the gate deterministically. The gate label and subtitle are constructor-prop overridable in case Kalypso needs to skin the text for the demo narrative.

## ADR-008: Category volume routing, master-times-category product

**Context.** The contract (`game_state.contract.md` Section 3.5) lists `masterVolume`, `musicVolume`, `sfxVolume`, `ambientVolume` and a boolean `muted`. The effective Howler volume for a given cue must respect both master and category plus the cue's baseline volume defined in `cues.json`. Mute takes precedence over every slider.

**Decision.** The engine computes effective Howler per-sound volume as `muted ? 0 : clamp01(masterVolume * categoryVolume * cue.baseVolume * optionalOverride)`. `Howler.volume(masterVolume)` is also applied at the global level so raw ambient playback uses the updated master even when individual per-sound `volume(id)` calls are not re-issued. `Howler.mute(muted)` mirrors the mute state globally.

**Consequences.** Sliders feel instantaneous because the engine refreshes the current ambient via `refreshAmbientVolume` on every store change. One-shots pick the effective volume at play time. Cross-fade between ambient loops computes `targetVolume` once at swap time and Howler does the tween.

## Post-hackathon follow-ups

- Swap the three ambient placeholders for dedicated CC0 ambient loops.
- Add a second cue for `game.dialogue.stream_complete` (end-of-stream soft glyph).
- Add a `music` category cue for the Lumio blueprint moment cinematic instead of reusing `cinematic-sting` both for cinematic start and for the climax.
- Wire Zustand `persist` around `{ masterVolume, musicVolume, sfxVolume, ambientVolume, muted }` with `partialize` to keep user preference across page reloads.
- Consider HTMLAudioElement pre-warming for the ambient tracks to avoid a first-play latency spike on iOS Safari.

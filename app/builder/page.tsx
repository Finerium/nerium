'use client';
//
// app/builder/page.tsx
//
// T7 follow-up (2026-04-26). Builder route layout restructure.
//
// PRIOR STATE (T7 ship f0cd19c): pixel-art workshop background loaded but
// LumioReplay tabular UI rendered always-on top, occluding the parchment
// frame ornamentation. Vendor showcase + tier gates + world switcher all
// crammed below as flat sections.
//
// NEW LAYOUT: pixel-art workshop is the primary visual surface. The
// agent_structure_graph_bg parchment scroll is the hero panel containing
// the title + tagline + a single primary CTA pointing to the canonical
// in-game surface at /play. The 8-vendor brass medallion lineup renders
// in a 4x2 grid below. World switcher + tier gates + model selection
// launcher render as compact sections. The Lumio cached bake replay +
// Blueprint Moment reveal are TOGGLEABLE via a "View cached Lumio bake"
// button that opens an ESC-closeable modal overlay; this gives the
// pixel-art workshop the screen real estate while preserving access to
// the Day-3 actual Anthropic API run for judges who want to inspect it.
//
// PRESERVED VERBATIM (T6 + Wave A T3 + Phase 1.5 territory): LumioReplay
// component logic, BlueprintReveal component logic, ModelSelectionModal,
// ApiKeyModal, TheatricalSpawnAnimation. WorldSwitcher + BuilderTierGate
// preserved with prop-only consumption.
//

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { LumioReplay } from './lumio/LumioReplay';
import { BlueprintReveal } from './moment/BlueprintReveal';
import { WorldSwitcher } from './worlds/WorldSwitcher';
import blueprintFixture from './moment/fixtures/blueprint_lumio_2026_04_25.json';
import type { BlueprintMomentDefinition } from './moment/types';
import { HarnessShell } from '../_harness/HarnessShell';
import { BuilderTierGate } from '../../src/components/builder/BuilderTierGate';
import {
  ModelSelectionModal,
  T7BuilderPixelShell,
  T7VendorBadge,
  T7_VENDOR_IDS,
  useBuilderModelSelectionStore,
} from '../../src/components/builder';
import type { SekuriComplexity } from '../../src/lib/sekuriTemplate';

export default function BuilderPage() {
  const definition = useMemo<BlueprintMomentDefinition>(
    () => blueprintFixture as unknown as BlueprintMomentDefinition,
    [],
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [showCachedBake, setShowCachedBake] = useState<boolean>(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const showButtonRef = useRef<HTMLButtonElement | null>(null);

  const handleOpenCachedBake = useCallback(() => {
    setShowCachedBake(true);
  }, []);

  const handleCloseCachedBake = useCallback(() => {
    setShowCachedBake(false);
  }, []);

  // ESC closes the cached bake modal, click-on-backdrop also closes it,
  // focus traps to the close button on open and returns to the trigger
  // button on close so keyboard users do not lose their place.
  useEffect(() => {
    if (!showCachedBake) {
      showButtonRef.current?.focus();
      return;
    }
    closeButtonRef.current?.focus();
    const onKey = (evt: KeyboardEvent) => {
      if (evt.key === 'Escape') {
        evt.preventDefault();
        setShowCachedBake(false);
      }
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [showCachedBake]);

  const handleBackdropClick = useCallback(
    (evt: React.MouseEvent<HTMLDivElement>) => {
      if (evt.target === evt.currentTarget) {
        setShowCachedBake(false);
      }
    },
    [],
  );

  return (
    <HarnessShell
      heading="Builder"
      sub="Hero pillar. Pixel-art workshop primary view. Cached Lumio bake replay is toggleable below. Blueprint Moment reveals the 22-agent pipeline transparently inside the cached bake modal."
    >
      <T7BuilderPixelShell
        bannerExtra={
          <>
            Builder shows the agent structure flow, the 8 vendor multi-vendor
            showcase, and the cached Lumio bake replay (actual Anthropic API
            run from Day 3 development costing $17.50).
          </>
        }
      >
        <section
          className="t7-builder-hero-parchment"
          aria-labelledby="t7-builder-hero-title"
        >
          <div className="t7-builder-hero-eyebrow">
            Apollo blacksmith forge, after dark
          </div>
          <h1 id="t7-builder-hero-title" className="t7-builder-hero-title">
            Builder Workshop
          </h1>
          <p className="t7-builder-hero-tagline">
            Type one sentence. Watch 14 specialist agents build your project.
          </p>
          <p className="t7-builder-hero-blurb">
            Builder is a theatrical demo, not a live-execution surface. It
            stages the agent orchestration that NERIUM Builder will run in
            production. Use the in-game world for the canonical experience and
            toggle the cached bake below to inspect the actual Anthropic API
            run from Day 3 development.
          </p>
          <div className="t7-builder-hero-cta-row">
            <Link
              href="/play"
              prefetch={false}
              className="t7-builder-hero-cta"
              data-testid="t7-builder-cta-play"
            >
              Try it in-game
              <span className="t7-builder-hero-cta-arrow" aria-hidden="true">
                {'->'}
              </span>
            </Link>
          </div>
        </section>

        <section
          className="t7-builder-section"
          aria-labelledby="t7-builder-vendor-grid-title"
        >
          <h2
            id="t7-builder-vendor-grid-title"
            className="t7-section-title"
          >
            Multi-vendor lineup
          </h2>
          <p className="t7-section-meta">
            Eight brass medallion vendors. Anthropic and Google badges are
            hand-crafted. The remaining six tint the brass medallion base for
            time discipline. Live runtime stays Anthropic-only at hackathon
            submission; the multi-vendor surface activates post-hackathon.
          </p>
          <div
            className="t7-builder-vendor-grid"
            role="list"
            aria-label="Vendor lineup"
          >
            {T7_VENDOR_IDS.map((vendor) => (
              <div
                key={vendor}
                className="t7-builder-vendor-grid-item"
                role="listitem"
                tabIndex={0}
                aria-label={`Vendor ${vendor}`}
              >
                <T7VendorBadge vendor={vendor} size="md" />
                <span className="t7-vendor-grid-label">{vendor}</span>
              </div>
            ))}
          </div>
          <ModelSelectionLauncher />
          <ModelSelectionModal />
        </section>

        <section
          className="t7-builder-section"
          data-compact="true"
          aria-labelledby="t7-builder-tier-gates-title"
        >
          <h2 id="t7-builder-tier-gates-title" className="t7-section-title">
            Tier gates
          </h2>
          <p className="t7-section-meta">
            Multi-vendor orchestration and priority routing unlock at higher
            tiers. The Treasurer NPC inside /play handles upgrades.
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <BuilderTierGate
              feature="Guided mode"
              requiredTier="team"
              description="Multi-vendor model orchestration with team review."
            />
            <BuilderTierGate
              feature="Express mode"
              requiredTier="pro"
              description="Single prompt to production with priority routing."
            />
          </div>
        </section>

        <section
          className="t7-builder-section"
          data-compact="true"
          aria-labelledby="t7-builder-world-aesthetic-title"
        >
          <h2
            id="t7-builder-world-aesthetic-title"
            className="t7-section-title"
          >
            World aesthetic
          </h2>
          <p className="t7-section-meta">
            Three forge moods, one shared blueprint.
          </p>
          <WorldSwitcher session_id="session_demo_builder" />
        </section>

        <section
          className="t7-builder-section"
          aria-labelledby="t7-builder-cached-bake-title"
        >
          <h2
            id="t7-builder-cached-bake-title"
            className="t7-section-title"
          >
            Cached Lumio bake
          </h2>
          <p className="t7-section-meta">
            Dionysus produced cache/lumio_run_2026_04_24.json on Day 3 from a
            real Anthropic API run costing $17.50. Open the modal to replay
            the 11-step pipeline and view the 22-agent Blueprint Moment.
          </p>
          <button
            type="button"
            ref={showButtonRef}
            onClick={handleOpenCachedBake}
            className="t7-show-cached-bake-btn"
            data-testid="t7-show-cached-bake"
            aria-haspopup="dialog"
            aria-expanded={showCachedBake}
          >
            <span>View cached Lumio bake</span>
            <span className="t7-show-cached-bake-btn-meta">
              Day 3 actual run
            </span>
          </button>
        </section>

        {showCachedBake ? (
          <div
            className="t7-cached-bake-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="t7-cached-bake-modal-title"
            onClick={handleBackdropClick}
            data-testid="t7-cached-bake-modal-root"
          >
            <div className="t7-cached-bake-modal">
              <button
                type="button"
                ref={closeButtonRef}
                onClick={handleCloseCachedBake}
                className="t7-cached-bake-modal-close"
                data-testid="t7-cached-bake-close"
                aria-label="Close cached Lumio bake modal"
              >
                Close
              </button>
              <h2
                id="t7-cached-bake-modal-title"
                className="t7-cached-bake-modal-title"
              >
                Cached Lumio bake
              </h2>
              <p className="t7-cached-bake-modal-meta">
                Replays the Day-3 cached pipeline trace. Persistent badge on
                the player reads "Replaying cached Day-3 bake, not live" per
                Dionysus honest-claim contract.
              </p>

              <section className="t7-cached-bake-modal-section">
                <div className="t7-builder-spawn-terminal">
                  <LumioReplay autoStart={false} />
                </div>
              </section>

              <section className="t7-cached-bake-modal-section">
                <h3 className="t7-section-title">Blueprint Moment</h3>
                <p className="t7-section-meta">
                  Urania 40-second transparency reveal. 22-agent pipeline with
                  the Heracles MA highlight. Toggle play to pause the
                  narration loop.
                </p>
                <button
                  type="button"
                  onClick={() => setIsPlaying((p) => !p)}
                  className="t7-builder-button"
                  style={{ marginBottom: '14px' }}
                >
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
                <div className="t7-builder-structure-graph">
                  <BlueprintReveal
                    definition={definition}
                    pipeline_run_id="run_demo_blueprint"
                    onComplete={() => {
                      /* demo: loop handled externally */
                    }}
                    isPlaying={isPlaying}
                  />
                </div>
              </section>
            </div>
          </div>
        ) : null}
      </T7BuilderPixelShell>
    </HarnessShell>
  );
}

function ModelSelectionLauncher() {
  const openModal = useBuilderModelSelectionStore((s) => s.openModal);
  const [tier, setTier] = useState<SekuriComplexity>('large');

  return (
    <div
      data-testid="model-selection-launcher"
      style={{ marginTop: '14px' }}
    >
      <div
        style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <label
          htmlFor="model-selection-tier"
          style={{
            fontSize: '12px',
            color: 'oklch(0.72 0.02 250)',
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          Tier
        </label>
        <select
          id="model-selection-tier"
          data-testid="model-selection-tier-select"
          value={tier}
          onChange={(evt) => setTier(evt.target.value as SekuriComplexity)}
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
        <button
          type="button"
          onClick={() => openModal(tier)}
          data-testid="model-selection-open"
          className="t7-builder-button"
          data-primary="true"
        >
          Open model selection
        </button>
      </div>
    </div>
  );
}

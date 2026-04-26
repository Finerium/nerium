'use client';
//
// app/builder/page.tsx
//
// Nemea Phase 5 QA emergency harness (2026-04-22). Renders the Builder
// hero: WorldSwitcher, Dionysus Lumio cached replay, and Urania Blueprint
// Moment reveal. PipelineCanvas is embedded via BlueprintReveal's default
// 22-node snapshot; a standalone PipelineCanvas render is deferred because
// it expects an event-bus-backed pipeline store that is provisioned in the
// Apollo mount layer (post-harness scope).
//
// T7 pixel-art skin layered 2026-04-26. The body is wrapped in
// T7BuilderPixelShell so the Builder web companion route inherits the
// Apollo Village night-themed workshop interior aesthetic shipped by
// Helios-v2 in /play. Section chrome re-skinned via .t7-builder-section.
// Wave A T3 ModelSelectionModal + Phase 1.5 BYOK ApiKeyModal +
// TheatricalSpawnAnimation are NOT modified per T7 anti-collision
// discipline; they render unmodified inside the new chrome.
//

import { useMemo, useState } from 'react';
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

  return (
    <HarnessShell
      heading="Builder"
      sub="Hero pillar. World switcher re-themes every surface, Lumio replays the cached Day-3 bake, Blueprint Moment reveals the 22-agent pipeline transparently."
    >
      <T7BuilderPixelShell
        eyebrow="Apollo blacksmith forge, after dark"
        heading="Builder"
        tagline="Hero pillar. World switcher re-themes every surface. Lumio replays the cached Day-3 bake. Blueprint Moment reveals the 22-agent pipeline transparently."
      >
        <section className="t7-builder-section">
          <h2 className="t7-section-title">World aesthetic</h2>
          <p className="t7-section-meta">
            Three forge moods, one shared blueprint. Cyberpunk Shanghai is the
            current default. Steampunk Victorian and Medieval Desert are the
            sibling palettes that re-theme every Builder surface in lockstep.
          </p>
          <WorldSwitcher session_id="session_demo_builder" />
        </section>

        <section className="t7-builder-section">
          <h2 className="t7-section-title">Tier gates</h2>
          <p className="t7-section-meta">
            Multi-vendor orchestration and priority routing unlock at higher
            tiers. The Treasurer NPC inside /play handles upgrades with a one
            tap subscription flow.
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

        <section className="t7-builder-section">
          <h2 className="t7-section-title">Model selection (multi-vendor preview)</h2>
          <p className="t7-section-meta">
            Builder surfaces a vendor lineup picker after Sekuri classifies
            complexity. Live runtime stays Anthropic-only at submission. The
            vendor badges below show the brass medallion lineup. Anthropic and
            Google badges are hand-crafted; the remaining six tint the brass
            medallion base for time discipline.
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '14px',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            {T7_VENDOR_IDS.map((vendor) => (
              <div
                key={vendor}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <T7VendorBadge vendor={vendor} size="md" />
                <span
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '11px',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'oklch(0.72 0.02 250)',
                  }}
                >
                  {vendor}
                </span>
              </div>
            ))}
          </div>
          <ModelSelectionLauncher />
          <ModelSelectionModal />
        </section>

        <section className="t7-builder-section">
          <h2 className="t7-section-title">Lumio cached replay</h2>
          <p className="t7-section-meta">
            Dionysus bake produced cache/lumio_run_2026_04_24.json on Day 3.
            Press Play to replay the 11-step Builder pipeline deterministically.
          </p>
          <div className="t7-builder-spawn-terminal">
            <LumioReplay autoStart={false} />
          </div>
        </section>

        <section className="t7-builder-section">
          <h2 className="t7-section-title">Blueprint Moment</h2>
          <p className="t7-section-meta">
            Urania 40-second transparency reveal. 22-agent pipeline with the
            Heracles MA highlight. Toggle play to pause the narration loop.
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
      </T7BuilderPixelShell>
    </HarnessShell>
  );
}

function ModelSelectionLauncher() {
  const openModal = useBuilderModelSelectionStore((s) => s.openModal);
  const [tier, setTier] = useState<SekuriComplexity>('large');

  return (
    <div data-testid="model-selection-launcher">
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

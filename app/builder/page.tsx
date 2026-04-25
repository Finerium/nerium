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
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.15rem' }}>
          World aesthetic
        </h2>
        <WorldSwitcher session_id="session_demo_builder" />
      </section>

      <section
        style={{
          marginBottom: '2rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
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
      </section>

      <ModelSelectionLauncher />
      <ModelSelectionModal />

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.15rem' }}>
          Lumio cached replay
        </h2>
        <p
          style={{
            margin: '0 0 1rem 0',
            fontSize: '0.85rem',
            color: 'var(--color-muted, #94a3c4)',
          }}
        >
          Dionysus bake produced cache/lumio_run_2026_04_24.json on Day 3.
          Press Play to replay the 11-step Builder pipeline deterministically.
        </p>
        <LumioReplay autoStart={false} />
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.15rem' }}>
          Blueprint Moment
        </h2>
        <p
          style={{
            margin: '0 0 1rem 0',
            fontSize: '0.85rem',
            color: 'var(--color-muted, #94a3c4)',
          }}
        >
          Urania 40-second transparency reveal. 22-agent pipeline with the
          Heracles MA highlight. Toggle play to pause the narration loop.
        </p>
        <button
          type="button"
          onClick={() => setIsPlaying((p) => !p)}
          style={{
            padding: '0.35rem 0.9rem',
            marginBottom: '1rem',
            fontSize: '0.85rem',
            borderRadius: 'var(--radius-md, 0.375rem)',
            border:
              '1px solid color-mix(in oklch, var(--color-border, #24244c) 80%, transparent)',
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
          }}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <BlueprintReveal
          definition={definition}
          pipeline_run_id="run_demo_blueprint"
          onComplete={() => {
            /* demo: loop handled externally */
          }}
          isPlaying={isPlaying}
        />
      </section>
    </HarnessShell>
  );
}

function ModelSelectionLauncher() {
  const openModal = useBuilderModelSelectionStore((s) => s.openModal);
  const [tier, setTier] = useState<SekuriComplexity>('large');

  return (
    <section
      style={{ marginBottom: '2rem' }}
      data-testid="model-selection-launcher"
    >
      <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.15rem' }}>
        Model selection (multi-vendor preview)
      </h2>
      <p
        style={{
          margin: '0 0 0.75rem 0',
          fontSize: '0.85rem',
          color: 'var(--color-muted, #94a3c4)',
        }}
      >
        Builder surfaces a vendor lineup picker after Sekuri classifies
        complexity. Live runtime stays Anthropic-only at submission.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <label
          htmlFor="model-selection-tier"
          style={{ fontSize: '0.8rem', color: 'var(--color-muted, #94a3c4)' }}
        >
          Tier
        </label>
        <select
          id="model-selection-tier"
          data-testid="model-selection-tier-select"
          value={tier}
          onChange={(evt) => setTier(evt.target.value as SekuriComplexity)}
          style={{
            padding: '0.35rem 0.55rem',
            fontSize: '0.85rem',
            borderRadius: 'var(--radius-md, 0.375rem)',
            background: 'transparent',
            color: 'inherit',
            border: '1px solid var(--color-border, #24244c)',
          }}
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
        <button
          type="button"
          onClick={() => openModal(tier)}
          data-testid="model-selection-open"
          style={{
            padding: '0.4rem 1rem',
            fontSize: '0.85rem',
            borderRadius: 'var(--radius-md, 0.375rem)',
            background: 'oklch(0.88 0.15 140)',
            color: 'oklch(0.14 0.012 250)',
            border: '1px solid oklch(0.88 0.15 140)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Open model selection
        </button>
      </div>
    </section>
  );
}

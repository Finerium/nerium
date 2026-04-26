'use client';

//
// src/components/apollo/ApolloBuilderWorkshopDialogue.tsx
//
// Sekuri integration: top-level Apollo NPC dialogue overlay for the Builder
// Workshop landmark interaction. Mounted at /play HUD root by GameHUDLean.
// Idle state renders nothing; the overlay surfaces when the dialogue store
// phase != 'closed' (Sekuri listener flips on game.landmark.interact with
// landmarkName === 'builder_workshop').
//
// State machine flow per V6 spec Part A:
//
//   greeting           prompt input field + Apollo greeting + Submit CTA
//   classifying        Sekuri classifier UI runs the regex tier matcher,
//                      shows yapping animation 2200ms (simulated), then
//                      surfaces the matched tier
//   template_summary   Pre-canned Sekuri template card shows the agent count,
//                      parallel group count, duration, cost-per-vendor; opens
//                      the existing ModelSelectionModal via the
//                      `nerium.builder.open_model_selection` window event
//   structure_proposal Agent roster cards with vendor badges per agent, plus
//                      parallel group visualization, plus Accept + Revise CTAs
//   spawning           TheatricalSpawnAnimation mounts (scoped Z above this
//                      overlay) and runs to BUILD COMPLETE
//   complete           Final state: deployable app icon + Done CTA closes
//   revising           Editable JSON of the structure (drop agents, swap
//                      vendors); user can Apply or Cancel
//
// Honest-claim caption rendered at every phase that surfaces template content.
// No live MA invocation, no Opus call, no fal.ai call. Theatrical only.
//
// No em dash, no emoji.
//

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import {
  classifyPrompt,
  loadSekuriTemplate,
  totalEstimatedCostUsd,
  SEKURI_HONEST_CLAIM_CAPTION,
  type SekuriClassification,
  type SekuriTemplate,
} from '../../lib/sekuri';
import { useApolloBuilderDialogueStore } from '../../stores/apolloBuilderDialogueStore';
import { SekuriClassifier } from '../builder/SekuriClassifier';
import TheatricalSpawnAnimationWithKeyframes from '../builder/TheatricalSpawnAnimation';
import ModelSelectionModalWithResponsiveStyles, {
  useBuilderModelSelectionStore,
  type ConfirmedModelSelection,
} from '../builder/ModelSelectionModal';
import { ApiKeyModal } from '../builder/ApiKeyModal';

const BUS_TOPIC_MODEL_CONFIRM = 'nerium.builder.model_selection_confirmed';
const BUS_TOPIC_OPEN_MODAL = 'nerium.builder.open_model_selection';

export function ApolloBuilderWorkshopDialogue() {
  const phase = useApolloBuilderDialogueStore((s) => s.phase);
  const userPrompt = useApolloBuilderDialogueStore((s) => s.userPrompt);
  const classification = useApolloBuilderDialogueStore((s) => s.classification);
  const template = useApolloBuilderDialogueStore((s) => s.template);
  const templateError = useApolloBuilderDialogueStore((s) => s.templateError);
  const modelConfig = useApolloBuilderDialogueStore((s) => s.modelConfig);
  const reviseDraftJson = useApolloBuilderDialogueStore(
    (s) => s.reviseDraftJson,
  );
  const perAgentVendorOverridesPreview = useApolloBuilderDialogueStore(
    (s) => s.perAgentVendorOverridesPreview,
  );

  const setUserPrompt = useApolloBuilderDialogueStore((s) => s.setUserPrompt);
  const submitPrompt = useApolloBuilderDialogueStore((s) => s.submitPrompt);
  const close = useApolloBuilderDialogueStore((s) => s.close);
  const setClassification = useApolloBuilderDialogueStore(
    (s) => s.setClassification,
  );
  const setTemplate = useApolloBuilderDialogueStore((s) => s.setTemplate);
  const setTemplateError = useApolloBuilderDialogueStore(
    (s) => s.setTemplateError,
  );
  const goTemplateSummary = useApolloBuilderDialogueStore(
    (s) => s.goTemplateSummary,
  );
  const goStructureProposal = useApolloBuilderDialogueStore(
    (s) => s.goStructureProposal,
  );
  const setModelConfig = useApolloBuilderDialogueStore((s) => s.setModelConfig);
  const goAwaitingRuntimeChoice = useApolloBuilderDialogueStore(
    (s) => s.goAwaitingRuntimeChoice,
  );
  const goSpawning = useApolloBuilderDialogueStore((s) => s.goSpawning);
  const goComplete = useApolloBuilderDialogueStore((s) => s.goComplete);
  const goRevising = useApolloBuilderDialogueStore((s) => s.goRevising);
  const setReviseDraftJson = useApolloBuilderDialogueStore(
    (s) => s.setReviseDraftJson,
  );
  const acceptRevisedDraft = useApolloBuilderDialogueStore(
    (s) => s.acceptRevisedDraft,
  );
  const cancelRevise = useApolloBuilderDialogueStore((s) => s.cancelRevise);

  const reducedMotion = useReducedMotion();
  const titleId = useId();

  const open = phase !== 'closed';

  // -------------------------------------------------------------------------
  // Aether-Vercel T6 Phase 1.5: expose the apollo dialogue store under a
  // namespaced window handle so Playwright specs can drive transitions
  // without simulating the full UI flow. Mirrors the precedent set by
  // PhaserCanvas under `window.__nerium_game__`. The handle is purely a
  // test convenience; production code does not depend on it.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as Record<string, unknown>;
    w.__nerium_test_apollo_store__ = useApolloBuilderDialogueStore.getState();
    // Re-publish on every state change so the test hook always reflects
    // the current API surface (actions are stable refs but selectors
    // refresh).
    const unsub = useApolloBuilderDialogueStore.subscribe((s) => {
      w.__nerium_test_apollo_store__ = s;
    });
    return () => {
      unsub();
      delete w.__nerium_test_apollo_store__;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Listen for model_selection_confirmed via window CustomEvent emitted by
  // hudBus emitBusEvent (BusBridge fallback path). When fired, we capture
  // the config and advance to structure_proposal.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handle = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as
        | { topic?: unknown; payload?: unknown }
        | undefined;
      if (!detail) return;
      if (detail.topic !== BUS_TOPIC_MODEL_CONFIRM) return;
      const cfg = detail.payload as ConfirmedModelSelection | undefined;
      if (!cfg) return;
      // Only react when the dialogue is in template_summary phase; the modal
      // can be opened from /builder harness for other reasons too.
      const currentPhase = useApolloBuilderDialogueStore.getState().phase;
      if (currentPhase !== 'template_summary') return;
      setModelConfig(cfg);
      goStructureProposal();
    };
    window.addEventListener('__NERIUM_GAME_EVENT__', handle);
    return () => window.removeEventListener('__NERIUM_GAME_EVENT__', handle);
  }, [setModelConfig, goStructureProposal]);

  // -------------------------------------------------------------------------
  // Classifier completion handler. Loads Sekuri template, advances to
  // template_summary phase. Idempotent on repeated mounts.
  // -------------------------------------------------------------------------
  const handleClassificationResult = useCallback(
    (result: SekuriClassification) => {
      setClassification(result);
      const ctrl = new AbortController();
      loadSekuriTemplate(result.tier, { signal: ctrl.signal })
        .then((t) => {
          setTemplate(t, t.user_options.per_agent_vendor_overrides);
          goTemplateSummary();
        })
        .catch((err: unknown) => {
          if ((err as { name?: string }).name === 'AbortError') return;
          setTemplateError(
            err instanceof Error ? err.message : 'template load failed',
          );
        });
      // Cleanup is best-effort; the abort fires only on rapid phase exit.
    },
    [setClassification, setTemplate, setTemplateError, goTemplateSummary],
  );

  // -------------------------------------------------------------------------
  // template_summary -> open ModelSelectionModal automatically once. The
  // modal is mounted by this overlay so we have full lifecycle ownership.
  // -------------------------------------------------------------------------
  const openModalOncePerEntryRef = useRef(false);
  useEffect(() => {
    if (phase !== 'template_summary') {
      openModalOncePerEntryRef.current = false;
      return;
    }
    if (openModalOncePerEntryRef.current) return;
    if (!classification) return;
    openModalOncePerEntryRef.current = true;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(BUS_TOPIC_OPEN_MODAL, {
          detail: { complexity: classification.tier },
        }),
      );
    }
  }, [phase, classification]);

  // -------------------------------------------------------------------------
  // Escape closes only when modal is not open (the modal owns its own
  // Escape handler). We only listen here as a top-level fallback for the
  // dialogue overlay itself.
  // -------------------------------------------------------------------------
  const modalOpen = useBuilderModelSelectionStore((s) => s.open);
  useEffect(() => {
    if (!open || modalOpen) return;
    const handler = (evt: KeyboardEvent) => {
      if (evt.key === 'Escape') {
        // While running animations, Escape closes the dialogue cleanly.
        if (phase === 'spawning' || phase === 'complete') {
          close();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, modalOpen, phase, close]);

  // -------------------------------------------------------------------------
  // Reset structure_proposal entrance: snapshot vendor overrides into a
  // local revisable JSON when goRevising triggers. We don't apply revisions
  // back to the live store template object itself; callers can wire that up
  // post-launch when the live runtime returns.
  // -------------------------------------------------------------------------
  const handleOpenRevise = useCallback(() => {
    if (!template) return;
    const draft = {
      complexity: template.complexity,
      agent_count: template.agent_count,
      parallel_groups: template.parallel_groups.map((g) => ({
        group: g.group,
        agents: [...g.agents],
        dependency_blocked_by: [...g.dependency_blocked_by],
      })),
      per_agent_vendor_overrides: { ...perAgentVendorOverridesPreview },
      estimated_duration_minutes: template.estimated_duration_minutes,
    };
    goRevising(JSON.stringify(draft, null, 2));
  }, [template, perAgentVendorOverridesPreview, goRevising]);

  if (!open) return null;

  // The TheatricalSpawnAnimation mounts above the dialogue panel, so when
  // phase==='spawning' we hide the dialogue chrome to give the animation
  // full canvas. Phase==='complete' surfaces the animation's final state
  // PLUS a Done button on top.
  const showSpawnAnimation = phase === 'spawning' || phase === 'complete';

  return (
    <>
      <ModelSelectionModalWithResponsiveStyles />
      <ApiKeyModal />
      <AnimatePresence>
        {open && !showSpawnAnimation ? (
          <motion.div
            key="apollo-dialogue"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={overlayStyle}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            data-testid="apollo-builder-dialogue"
            data-phase={phase}
          >
            <div
              aria-hidden="true"
              onClick={() => {
                if (phase === 'greeting' || phase === 'template_summary' || phase === 'structure_proposal') {
                  close();
                }
              }}
              style={backdropStyle}
            />
            <motion.section
              initial={reducedMotion ? false : { opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.22 }}
              style={panelStyle}
              data-builder-dialogue-role="panel"
            >
              <DialogueHeader titleId={titleId} phase={phase} onClose={close} />
              <p style={honestClaimStyle} role="note">
                {SEKURI_HONEST_CLAIM_CAPTION}
              </p>

              {phase === 'greeting' ? (
                <GreetingPhase
                  prompt={userPrompt}
                  onChange={setUserPrompt}
                  onSubmit={submitPrompt}
                />
              ) : null}

              {phase === 'classifying' ? (
                <ClassifyingPhase
                  prompt={userPrompt}
                  onResult={handleClassificationResult}
                />
              ) : null}

              {phase === 'template_summary' ? (
                <TemplateSummaryPhase
                  template={template}
                  templateError={templateError}
                  classification={classification}
                />
              ) : null}

              {phase === 'structure_proposal' ? (
                <StructureProposalPhase
                  template={template}
                  modelConfig={modelConfig}
                  perAgentVendorOverrides={perAgentVendorOverridesPreview}
                  onAccept={goAwaitingRuntimeChoice}
                  onRevise={handleOpenRevise}
                />
              ) : null}

              {phase === 'revising' ? (
                <RevisingPhase
                  draftJson={reviseDraftJson ?? ''}
                  onChange={setReviseDraftJson}
                  onApply={acceptRevisedDraft}
                  onCancel={cancelRevise}
                />
              ) : null}
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {showSpawnAnimation && template ? (
        <>
          <TheatricalSpawnAnimationWithKeyframes
            template={template}
            perAgentVendorOverrides={perAgentVendorOverridesPreview}
            spawnCommandTemplate={undefined}
            active
            onComplete={() => {
              if (
                useApolloBuilderDialogueStore.getState().phase === 'spawning'
              ) {
                goComplete();
              }
            }}
            onSkip={() => {
              if (
                useApolloBuilderDialogueStore.getState().phase === 'spawning'
              ) {
                goComplete();
              }
            }}
          />
          {phase === 'complete' ? (
            <CompleteOverlayDoneButton onDone={close} />
          ) : null}
        </>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Phase: Header
// ---------------------------------------------------------------------------

interface DialogueHeaderProps {
  titleId: string;
  phase: ReturnType<typeof useApolloBuilderDialogueStore.getState>['phase'];
  onClose: () => void;
}

function DialogueHeader({ titleId, phase, onClose }: DialogueHeaderProps) {
  const phaseLabel: Record<typeof phase, string> = {
    closed: 'Closed',
    greeting: 'Apollo Workshop',
    classifying: 'Classifying',
    template_summary: 'Sekuri Template',
    structure_proposal: 'Agent Structure',
    awaiting_runtime_choice: 'Choose Runtime',
    spawning: 'Spawning',
    complete: 'Build Complete',
    revising: 'Revise Structure',
  };
  return (
    <header style={headerStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        <span style={eyebrowStyle}>NERIUM Builder // Apollo Workshop</span>
        <h2 id={titleId} style={titleStyle}>
          {phaseLabel[phase]}
        </h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        style={closeBtnStyle}
        aria-label="Close Apollo Builder Workshop dialogue"
        data-testid="apollo-dialogue-close"
      >
        Close
      </button>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Phase: Greeting
// ---------------------------------------------------------------------------

interface GreetingPhaseProps {
  prompt: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
}

function GreetingPhase({ prompt, onChange, onSubmit }: GreetingPhaseProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  return (
    <section
      style={phaseSectionStyle}
      data-testid="apollo-dialogue-greeting"
    >
      <NPCBubble
        portrait="A"
        message={
          'Hai. Saya Apollo, Workshop Advisor. Ceritakan apa yang ingin kamu bangun dalam bahasa biasa, dan saya akan susun struktur agent-nya. Demo flow ini menggunakan template pra-saji.'
        }
      />
      <label style={inputLabelStyle} htmlFor="apollo-builder-prompt-input">
        Tell me what you want to build
      </label>
      <textarea
        id="apollo-builder-prompt-input"
        ref={inputRef}
        value={prompt}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Build me a marketplace SaaS for indie agent creators..."
        rows={3}
        style={inputStyle}
        data-testid="apollo-dialogue-prompt-input"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      <div style={ctaRowStyle}>
        <span style={ctaHelpStyle}>Cmd+Enter to submit</span>
        <button
          type="button"
          onClick={onSubmit}
          disabled={prompt.trim().length === 0}
          style={prompt.trim().length === 0 ? primaryCtaDisabledStyle : primaryCtaStyle}
          data-testid="apollo-dialogue-submit"
        >
          Send to Apollo
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Phase: Classifying (yapping)
// ---------------------------------------------------------------------------

interface ClassifyingPhaseProps {
  prompt: string;
  onResult: (result: SekuriClassification) => void;
}

function ClassifyingPhase({ prompt, onResult }: ClassifyingPhaseProps) {
  return (
    <section
      style={phaseSectionStyle}
      data-testid="apollo-dialogue-classifying"
    >
      <NPCBubble
        portrait="A"
        message="Let me think about your project structure..."
        emphasized
      />
      <SekuriClassifier prompt={prompt} active onResult={onResult} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Phase: Template Summary
// ---------------------------------------------------------------------------

interface TemplateSummaryPhaseProps {
  template: SekuriTemplate | null;
  templateError: string | null;
  classification: SekuriClassification | null;
}

function TemplateSummaryPhase({
  template,
  templateError,
  classification,
}: TemplateSummaryPhaseProps) {
  if (templateError) {
    return (
      <section
        style={phaseSectionStyle}
        data-testid="apollo-dialogue-template-error"
      >
        <NPCBubble
          portrait="A"
          message={`Template load failed: ${templateError}. Coba lagi.`}
        />
      </section>
    );
  }
  if (!template || !classification) {
    return (
      <section style={phaseSectionStyle}>
        <NPCBubble portrait="A" message="Loading template..." />
      </section>
    );
  }
  return (
    <section
      style={phaseSectionStyle}
      data-testid="apollo-dialogue-template-summary"
      data-tier={template.complexity}
    >
      <NPCBubble
        portrait="A"
        message={`Berdasarkan prompt kamu, Sekuri matched ${template.complexity} tier (${classification.matches[template.complexity].slice(0, 2).join(', ') || 'default'}). Pilih vendor lineup di modal yang muncul.`}
      />
      <article
        style={templateCardStyle}
        data-testid="apollo-dialogue-template-card"
      >
        <header style={templateCardHeaderStyle}>
          <span style={templateTierPillStyle}>
            {template.complexity.toUpperCase()}
          </span>
          <h3 style={templateCardTitleStyle}>{template.tier_rationale}</h3>
        </header>
        <div style={templateStatRowStyle}>
          <Stat label="Agents" value={String(template.agent_count)} />
          <Stat
            label="Parallel groups"
            value={String(template.parallel_groups.length)}
          />
          <Stat
            label="Estimated duration"
            value={`${template.estimated_duration_minutes} min`}
          />
          <Stat
            label="Spawned terminals"
            value={String(template.spawned_terminal_count)}
          />
        </div>
        <div>
          <span style={templateMetaLabelStyle}>Cost per vendor (USD)</span>
          <ul style={costListStyle}>
            {Object.entries(template.estimated_cost_usd_per_vendor).map(
              ([vendor, amount]) => (
                <li key={vendor} style={costItemStyle}>
                  <span style={costVendorStyle}>{vendor}</span>
                  <span style={costValueStyle}>${amount.toFixed(2)}</span>
                </li>
              ),
            )}
          </ul>
        </div>
      </article>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Phase: Structure Proposal
// ---------------------------------------------------------------------------

interface StructureProposalPhaseProps {
  template: SekuriTemplate | null;
  modelConfig: ConfirmedModelSelection | null;
  perAgentVendorOverrides: Record<string, string>;
  onAccept: () => void;
  onRevise: () => void;
}

function StructureProposalPhase({
  template,
  modelConfig,
  perAgentVendorOverrides,
  onAccept,
  onRevise,
}: StructureProposalPhaseProps) {
  const totalCost = useMemo(() => {
    if (!template || !modelConfig) return 0;
    return totalEstimatedCostUsd(
      template,
      modelConfig.selectedVendorIds.map((v) => v.toString()),
    );
  }, [template, modelConfig]);

  if (!template) {
    return (
      <section style={phaseSectionStyle}>
        <NPCBubble portrait="A" message="No template loaded yet." />
      </section>
    );
  }

  return (
    <section
      style={phaseSectionStyle}
      data-testid="apollo-dialogue-structure-proposal"
    >
      <NPCBubble
        portrait="A"
        message="Ini struktur agent yang Sekuri propose. Klik Accept untuk lihat theatrical spawn animation, atau Revise untuk edit per-agent vendor."
      />
      <div style={structureGridStyle}>
        {template.parallel_groups.map((group) => (
          <article
            key={group.group}
            style={structureGroupCardStyle}
            data-group={group.group}
            data-testid={`apollo-dialogue-group-${group.group}`}
          >
            <header style={structureGroupHeaderStyle}>
              <span style={structureGroupLabelStyle}>{group.group}</span>
              <span style={structureGroupCountStyle}>
                {group.agents.length} agent
                {group.agents.length === 1 ? '' : 's'}
              </span>
            </header>
            <ul style={structureAgentListStyle}>
              {group.agents.map((agent) => {
                const vendor =
                  perAgentVendorOverrides[agent] ??
                  template.user_options.per_agent_vendor_overrides[agent] ??
                  'anthropic_opus_4.7';
                return (
                  <li key={agent} style={structureAgentRowStyle}>
                    <span style={structureAgentNameStyle}>{agent}</span>
                    <span
                      style={{
                        ...structureAgentVendorChipStyle,
                        borderColor: vendorAccentSimple(vendor),
                        color: vendorAccentSimple(vendor),
                      }}
                    >
                      {vendor.replace(/_/g, ' ')}
                    </span>
                  </li>
                );
              })}
            </ul>
            {group.dependency_blocked_by.length > 0 ? (
              <span style={structureDepStyle}>
                blocked by {group.dependency_blocked_by.join(', ')}
              </span>
            ) : null}
          </article>
        ))}
      </div>
      {modelConfig ? (
        <div style={modelConfigSummaryStyle}>
          <span style={modelConfigLabelStyle}>Confirmed model selection</span>
          <span style={modelConfigValueStyle}>
            primary {modelConfig.primaryVendor} / mode{' '}
            {modelConfig.claudeExecutionMode} / total ~$
            {totalCost.toFixed(2)} USD
          </span>
        </div>
      ) : null}
      <div style={ctaRowStyle}>
        <button
          type="button"
          onClick={onRevise}
          style={secondaryCtaStyle}
          data-testid="apollo-dialogue-revise"
        >
          Revise
        </button>
        <button
          type="button"
          onClick={onAccept}
          style={primaryCtaStyle}
          data-testid="apollo-dialogue-accept"
        >
          Accept and spawn
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Phase: Revising
// ---------------------------------------------------------------------------

interface RevisingPhaseProps {
  draftJson: string;
  onChange: (text: string) => void;
  onApply: () => void;
  onCancel: () => void;
}

function RevisingPhase({ draftJson, onChange, onApply, onCancel }: RevisingPhaseProps) {
  const [parseError, setParseError] = useState<string | null>(null);

  const handleApply = () => {
    try {
      JSON.parse(draftJson);
      setParseError(null);
      onApply();
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'JSON parse failed');
    }
  };

  return (
    <section
      style={phaseSectionStyle}
      data-testid="apollo-dialogue-revising"
    >
      <NPCBubble
        portrait="A"
        message="Edit the structure as JSON. Drop agents, swap vendors, rename. Apply to return to the proposal view."
      />
      <textarea
        value={draftJson}
        onChange={(e) => onChange(e.target.value)}
        rows={14}
        style={revisingTextareaStyle}
        data-testid="apollo-dialogue-revise-textarea"
        spellCheck={false}
      />
      {parseError ? (
        <span style={revisingErrorStyle} role="alert">
          JSON error: {parseError}
        </span>
      ) : null}
      <div style={ctaRowStyle}>
        <button
          type="button"
          onClick={onCancel}
          style={secondaryCtaStyle}
          data-testid="apollo-dialogue-revise-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleApply}
          style={primaryCtaStyle}
          data-testid="apollo-dialogue-revise-apply"
        >
          Apply
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Phase: Complete -> Done button overlaid on top of the spawn animation
// ---------------------------------------------------------------------------

function CompleteOverlayDoneButton({ onDone }: { onDone: () => void }) {
  return (
    <div style={completeBtnContainerStyle}>
      <button
        type="button"
        onClick={onDone}
        style={primaryCtaStyle}
        data-testid="apollo-dialogue-done"
      >
        Done
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NPC bubble
// ---------------------------------------------------------------------------

interface NPCBubbleProps {
  portrait?: string;
  message: string;
  emphasized?: boolean;
}

function NPCBubble({ portrait, message, emphasized }: NPCBubbleProps) {
  return (
    <div style={npcBubbleStyle}>
      <span style={npcPortraitStyle} aria-hidden="true">
        {portrait ?? 'A'}
      </span>
      <p
        style={{
          ...npcMessageStyle,
          color: emphasized
            ? 'oklch(0.88 0.15 140)'
            : 'oklch(0.95 0.01 85)',
        }}
      >
        {message}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat helper
// ---------------------------------------------------------------------------

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={statBoxStyle}>
      <span style={statLabelStyle}>{label}</span>
      <span style={statValueStyle}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vendor accent (simplified for structure proposal cards)
// ---------------------------------------------------------------------------

function vendorAccentSimple(vendor: string): string {
  const norm = vendor.toLowerCase().replace(/\./g, '_');
  if (norm.startsWith('anthropic')) return 'oklch(0.88 0.15 140)';
  if (norm.startsWith('google')) return 'oklch(0.83 0.15 200)';
  if (norm.startsWith('openai')) return 'oklch(0.95 0.01 85)';
  if (norm.startsWith('higgsfield')) return 'oklch(0.66 0.27 5)';
  if (norm.startsWith('seedance')) return 'oklch(0.62 0.22 295)';
  if (norm.startsWith('meta')) return 'oklch(0.55 0.20 250)';
  if (norm.startsWith('mistral')) return 'oklch(0.78 0.17 55)';
  return 'oklch(0.72 0.02 250)';
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const FONT_DISPLAY =
  "var(--font-space-grotesk, 'Space Grotesk', system-ui, sans-serif)";
const FONT_RETRO = "var(--font-vt323, 'VT323', 'Courier New', monospace)";
const FONT_MONO =
  "var(--font-jetbrains-mono, 'JetBrains Mono', 'Courier New', monospace)";

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'auto',
};

const backdropStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'oklch(0.10 0.012 250 / 0.75)',
  backdropFilter: 'blur(5px)',
};

const panelStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  width: 'min(780px, calc(100vw - 2rem))',
  maxHeight: 'calc(100vh - 2rem)',
  padding: '1.4rem 1.5rem 1.25rem',
  borderRadius: '0.75rem',
  background: 'oklch(0.14 0.012 250)',
  color: 'oklch(0.95 0.01 85)',
  border: '1px solid oklch(0.32 0.02 250)',
  boxShadow:
    '0 24px 64px -32px oklch(0.06 0.01 250 / 0.7), 0 0 0 1px oklch(0.88 0.15 140 / 0.18)',
  fontFamily: FONT_DISPLAY,
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  overflowY: 'auto',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '1rem',
};

const eyebrowStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '10px',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'oklch(0.88 0.15 140)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontFamily: FONT_DISPLAY,
  fontSize: '1.4rem',
  fontWeight: 700,
  letterSpacing: '-0.01em',
};

const closeBtnStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '11px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  padding: '0.4rem 0.7rem',
  borderRadius: '0.4rem',
  background: 'transparent',
  border: '1px solid oklch(0.32 0.02 250)',
  color: 'oklch(0.72 0.02 250)',
  cursor: 'pointer',
};

const honestClaimStyle: CSSProperties = {
  margin: 0,
  padding: '0.45rem 0.7rem',
  borderRadius: '0.4rem',
  background: 'oklch(0.18 0.015 250 / 0.65)',
  border: '1px dashed oklch(0.32 0.02 250)',
  fontFamily: FONT_MONO,
  fontSize: '11px',
  color: 'oklch(0.72 0.02 250)',
};

const phaseSectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.85rem',
};

const npcBubbleStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '0.6rem',
  padding: '0.55rem 0.7rem',
  borderRadius: '0.5rem',
  background: 'oklch(0.18 0.015 250 / 0.55)',
  border: '1px solid oklch(0.32 0.02 250)',
};

const npcPortraitStyle: CSSProperties = {
  flexShrink: 0,
  width: '36px',
  height: '36px',
  borderRadius: '999px',
  background: 'oklch(0.78 0.17 55 / 0.18)',
  border: '1.5px solid oklch(0.78 0.17 55)',
  fontFamily: FONT_RETRO,
  fontSize: '20px',
  color: 'oklch(0.78 0.17 55)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const npcMessageStyle: CSSProperties = {
  margin: 0,
  fontFamily: FONT_DISPLAY,
  fontSize: '13.5px',
  lineHeight: 1.5,
};

const inputLabelStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '10px',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'oklch(0.88 0.15 140)',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '0.7rem 0.85rem',
  borderRadius: '0.45rem',
  border: '1px solid oklch(0.32 0.02 250)',
  background: 'oklch(0.10 0.012 250)',
  color: 'oklch(0.95 0.01 85)',
  fontFamily: FONT_MONO,
  fontSize: '13px',
  resize: 'vertical',
};

const ctaRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: '0.6rem',
};

const ctaHelpStyle: CSSProperties = {
  flex: 1,
  fontFamily: FONT_MONO,
  fontSize: '10px',
  color: 'oklch(0.72 0.02 250)',
};

const primaryCtaStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '12px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  padding: '0.55rem 1.1rem',
  borderRadius: '0.4rem',
  background: 'oklch(0.88 0.15 140)',
  border: '1px solid oklch(0.88 0.15 140)',
  color: 'oklch(0.14 0.012 250)',
  cursor: 'pointer',
  fontWeight: 700,
};

const primaryCtaDisabledStyle: CSSProperties = {
  ...primaryCtaStyle,
  opacity: 0.5,
  cursor: 'not-allowed',
};

const secondaryCtaStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '12px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  padding: '0.55rem 0.95rem',
  borderRadius: '0.4rem',
  background: 'transparent',
  border: '1px solid oklch(0.32 0.02 250)',
  color: 'oklch(0.72 0.02 250)',
  cursor: 'pointer',
};

const templateCardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.6rem',
  padding: '0.85rem',
  borderRadius: '0.55rem',
  background: 'oklch(0.18 0.015 250 / 0.55)',
  border: '1.5px solid oklch(0.32 0.02 250)',
};

const templateCardHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
};

const templateTierPillStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '11px',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  padding: '0.2rem 0.55rem',
  borderRadius: '999px',
  background: 'oklch(0.78 0.17 55 / 0.16)',
  color: 'oklch(0.78 0.17 55)',
  fontWeight: 700,
};

const templateCardTitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: FONT_DISPLAY,
  fontSize: '14px',
  fontWeight: 600,
  color: 'oklch(0.95 0.01 85)',
};

const templateStatRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: '0.5rem',
};

const templateMetaLabelStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '10px',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'oklch(0.72 0.02 250)',
};

const costListStyle: CSSProperties = {
  margin: '0.4rem 0 0 0',
  padding: 0,
  listStyle: 'none',
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: '0.4rem',
};

const costItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0.35rem 0.55rem',
  borderRadius: '0.35rem',
  background: 'oklch(0.10 0.012 250 / 0.55)',
  border: '1px solid oklch(0.32 0.02 250)',
};

const costVendorStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '11px',
  color: 'oklch(0.95 0.01 85)',
  textTransform: 'capitalize',
};

const costValueStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '11px',
  fontVariantNumeric: 'tabular-nums',
  color: 'oklch(0.88 0.15 140)',
};

const statBoxStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.15rem',
  padding: '0.5rem 0.65rem',
  borderRadius: '0.4rem',
  background: 'oklch(0.10 0.012 250 / 0.65)',
  border: '1px solid oklch(0.32 0.02 250)',
};

const statLabelStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '9px',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'oklch(0.72 0.02 250)',
};

const statValueStyle: CSSProperties = {
  fontFamily: FONT_RETRO,
  fontSize: '18px',
  color: 'oklch(0.95 0.01 85)',
};

const structureGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '0.6rem',
};

const structureGroupCardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  padding: '0.7rem 0.8rem',
  borderRadius: '0.5rem',
  background: 'oklch(0.18 0.015 250 / 0.55)',
  border: '1px solid oklch(0.32 0.02 250)',
};

const structureGroupHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const structureGroupLabelStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '11px',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'oklch(0.88 0.15 140)',
};

const structureGroupCountStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '10px',
  color: 'oklch(0.72 0.02 250)',
};

const structureAgentListStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
};

const structureAgentRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '0.4rem',
};

const structureAgentNameStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '12px',
  color: 'oklch(0.95 0.01 85)',
};

const structureAgentVendorChipStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '9px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  padding: '0.1rem 0.35rem',
  borderRadius: '999px',
  border: '1px solid currentColor',
};

const structureDepStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '10px',
  color: 'oklch(0.72 0.02 250)',
};

const modelConfigSummaryStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.2rem',
  padding: '0.55rem 0.7rem',
  borderRadius: '0.4rem',
  background: 'oklch(0.10 0.012 250 / 0.55)',
  border: '1px solid oklch(0.32 0.02 250)',
};

const modelConfigLabelStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '9px',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'oklch(0.72 0.02 250)',
};

const modelConfigValueStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '11px',
  color: 'oklch(0.88 0.15 140)',
};

const revisingTextareaStyle: CSSProperties = {
  width: '100%',
  padding: '0.7rem 0.85rem',
  borderRadius: '0.45rem',
  border: '1px solid oklch(0.32 0.02 250)',
  background: 'oklch(0.10 0.012 250)',
  color: 'oklch(0.95 0.01 85)',
  fontFamily: FONT_MONO,
  fontSize: '12px',
  resize: 'vertical',
};

const revisingErrorStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '11px',
  color: 'oklch(0.72 0.18 20)',
};

const completeBtnContainerStyle: CSSProperties = {
  position: 'fixed',
  bottom: '1.5rem',
  right: '1.5rem',
  zIndex: 70,
};

export default ApolloBuilderWorkshopDialogue;

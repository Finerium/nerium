'use client';

//
// src/components/builder/ModelSelectionModal.tsx
//
// Lu specialist (W3 T3) authored. Builder ModelSelectionModal: 4x2 grid of
// vendor badges + Claude execution mode picker + multi-vendor routing
// toggle + Sekuri-template-driven cost estimate + honest-claim caption.
//
// Integration shape:
//   - Self-controlled: subscribes to `useBuilderModelSelectionStore`. Open
//     externally via `useBuilderModelSelectionStore.getState().openModal(c)`
//     or via the convenience `nerium.builder.open_model_selection` window
//     CustomEvent (so a dialogue effect or a Phaser scene can trigger
//     without importing the store).
//   - On confirm: emits `nerium.builder.model_selection_confirmed` via the
//     shared HUD bus with the full config payload. Modal closes itself.
//   - Render scope: NOT auto-mounted in GameHUD per spawn-brief halt
//     trigger ("Modal render conflicts with Boreas DOMElement chat
//     overlay"). Callers mount this component explicitly.
//
// Honest-claim discipline (CLAUDE.md anti-pattern 7 amended; NarasiGhaisan
// Section 3.8): the modal surfaces multi-vendor flexibility as a feature
// SPEC. Live runtime at submission is Anthropic-only. Locked annotation
// text from `app/protocol/vendor/annotation_text.constant.ts` rendered
// alongside the spawn-given honest-claim caption.
//
// Accessibility:
//   - role="dialog" + aria-modal="true" on the panel.
//   - Escape closes; backdrop click closes.
//   - Vendor grid: arrow keys navigate (4 columns x 2 rows wrap).
//   - Each badge has aria-label, aria-pressed, focus ring.
//   - aria-live="polite" on the cost estimate region so screen readers
//     announce updates.
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
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import {
  useBuilderModelSelectionStore,
  type BuilderVendorId,
} from '../../stores/builderModelSelectionStore';
import {
  loadSekuriTemplate,
  totalEstimatedCostUsd,
  type SekuriClaudeExecutionMode,
  type SekuriComplexity,
  type SekuriTemplate,
} from '../../lib/sekuriTemplate';
import { emitBusEvent } from '../../lib/hudBus';
import {
  HONEST_CLAIM_LOCKED_TEXT,
  ANTHROPIC_BADGE_LABEL,
  MOCK_BADGE_LABEL,
} from '../../../app/protocol/vendor/annotation_text.constant';

const SPAWN_HONEST_CLAIM_CAPTION =
  'Multi-vendor flexibility. Live runtime at submission Anthropic-only. Multi-vendor invocation reactivates post-launch.';

interface VendorPreset {
  readonly id: BuilderVendorId;
  readonly label: string;
  readonly modelHint: string;
  readonly accent: string;
  readonly accentSoft: string;
  readonly accentDeep: string;
  readonly liveBadge: 'live' | 'simulated';
  readonly costKey: string;
}

const VENDORS: ReadonlyArray<VendorPreset> = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    modelHint: 'Opus 4.7',
    accent: 'oklch(0.88 0.15 140)',
    accentSoft: 'oklch(0.88 0.15 140 / 0.18)',
    accentDeep: 'oklch(0.38 0.09 140)',
    liveBadge: 'live',
    costKey: 'anthropic',
  },
  {
    id: 'google',
    label: 'Google',
    modelHint: 'Gemini Pro',
    accent: 'oklch(0.83 0.15 200)',
    accentSoft: 'oklch(0.83 0.15 200 / 0.18)',
    accentDeep: 'oklch(0.42 0.10 200)',
    liveBadge: 'simulated',
    costKey: 'google',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    modelHint: 'Codex',
    accent: 'oklch(0.95 0.01 85)',
    accentSoft: 'oklch(0.95 0.01 85 / 0.16)',
    accentDeep: 'oklch(0.62 0.02 85)',
    liveBadge: 'simulated',
    costKey: 'openai',
  },
  {
    id: 'higgsfield',
    label: 'Higgsfield',
    modelHint: 'Asset Engine',
    accent: 'oklch(0.66 0.27 5)',
    accentSoft: 'oklch(0.66 0.27 5 / 0.20)',
    accentDeep: 'oklch(0.36 0.18 5)',
    liveBadge: 'simulated',
    costKey: 'higgsfield',
  },
  {
    id: 'seedance',
    label: 'Seedance',
    modelHint: 'Video Render',
    accent: 'oklch(0.62 0.22 295)',
    accentSoft: 'oklch(0.62 0.22 295 / 0.20)',
    accentDeep: 'oklch(0.34 0.15 295)',
    liveBadge: 'simulated',
    costKey: 'seedance',
  },
  {
    id: 'meta',
    label: 'Meta',
    modelHint: 'Llama 3.1',
    accent: 'oklch(0.55 0.20 250)',
    accentSoft: 'oklch(0.55 0.20 250 / 0.20)',
    accentDeep: 'oklch(0.30 0.12 250)',
    liveBadge: 'simulated',
    costKey: 'meta',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    modelHint: 'Mixtral',
    accent: 'oklch(0.78 0.17 55)',
    accentSoft: 'oklch(0.78 0.17 55 / 0.20)',
    accentDeep: 'oklch(0.42 0.11 55)',
    liveBadge: 'simulated',
    costKey: 'mistral',
  },
  {
    id: 'auto',
    label: 'Auto',
    modelHint: 'Orchestrator picks',
    // Rainbow accent rendered as a conic-gradient via the accent CSS variable.
    accent:
      'conic-gradient(from 45deg, oklch(0.88 0.15 140), oklch(0.83 0.15 200), oklch(0.62 0.22 295), oklch(0.66 0.27 5), oklch(0.78 0.17 55), oklch(0.88 0.15 140))',
    accentSoft: 'oklch(0.95 0.01 85 / 0.16)',
    accentDeep: 'oklch(0.32 0.05 250)',
    liveBadge: 'simulated',
    costKey: 'auto',
  },
];

const GRID_COLUMNS = 4;
const GRID_ROWS = 2;

interface ClaudeExecutionModePreset {
  readonly id: SekuriClaudeExecutionMode;
  readonly label: string;
  readonly hint: string;
}

const CLAUDE_EXECUTION_MODES: ReadonlyArray<ClaudeExecutionModePreset> = [
  {
    id: 'managed_agents',
    label: 'Managed Agents',
    hint: 'Anthropic Managed Agents lane (Heracles).',
  },
  {
    id: 'terminal_spawn',
    label: 'Terminal Spawn',
    hint: 'Local CLI shells with --dangerously-skip-permissions.',
  },
  {
    id: 'hybrid',
    label: 'Hybrid',
    hint: 'Strategic via MA, workers via terminal spawn.',
  },
];

export interface ModelSelectionModalProps {
  /**
   * When provided, the modal renders in CONTROLLED mode and ignores the
   * Zustand store open flag. Useful for unit tests and Storybook-style
   * harness mounts.
   */
  controlledOpen?: boolean;
  controlledComplexity?: SekuriComplexity;
  onConfirm?: (config: ConfirmedModelSelection) => void;
  onClose?: () => void;
}

export interface ConfirmedModelSelection {
  primaryVendor: BuilderVendorId;
  claudeExecutionMode: SekuriClaudeExecutionMode;
  multiVendorRoutingEnabled: boolean;
  selectedVendorIds: ReadonlyArray<BuilderVendorId>;
  complexity: SekuriComplexity;
  totalEstimatedCostUsd: number;
}

export function ModelSelectionModal(props: ModelSelectionModalProps = {}) {
  const { controlledOpen, controlledComplexity, onConfirm, onClose } = props;

  const storeOpen = useBuilderModelSelectionStore((s) => s.open);
  const storeComplexity = useBuilderModelSelectionStore((s) => s.complexity);
  const primaryVendor = useBuilderModelSelectionStore((s) => s.primaryVendor);
  const claudeExecutionMode = useBuilderModelSelectionStore(
    (s) => s.claudeExecutionMode,
  );
  const multiVendorRoutingEnabled = useBuilderModelSelectionStore(
    (s) => s.multiVendorRoutingEnabled,
  );
  const selectedVendorIds = useBuilderModelSelectionStore(
    (s) => s.selectedVendorIds,
  );
  const setPrimaryVendor = useBuilderModelSelectionStore(
    (s) => s.setPrimaryVendor,
  );
  const setClaudeExecutionMode = useBuilderModelSelectionStore(
    (s) => s.setClaudeExecutionMode,
  );
  const setMultiVendorRoutingEnabled = useBuilderModelSelectionStore(
    (s) => s.setMultiVendorRoutingEnabled,
  );
  const toggleVendor = useBuilderModelSelectionStore((s) => s.toggleVendor);
  const closeModal = useBuilderModelSelectionStore((s) => s.closeModal);
  const openModal = useBuilderModelSelectionStore((s) => s.openModal);

  const open = controlledOpen ?? storeOpen;
  const complexity = controlledComplexity ?? storeComplexity;

  const [template, setTemplate] = useState<SekuriTemplate | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [focusedVendorIdx, setFocusedVendorIdx] = useState(0);
  const reducedMotion = useReducedMotion();
  const titleId = useId();
  const captionId = useId();
  const costRegionId = useId();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Window-event opener: any app surface can dispatch
  // `nerium.builder.open_model_selection` with `{ complexity }` to open
  // this modal without importing the store.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as
        | { complexity?: SekuriComplexity }
        | undefined;
      if (
        detail?.complexity === 'small' ||
        detail?.complexity === 'medium' ||
        detail?.complexity === 'large'
      ) {
        openModal(detail.complexity);
      }
    };
    window.addEventListener('nerium.builder.open_model_selection', handler);
    return () => {
      window.removeEventListener(
        'nerium.builder.open_model_selection',
        handler,
      );
    };
  }, [openModal]);

  // Load Sekuri template when modal opens with a complexity tier.
  useEffect(() => {
    if (!open || !complexity) return;
    setTemplateError(null);
    const ctrl = new AbortController();
    loadSekuriTemplate(complexity, { signal: ctrl.signal })
      .then((t) => setTemplate(t))
      .catch((err: unknown) => {
        if ((err as { name?: string }).name === 'AbortError') return;
        setTemplate(null);
        setTemplateError(
          err instanceof Error ? err.message : 'template load failed',
        );
      });
    return () => ctrl.abort();
  }, [open, complexity]);

  // Focus arbitration: capture previously focused element on open, restore
  // on close. Move focus into the dialog grid on open.
  useEffect(() => {
    if (!open) return;
    if (typeof document === 'undefined') return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    // Defer focus so the panel mounts and is reachable.
    const id = window.setTimeout(() => {
      const grid = gridRef.current;
      if (!grid) return;
      const first = grid.querySelector<HTMLButtonElement>(
        '[data-vendor-badge="true"]',
      );
      first?.focus();
    }, 30);
    return () => {
      window.clearTimeout(id);
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === 'function') {
        prev.focus();
      }
    };
  }, [open]);

  // Escape-to-close.
  useEffect(() => {
    if (!open) return;
    const handler = (evt: globalThis.KeyboardEvent) => {
      if (evt.key === 'Escape') {
        evt.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const totalCostUsd = useMemo(() => {
    if (!template) return 0;
    return totalEstimatedCostUsd(template, selectedVendorIds);
  }, [template, selectedVendorIds]);

  const handleClose = useCallback(() => {
    closeModal();
    onClose?.();
  }, [closeModal, onClose]);

  const handleConfirm = useCallback(() => {
    if (!complexity) return;
    const config: ConfirmedModelSelection = {
      primaryVendor,
      claudeExecutionMode,
      multiVendorRoutingEnabled,
      selectedVendorIds: [...selectedVendorIds],
      complexity,
      totalEstimatedCostUsd: totalCostUsd,
    };
    emitBusEvent('nerium.builder.model_selection_confirmed', config);
    onConfirm?.(config);
    closeModal();
  }, [
    primaryVendor,
    claudeExecutionMode,
    multiVendorRoutingEnabled,
    selectedVendorIds,
    complexity,
    totalCostUsd,
    onConfirm,
    closeModal,
  ]);

  const handleVendorKeyDown = useCallback(
    (evt: ReactKeyboardEvent<HTMLButtonElement>, idx: number) => {
      let nextIdx = idx;
      switch (evt.key) {
        case 'ArrowRight':
          nextIdx = (idx + 1) % VENDORS.length;
          break;
        case 'ArrowLeft':
          nextIdx = (idx - 1 + VENDORS.length) % VENDORS.length;
          break;
        case 'ArrowDown':
          nextIdx = (idx + GRID_COLUMNS) % VENDORS.length;
          break;
        case 'ArrowUp':
          nextIdx = (idx - GRID_COLUMNS + VENDORS.length) % VENDORS.length;
          break;
        case 'Home':
          nextIdx = 0;
          break;
        case 'End':
          nextIdx = VENDORS.length - 1;
          break;
        case ' ':
        case 'Enter': {
          const vendor = VENDORS[idx]!.id;
          if (multiVendorRoutingEnabled && vendor !== primaryVendor) {
            evt.preventDefault();
            toggleVendor(vendor);
            return;
          }
          evt.preventDefault();
          setPrimaryVendor(vendor);
          return;
        }
        default:
          return;
      }
      evt.preventDefault();
      setFocusedVendorIdx(nextIdx);
      const grid = gridRef.current;
      if (!grid) return;
      const buttons = grid.querySelectorAll<HTMLButtonElement>(
        '[data-vendor-badge="true"]',
      );
      buttons[nextIdx]?.focus();
    },
    [
      multiVendorRoutingEnabled,
      primaryVendor,
      setPrimaryVendor,
      toggleVendor,
    ],
  );

  const handleVendorClick = useCallback(
    (vendor: BuilderVendorId) => {
      if (multiVendorRoutingEnabled && vendor !== primaryVendor) {
        toggleVendor(vendor);
        return;
      }
      setPrimaryVendor(vendor);
    },
    [multiVendorRoutingEnabled, primaryVendor, setPrimaryVendor, toggleVendor],
  );

  const isLargeTier = complexity === 'large';

  // Per-vendor cost lookup for the badge sub-label, with a graceful
  // dash for vendors not present in the Sekuri template.
  const costLookup = template?.estimated_cost_usd_per_vendor ?? {};

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="model-selection-modal"
          className="pointer-events-auto fixed inset-0 z-[55] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          role="presentation"
          data-testid="model-selection-modal"
          data-builder-modal-role="root"
        >
          <div
            aria-hidden="true"
            onClick={handleClose}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'oklch(0.10 0.012 250 / 0.78)',
              backdropFilter: 'blur(6px)',
            }}
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={captionId}
            initial={reducedMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }
            }
            transition={{ duration: 0.18 }}
            data-builder-modal-role="panel"
            style={panelStyle}
          >
            <ModalHeader
              titleId={titleId}
              complexity={complexity}
              tierRationale={template?.tier_rationale ?? null}
              onClose={handleClose}
            />

            <p id={captionId} style={captionStyle}>
              {SPAWN_HONEST_CLAIM_CAPTION}
            </p>

            <VendorGrid
              gridRef={gridRef}
              focusedIdx={focusedVendorIdx}
              setFocusedIdx={setFocusedVendorIdx}
              primaryVendor={primaryVendor}
              selectedVendorIds={selectedVendorIds}
              multiVendorRoutingEnabled={multiVendorRoutingEnabled}
              costLookup={costLookup}
              onVendorClick={handleVendorClick}
              onVendorKeyDown={handleVendorKeyDown}
            />

            {primaryVendor === 'anthropic' ? (
              <ClaudeExecutionModePicker
                mode={claudeExecutionMode}
                onChange={setClaudeExecutionMode}
              />
            ) : null}

            {isLargeTier ? (
              <MultiVendorRoutingToggle
                enabled={multiVendorRoutingEnabled}
                onToggle={() =>
                  setMultiVendorRoutingEnabled(!multiVendorRoutingEnabled)
                }
              />
            ) : null}

            <CostEstimate
              regionId={costRegionId}
              template={template}
              templateError={templateError}
              selectedVendorIds={selectedVendorIds}
              totalCostUsd={totalCostUsd}
            />

            <HonestClaimFooter />

            <div style={ctaRowStyle}>
              <button
                type="button"
                onClick={handleClose}
                style={secondaryCtaStyle}
                data-testid="model-selection-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!template || !complexity}
                style={
                  template && complexity
                    ? primaryCtaStyle
                    : primaryCtaDisabledStyle
                }
                data-testid="model-selection-confirm"
              >
                Confirm selection
              </button>
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

interface ModalHeaderProps {
  titleId: string;
  complexity: SekuriComplexity | null;
  tierRationale: string | null;
  onClose: () => void;
}

function ModalHeader({
  titleId,
  complexity,
  tierRationale,
  onClose,
}: ModalHeaderProps) {
  return (
    <header style={headerStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <span style={eyebrowStyle}>
          NERIUM Builder // Model selection
        </span>
        <h2 id={titleId} style={titleStyle}>
          Pick a vendor lineup
        </h2>
        {complexity ? (
          <span style={tierTagStyle} data-builder-modal-role="tier-tag">
            <span style={tierTagPillStyle}>
              {complexity.toUpperCase()}
            </span>
            {tierRationale ? (
              <span style={tierTagRationaleStyle}>{tierRationale}</span>
            ) : null}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        style={closeBtnStyle}
        aria-label="Close model selection"
        data-testid="model-selection-close"
      >
        Close
      </button>
    </header>
  );
}

interface VendorGridProps {
  gridRef: React.MutableRefObject<HTMLDivElement | null>;
  focusedIdx: number;
  setFocusedIdx: (idx: number) => void;
  primaryVendor: BuilderVendorId;
  selectedVendorIds: ReadonlyArray<BuilderVendorId>;
  multiVendorRoutingEnabled: boolean;
  costLookup: Record<string, number>;
  onVendorClick: (id: BuilderVendorId) => void;
  onVendorKeyDown: (
    evt: ReactKeyboardEvent<HTMLButtonElement>,
    idx: number,
  ) => void;
}

function VendorGrid(props: VendorGridProps) {
    const {
      gridRef,
      focusedIdx,
      setFocusedIdx,
      primaryVendor,
      selectedVendorIds,
      multiVendorRoutingEnabled,
      costLookup,
      onVendorClick,
      onVendorKeyDown,
    } = props;

    return (
      <div
        ref={gridRef}
        role="grid"
        aria-label="Vendor selection grid"
        aria-rowcount={GRID_ROWS}
        aria-colcount={GRID_COLUMNS}
        style={gridStyle}
        data-builder-modal-role="vendor-grid"
      >
        {VENDORS.map((vendor, idx) => {
          const isPrimary = vendor.id === primaryVendor;
          const isSelected =
            multiVendorRoutingEnabled && selectedVendorIds.includes(vendor.id);
          const cost = costLookup[vendor.costKey];
          const accentBackground = vendor.id === 'auto' ? vendor.accent : 'transparent';
          const accentBorder = vendor.id === 'auto' ? 'transparent' : vendor.accent;
          return (
            <button
              key={vendor.id}
              type="button"
              role="gridcell"
              tabIndex={focusedIdx === idx ? 0 : -1}
              data-vendor-badge="true"
              data-vendor-id={vendor.id}
              data-primary={isPrimary ? 'true' : 'false'}
              data-selected={isSelected ? 'true' : 'false'}
              aria-pressed={isPrimary || isSelected}
              aria-label={`${vendor.label} ${vendor.modelHint}, ${vendor.liveBadge} runtime`}
              onClick={() => {
                setFocusedIdx(idx);
                onVendorClick(vendor.id);
              }}
              onFocus={() => setFocusedIdx(idx)}
              onKeyDown={(evt) => onVendorKeyDown(evt, idx)}
              style={{
                ...vendorBadgeBaseStyle,
                background: isPrimary
                  ? vendor.accentSoft
                  : isSelected
                    ? vendor.accentSoft
                    : 'oklch(0.18 0.015 250 / 0.6)',
                border: `1.5px solid ${
                  isPrimary || isSelected ? accentBorder : 'oklch(0.32 0.02 250)'
                }`,
                boxShadow: isPrimary
                  ? `0 0 0 1px ${vendor.accent} inset, 0 0 24px -8px ${vendor.accent}`
                  : 'none',
                ...(vendor.id === 'auto'
                  ? { backgroundImage: accentBackground, backgroundClip: 'padding-box' }
                  : null),
              }}
            >
              <span style={vendorLabelStyle}>{vendor.label}</span>
              <span style={vendorModelHintStyle}>{vendor.modelHint}</span>
              <span style={vendorMetaRowStyle}>
                <span
                  style={{
                    ...vendorBadgePillStyle,
                    background:
                      vendor.liveBadge === 'live'
                        ? 'oklch(0.88 0.15 140 / 0.18)'
                        : 'oklch(0.78 0.17 55 / 0.18)',
                    color:
                      vendor.liveBadge === 'live'
                        ? 'oklch(0.88 0.15 140)'
                        : 'oklch(0.78 0.17 55)',
                  }}
                >
                  {vendor.liveBadge === 'live'
                    ? ANTHROPIC_BADGE_LABEL
                    : MOCK_BADGE_LABEL}
                </span>
                <span style={vendorCostStyle}>
                  {typeof cost === 'number' ? `$${cost.toFixed(2)}` : '--'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    );
}

interface ClaudeExecutionModePickerProps {
  mode: SekuriClaudeExecutionMode;
  onChange: (mode: SekuriClaudeExecutionMode) => void;
}

function ClaudeExecutionModePicker({
  mode,
  onChange,
}: ClaudeExecutionModePickerProps) {
  return (
    <fieldset
      style={fieldsetStyle}
      data-builder-modal-role="claude-execution-mode"
    >
      <legend style={legendStyle}>Claude execution mode</legend>
      <div style={radioRowStyle}>
        {CLAUDE_EXECUTION_MODES.map((preset) => {
          const checked = preset.id === mode;
          return (
            <label
              key={preset.id}
              style={{
                ...radioLabelStyle,
                borderColor: checked
                  ? 'oklch(0.88 0.15 140)'
                  : 'oklch(0.32 0.02 250)',
                background: checked
                  ? 'oklch(0.88 0.15 140 / 0.10)'
                  : 'oklch(0.18 0.015 250 / 0.6)',
              }}
              data-execution-mode={preset.id}
              data-checked={checked ? 'true' : 'false'}
            >
              <input
                type="radio"
                name="claude-execution-mode"
                value={preset.id}
                checked={checked}
                onChange={() => onChange(preset.id)}
                style={radioInputStyle}
              />
              <span style={radioTitleStyle}>{preset.label}</span>
              <span style={radioHintStyle}>{preset.hint}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

interface MultiVendorRoutingToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

function MultiVendorRoutingToggle({
  enabled,
  onToggle,
}: MultiVendorRoutingToggleProps) {
  return (
    <div style={toggleRowStyle} data-builder-modal-role="routing-toggle">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={onToggle}
        style={{
          ...switchTrackStyle,
          background: enabled
            ? 'oklch(0.88 0.15 140 / 0.45)'
            : 'oklch(0.32 0.02 250 / 0.6)',
          borderColor: enabled
            ? 'oklch(0.88 0.15 140)'
            : 'oklch(0.32 0.02 250)',
        }}
        data-testid="multi-vendor-routing-toggle"
      >
        <span
          style={{
            ...switchThumbStyle,
            transform: enabled ? 'translateX(18px)' : 'translateX(2px)',
            background: enabled ? 'oklch(0.88 0.15 140)' : 'oklch(0.72 0.02 250)',
          }}
        />
      </button>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={toggleLabelStyle}>Multi-vendor routing</span>
        <span style={toggleHintStyle}>
          Per-agent overrides across selected vendors. Large tier only.
        </span>
      </div>
    </div>
  );
}

interface CostEstimateProps {
  regionId: string;
  template: SekuriTemplate | null;
  templateError: string | null;
  selectedVendorIds: ReadonlyArray<BuilderVendorId>;
  totalCostUsd: number;
}

function CostEstimate({
  regionId,
  template,
  templateError,
  selectedVendorIds,
  totalCostUsd,
}: CostEstimateProps) {
  return (
    <section
      id={regionId}
      role="region"
      aria-live="polite"
      aria-label="Estimated cost across selected vendors"
      style={costEstimateStyle}
      data-builder-modal-role="cost-estimate"
    >
      <span style={costEstimateLabelStyle}>Estimated cost</span>
      {templateError ? (
        <span style={costErrorStyle}>
          Template unavailable. Cost estimate cannot be computed.
        </span>
      ) : !template ? (
        <span style={costPendingStyle}>Loading template...</span>
      ) : (
        <>
          <span style={costEstimateValueStyle}>
            ${totalCostUsd.toFixed(2)}{' '}
            <span style={costEstimateUnitStyle}>USD per build</span>
          </span>
          <span style={costEstimateBreakdownStyle}>
            Vendors: {selectedVendorIds.join(', ')}. Agents:{' '}
            {template.agent_count}. Duration: ~
            {template.estimated_duration_minutes} min.
          </span>
        </>
      )}
    </section>
  );
}

function HonestClaimFooter() {
  return (
    <p
      style={honestClaimFooterStyle}
      data-builder-modal-role="honest-claim-footer"
      role="note"
    >
      <span style={honestClaimFooterLabelStyle}>Honest-claim:</span>{' '}
      {HONEST_CLAIM_LOCKED_TEXT}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Inline styles. We avoid Tailwind utility class authoring here because the
// landing palette tokens (--nl-ink, --nl-phos, --nl-bone) live inside the
// `.nerium-landing` scope only. Using OKLCH inline keeps the modal palette
// consistent on /play and on the landing route without a class race. Future
// refactor can hoist these into a stylesheet under a dedicated CSS scope.
// ---------------------------------------------------------------------------

const FONT_DISPLAY =
  "var(--font-space-grotesk, 'Space Grotesk', system-ui, sans-serif)";
const FONT_RETRO = "var(--font-vt323, 'VT323', 'Courier New', monospace)";
const FONT_MONO =
  "var(--font-jetbrains-mono, 'JetBrains Mono', 'Courier New', monospace)";

const panelStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  width: 'min(720px, calc(100vw - 2rem))',
  maxHeight: 'calc(100vh - 2rem)',
  padding: '1.4rem 1.5rem 1.25rem',
  borderRadius: '0.75rem',
  background: 'oklch(0.14 0.012 250)',
  color: 'oklch(0.95 0.01 85)',
  border: '1px solid oklch(0.32 0.02 250)',
  boxShadow:
    '0 24px 64px -32px oklch(0.06 0.01 250 / 0.7), 0 0 0 1px oklch(0.88 0.15 140 / 0.18)',
  fontFamily: FONT_DISPLAY,
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
  color: 'oklch(0.95 0.01 85)',
};

const tierTagStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  fontFamily: FONT_MONO,
  fontSize: '11px',
  color: 'oklch(0.72 0.02 250)',
};

const tierTagPillStyle: CSSProperties = {
  padding: '0.15rem 0.5rem',
  borderRadius: '999px',
  background: 'oklch(0.78 0.17 55 / 0.16)',
  color: 'oklch(0.78 0.17 55)',
  letterSpacing: '0.18em',
  fontWeight: 700,
};

const tierTagRationaleStyle: CSSProperties = {
  letterSpacing: '0.04em',
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

const captionStyle: CSSProperties = {
  margin: 0,
  fontFamily: FONT_DISPLAY,
  fontSize: '13px',
  lineHeight: 1.5,
  color: 'oklch(0.72 0.02 250)',
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: '0.6rem',
};

const vendorBadgeBaseStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  padding: '0.7rem 0.75rem',
  borderRadius: '0.5rem',
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'background 0.15s, border-color 0.15s, box-shadow 0.18s',
  fontFamily: FONT_DISPLAY,
  color: 'oklch(0.95 0.01 85)',
  outlineOffset: '2px',
};

const vendorLabelStyle: CSSProperties = {
  fontFamily: FONT_RETRO,
  fontSize: '18px',
  letterSpacing: '0.05em',
  color: 'oklch(0.95 0.01 85)',
  lineHeight: 1.0,
};

const vendorModelHintStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '10px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'oklch(0.72 0.02 250)',
};

const vendorMetaRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: '0.25rem',
};

const vendorBadgePillStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '9px',
  textTransform: 'uppercase',
  letterSpacing: '0.18em',
  padding: '0.1rem 0.35rem',
  borderRadius: '999px',
};

const vendorCostStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '11px',
  fontVariantNumeric: 'tabular-nums',
  color: 'oklch(0.88 0.15 140)',
};

const fieldsetStyle: CSSProperties = {
  border: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

const legendStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '10px',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'oklch(0.88 0.15 140)',
  padding: 0,
};

const radioRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '0.5rem',
};

const radioLabelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  padding: '0.6rem 0.7rem',
  borderRadius: '0.5rem',
  border: '1px solid oklch(0.32 0.02 250)',
  cursor: 'pointer',
  fontFamily: FONT_DISPLAY,
};

const radioInputStyle: CSSProperties = {
  position: 'absolute',
  opacity: 0,
  pointerEvents: 'none',
};

const radioTitleStyle: CSSProperties = {
  fontFamily: FONT_RETRO,
  fontSize: '15px',
  letterSpacing: '0.04em',
  color: 'oklch(0.95 0.01 85)',
};

const radioHintStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '10px',
  letterSpacing: '0.04em',
  color: 'oklch(0.72 0.02 250)',
};

const toggleRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.6rem 0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid oklch(0.32 0.02 250)',
  background: 'oklch(0.18 0.015 250 / 0.5)',
};

const switchTrackStyle: CSSProperties = {
  position: 'relative',
  width: '38px',
  height: '20px',
  borderRadius: '999px',
  border: '1px solid',
  cursor: 'pointer',
  flexShrink: 0,
};

const switchThumbStyle: CSSProperties = {
  position: 'absolute',
  top: '1px',
  left: 0,
  width: '14px',
  height: '14px',
  borderRadius: '999px',
  transition: 'transform 0.15s, background 0.15s',
};

const toggleLabelStyle: CSSProperties = {
  fontFamily: FONT_RETRO,
  fontSize: '15px',
  letterSpacing: '0.04em',
  color: 'oklch(0.95 0.01 85)',
};

const toggleHintStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '10px',
  letterSpacing: '0.04em',
  color: 'oklch(0.72 0.02 250)',
};

const costEstimateStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  padding: '0.7rem 0.85rem',
  borderRadius: '0.5rem',
  background: 'oklch(0.18 0.015 250 / 0.55)',
  border: '1px solid oklch(0.32 0.02 250)',
};

const costEstimateLabelStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '10px',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'oklch(0.72 0.02 250)',
};

const costEstimateValueStyle: CSSProperties = {
  fontFamily: FONT_DISPLAY,
  fontSize: '1.4rem',
  fontWeight: 700,
  color: 'oklch(0.88 0.15 140)',
  fontVariantNumeric: 'tabular-nums',
};

const costEstimateUnitStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '11px',
  letterSpacing: '0.08em',
  color: 'oklch(0.72 0.02 250)',
  fontWeight: 400,
};

const costEstimateBreakdownStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '11px',
  color: 'oklch(0.72 0.02 250)',
};

const costPendingStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '12px',
  color: 'oklch(0.72 0.02 250)',
};

const costErrorStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: '12px',
  color: 'oklch(0.72 0.18 20)',
};

const honestClaimFooterStyle: CSSProperties = {
  margin: 0,
  padding: '0.55rem 0.75rem',
  borderRadius: '0.4rem',
  background: 'oklch(0.18 0.015 250 / 0.65)',
  border: '1px dashed oklch(0.32 0.02 250)',
  fontFamily: FONT_MONO,
  fontSize: '11px',
  lineHeight: 1.5,
  color: 'oklch(0.72 0.02 250)',
};

const honestClaimFooterLabelStyle: CSSProperties = {
  textTransform: 'uppercase',
  letterSpacing: '0.18em',
  fontWeight: 700,
  color: 'oklch(0.88 0.15 140)',
};

const ctaRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '0.5rem',
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

// Mobile-first responsiveness via inline media query is awkward; instead we
// inject a single style tag once at module init so the grid + radio row
// collapse on narrow viewports. This keeps the modal portable to any route
// without a stylesheet import requirement.
function MobileResponsiveStyles() {
  return (
    <style>{`
      @media (max-width: 720px) {
        [data-builder-modal-role="vendor-grid"] {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }
        [data-builder-modal-role="claude-execution-mode"] > div {
          grid-template-columns: 1fr !important;
        }
        [data-builder-modal-role="panel"] {
          padding: 1rem 1rem 0.85rem !important;
          border-radius: 0.5rem !important;
        }
      }
      [data-vendor-badge="true"]:focus-visible {
        outline: 2px solid oklch(0.88 0.15 140);
        outline-offset: 2px;
      }
    `}</style>
  );
}

export default function ModelSelectionModalWithResponsiveStyles(
  props: ModelSelectionModalProps = {},
) {
  return (
    <>
      <MobileResponsiveStyles />
      <ModelSelectionModal {...props} />
    </>
  );
}

export { useBuilderModelSelectionStore } from '../../stores/builderModelSelectionStore';
export type { BuilderVendorId } from '../../stores/builderModelSelectionStore';

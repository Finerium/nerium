//
// BlueprintReveal.tsx
//
// Conforms to: docs/contracts/blueprint_moment.contract.md v0.1.0
// Companion contracts:
//   - docs/contracts/pipeline_visualizer.contract.md v0.1.0
//   - docs/contracts/advisor_interaction.contract.md v0.1.0 (attached_components)
//
// Root React component for the Urania Blueprint Moment. Composes the
// Helios PipelineCanvas with a camera transform layer, a narration
// overlay, a generic highlight pulse layer, and the Heracles MA highlight
// treatment. Drives a virtual clock via requestAnimationFrame that
// advances only while isPlaying is true; an overrideElapsedMs prop lets
// Nemea drive deterministic snapshots per contract Section 9 testing
// surface.
//
// The NERIUM team snapshot (22 agents, 21 Opus + 1 Sonnet, one MA lane)
// is bundled as the default nodes + edges so the component renders
// standalone when the parent does not supply an explicit topology. Custom
// pipeline_run state can still be projected by passing nodes/edges props.
//
// Contract Section 8 error handling is honored:
// - Missing highlight_nodes entries: skipped silently, console.warn
// - Narration beats over the visual-line cap: truncated via narration_overlay
// - Camera sequences with invalid windows: skipped by evaluateCamera
// - isPlaying toggling mid-sequence: clock pauses, resumes from same ms
//

'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { PipelineCanvas, layoutNodes } from '../viz/PipelineCanvas';
import type { PipelineNode, PipelineEdge } from '../viz/types';
import { MaHighlight } from './ma_highlight';
import {
  evaluateCamera,
  tickVirtualClock,
  totalCameraDurationMs,
  validateCameraSequence,
} from './camera_pullback';
import {
  findActiveNarration,
  validateNarrationOverlay,
  didActiveBeatChange,
} from './narration_overlay';
import {
  BLUEPRINT_PALETTE,
  BLUEPRINT_SCENE_HEIGHT,
  BLUEPRINT_SCENE_WIDTH,
  BLUEPRINT_VIEWPORT_HEIGHT,
  BLUEPRINT_VIEWPORT_WIDTH,
  type BlueprintRevealProps,
  type NarrationState,
} from './types';

// ---------- NERIUM team snapshot ----------
// The canonical 22-agent product roster (per NERIUM_AGENT_STRUCTURE.md
// Section 1, 21 Opus 4.7 + 1 Sonnet 4.6 Cassandra exception) projected
// as PipelineNode objects. Status is 'completed' everywhere because the
// Blueprint Moment fires AFTER the live Builder run finishes, revealing
// the team that built it.
//
// Honest-claim filter: agent count (22) matches the roster verbatim.
// Model tier annotations in the label match the frontmatter on each
// Hephaestus-authored prompt file at docs/phase_0/NERIUM_AGENT_STRUCTURE.md
// Section 5 verified at authoring time. Do not inflate.

export const NERIUM_TEAM_NODES: ReadonlyArray<PipelineNode> = [
  // Advisor tier (1)
  { node_id: 'apollo', label: 'Apollo', tier: 'advisor', status: 'completed' },
  // Lead tier (5)
  { node_id: 'athena', label: 'Athena', tier: 'lead', pillar: 'builder', status: 'completed' },
  { node_id: 'demeter', label: 'Demeter', tier: 'lead', pillar: 'marketplace', status: 'completed' },
  { node_id: 'tyche', label: 'Tyche', tier: 'lead', pillar: 'banking', status: 'completed' },
  { node_id: 'hecate', label: 'Hecate', tier: 'lead', pillar: 'registry', status: 'completed' },
  { node_id: 'proteus', label: 'Proteus', tier: 'lead', pillar: 'protocol', status: 'completed' },
  // MA lane (1)
  {
    node_id: 'heracles',
    label: 'Heracles',
    tier: 'ma_lane',
    pillar: 'builder',
    status: 'completed',
    ma_session_id: 'ma_heracles_demo_run',
  },
  // Worker tier (15)
  { node_id: 'cassandra', label: 'Cassandra', tier: 'worker', pillar: 'builder', status: 'completed', confidence: 0.72 },
  { node_id: 'erato', label: 'Erato', tier: 'worker', pillar: 'builder', status: 'completed' },
  { node_id: 'helios', label: 'Helios', tier: 'worker', pillar: 'builder', status: 'completed' },
  { node_id: 'urania', label: 'Urania', tier: 'worker', pillar: 'builder', status: 'completed' },
  { node_id: 'dionysus', label: 'Dionysus', tier: 'worker', pillar: 'builder', status: 'completed' },
  { node_id: 'thalia', label: 'Thalia', tier: 'worker', pillar: 'builder', status: 'completed' },
  { node_id: 'eos', label: 'Eos', tier: 'worker', pillar: 'marketplace', status: 'completed' },
  { node_id: 'artemis', label: 'Artemis', tier: 'worker', pillar: 'marketplace', status: 'completed' },
  { node_id: 'coeus', label: 'Coeus', tier: 'worker', pillar: 'marketplace', status: 'completed' },
  { node_id: 'dike', label: 'Dike', tier: 'worker', pillar: 'banking', status: 'completed' },
  { node_id: 'rhea', label: 'Rhea', tier: 'worker', pillar: 'banking', status: 'completed' },
  { node_id: 'phoebe', label: 'Phoebe', tier: 'worker', pillar: 'registry', status: 'completed' },
  { node_id: 'triton', label: 'Triton', tier: 'worker', pillar: 'protocol', status: 'completed' },
  { node_id: 'morpheus', label: 'Morpheus', tier: 'worker', pillar: 'protocol', status: 'completed' },
  { node_id: 'harmonia', label: 'Harmonia', tier: 'worker', status: 'completed' },
];

export const NERIUM_TEAM_EDGES: ReadonlyArray<PipelineEdge> = [
  // Leads -> Apollo (convergence)
  { from_node_id: 'athena', to_node_id: 'apollo', kind: 'handoff', is_active: false },
  { from_node_id: 'demeter', to_node_id: 'apollo', kind: 'handoff', is_active: false },
  { from_node_id: 'tyche', to_node_id: 'apollo', kind: 'handoff', is_active: false },
  { from_node_id: 'hecate', to_node_id: 'apollo', kind: 'handoff', is_active: false },
  { from_node_id: 'proteus', to_node_id: 'apollo', kind: 'handoff', is_active: false },
  // Athena -> Builder core workers
  { from_node_id: 'athena', to_node_id: 'erato', kind: 'handoff', is_active: false },
  { from_node_id: 'athena', to_node_id: 'helios', kind: 'handoff', is_active: false },
  { from_node_id: 'athena', to_node_id: 'cassandra', kind: 'handoff', is_active: false },
  { from_node_id: 'athena', to_node_id: 'heracles', kind: 'ma_bridge', is_active: false },
  // Apollo -> Erato (UI embed)
  { from_node_id: 'apollo', to_node_id: 'erato', kind: 'handoff', is_active: false },
  // Cassandra prediction loop back to Apollo
  { from_node_id: 'cassandra', to_node_id: 'apollo', kind: 'dependency', is_active: false },
  // Demeter -> Marketplace workers
  { from_node_id: 'demeter', to_node_id: 'eos', kind: 'handoff', is_active: false },
  { from_node_id: 'demeter', to_node_id: 'artemis', kind: 'handoff', is_active: false },
  { from_node_id: 'demeter', to_node_id: 'coeus', kind: 'handoff', is_active: false },
  // Tyche -> Banking workers
  { from_node_id: 'tyche', to_node_id: 'dike', kind: 'handoff', is_active: false },
  { from_node_id: 'tyche', to_node_id: 'rhea', kind: 'handoff', is_active: false },
  // Tyche + Hecate -> Heracles (metering + identity)
  { from_node_id: 'tyche', to_node_id: 'heracles', kind: 'dependency', is_active: false },
  { from_node_id: 'hecate', to_node_id: 'heracles', kind: 'dependency', is_active: false },
  // Hecate -> Phoebe
  { from_node_id: 'hecate', to_node_id: 'phoebe', kind: 'handoff', is_active: false },
  // Apollo + Helios -> Urania (Blueprint Moment dependency)
  { from_node_id: 'apollo', to_node_id: 'urania', kind: 'handoff', is_active: false },
  { from_node_id: 'helios', to_node_id: 'urania', kind: 'handoff', is_active: false },
  // Athena + Heracles -> Dionysus (Lumio bake)
  { from_node_id: 'athena', to_node_id: 'dionysus', kind: 'handoff', is_active: false },
  { from_node_id: 'heracles', to_node_id: 'dionysus', kind: 'ma_bridge', is_active: false },
  // Proteus -> Protocol workers
  { from_node_id: 'proteus', to_node_id: 'triton', kind: 'handoff', is_active: false },
  { from_node_id: 'proteus', to_node_id: 'morpheus', kind: 'handoff', is_active: false },
  // Erato -> Morpheus (vendor adapter UI plug-in)
  { from_node_id: 'erato', to_node_id: 'morpheus', kind: 'handoff', is_active: false },
  // Cross-cutting fan-in to Harmonia
  { from_node_id: 'urania', to_node_id: 'harmonia', kind: 'dependency', is_active: false },
  { from_node_id: 'dionysus', to_node_id: 'harmonia', kind: 'dependency', is_active: false },
  { from_node_id: 'thalia', to_node_id: 'harmonia', kind: 'handoff', is_active: false },
  { from_node_id: 'triton', to_node_id: 'harmonia', kind: 'dependency', is_active: false },
  { from_node_id: 'morpheus', to_node_id: 'harmonia', kind: 'dependency', is_active: false },
  { from_node_id: 'eos', to_node_id: 'harmonia', kind: 'dependency', is_active: false },
  { from_node_id: 'artemis', to_node_id: 'harmonia', kind: 'dependency', is_active: false },
  { from_node_id: 'coeus', to_node_id: 'harmonia', kind: 'dependency', is_active: false },
  { from_node_id: 'dike', to_node_id: 'harmonia', kind: 'dependency', is_active: false },
  { from_node_id: 'rhea', to_node_id: 'harmonia', kind: 'dependency', is_active: false },
  { from_node_id: 'phoebe', to_node_id: 'harmonia', kind: 'dependency', is_active: false },
];

// ---------- Component ----------

export function BlueprintReveal(
  props: BlueprintRevealProps,
): React.JSX.Element {
  const {
    definition,
    pipeline_run_id,
    onComplete,
    isPlaying,
    nodes: nodesProp,
    edges: edgesProp,
    consoleDeepLinks,
    width = BLUEPRINT_VIEWPORT_WIDTH,
    height = BLUEPRINT_VIEWPORT_HEIGHT,
    overrideElapsedMs,
    onBeatChange,
    className,
  } = props;

  const nodes = nodesProp ?? NERIUM_TEAM_NODES;
  const edges = edgesProp ?? NERIUM_TEAM_EDGES;
  const consoleDeepLinksResolved = consoleDeepLinks ?? EMPTY_DEEP_LINKS;

  // Run validators once per definition change. Non-blocking: issues are
  // logged as console.warn per contract Section 8 but the reveal still
  // attempts playback, skipping malformed entries internally.
  React.useEffect(() => {
    const cameraIssues = validateCameraSequence(definition.camera_sequence);
    const narrationIssues = validateNarrationOverlay(definition.narration_overlay);
    for (const issue of cameraIssues) {
      // eslint-disable-next-line no-console
      console.warn(
        `[BlueprintReveal] camera_sequence[${issue.index}] ${issue.severity}: ${issue.message}`,
      );
    }
    for (const issue of narrationIssues) {
      // eslint-disable-next-line no-console
      console.warn(
        `[BlueprintReveal] narration_overlay[${issue.index}] ${issue.severity}: ${issue.message}`,
      );
    }
    for (const nodeId of definition.highlight_nodes) {
      if (!nodes.some((n) => n.node_id === nodeId)) {
        // eslint-disable-next-line no-console
        console.warn(
          `[BlueprintReveal] highlight_nodes entry "${nodeId}" not present in snapshot; skipping`,
        );
      }
    }
  }, [definition, nodes]);

  // Virtual clock. Two modes:
  //   - overrideElapsedMs defined: clock is externally driven, bypass rAF
  //   - overrideElapsedMs undefined: internal rAF loop advances while
  //     isPlaying is true, pauses otherwise (preserves elapsedMs).
  const [elapsedMs, setElapsedMs] = React.useState<number>(0);
  const elapsedRef = React.useRef<number>(0);
  const prevRafTimestampRef = React.useRef<number | null>(null);
  const rafHandleRef = React.useRef<number | null>(null);

  // Keep ref + state in sync so the rAF loop reads the freshest value
  // without re-triggering itself on every render.
  React.useEffect(() => {
    elapsedRef.current = elapsedMs;
  }, [elapsedMs]);

  React.useEffect(() => {
    if (typeof overrideElapsedMs === 'number') {
      setElapsedMs(overrideElapsedMs);
      return undefined;
    }
    // Cancel any previously scheduled frame when isPlaying toggles so we
    // do not double-schedule after pause/resume.
    if (rafHandleRef.current !== null) {
      cancelRafSafe(rafHandleRef.current);
      rafHandleRef.current = null;
    }
    prevRafTimestampRef.current = null;
    if (!isPlaying) return undefined;

    let cancelled = false;
    const loop = (timestamp: number): void => {
      if (cancelled) return;
      const tick = tickVirtualClock({
        previousElapsedMs: elapsedRef.current,
        previousTimestamp: prevRafTimestampRef.current,
        currentTimestamp: timestamp,
        isPlaying: true,
      });
      prevRafTimestampRef.current = tick.nextTimestamp;
      if (tick.elapsedMs !== elapsedRef.current) {
        elapsedRef.current = tick.elapsedMs;
        setElapsedMs(tick.elapsedMs);
      }
      rafHandleRef.current = scheduleRafSafe(loop);
    };
    rafHandleRef.current = scheduleRafSafe(loop);
    return () => {
      cancelled = true;
      if (rafHandleRef.current !== null) {
        cancelRafSafe(rafHandleRef.current);
        rafHandleRef.current = null;
      }
    };
  }, [isPlaying, overrideElapsedMs]);

  // Resolve effective clock value. Override beats internal state.
  const effectiveElapsedMs =
    typeof overrideElapsedMs === 'number' ? overrideElapsedMs : elapsedMs;

  const cameraState = React.useMemo(
    () => evaluateCamera(definition.camera_sequence, effectiveElapsedMs),
    [definition.camera_sequence, effectiveElapsedMs],
  );

  const narrationState = React.useMemo(
    () => findActiveNarration(definition.narration_overlay, effectiveElapsedMs),
    [definition.narration_overlay, effectiveElapsedMs],
  );

  // Beat change hook, fires on transitions only.
  const prevNarrationRef = React.useRef<NarrationState>({
    activeBeatIndex: null,
    activeText: null,
    activeTextTruncated: false,
  });
  React.useEffect(() => {
    if (didActiveBeatChange(prevNarrationRef.current, narrationState)) {
      prevNarrationRef.current = narrationState;
      onBeatChange?.(narrationState.activeBeatIndex);
    }
  }, [narrationState, onBeatChange]);

  // onComplete fires exactly once when the camera sequence completes.
  // Guard with a ref so re-renders do not re-fire.
  const completedRef = React.useRef<boolean>(false);
  React.useEffect(() => {
    if (cameraState.completed && !completedRef.current) {
      completedRef.current = true;
      onComplete();
    }
  }, [cameraState.completed, onComplete]);

  // Layout for highlight overlay positioning. Same dimensions fed to the
  // inner PipelineCanvas so coordinates align 1:1.
  const layout = React.useMemo(
    () => layoutNodes(nodes, BLUEPRINT_SCENE_WIDTH, BLUEPRINT_SCENE_HEIGHT, 'expanded'),
    [nodes],
  );

  const heraclesLayout = layout.get('heracles');
  const heraclesNode = nodes.find((n) => n.node_id === 'heracles');
  const heraclesDeepLink = heraclesNode?.ma_session_id
    ? consoleDeepLinksResolved[heraclesNode.ma_session_id]
    : undefined;

  const cameraIntensity = cameraState.totalDurationMs > 0
    ? clampIntensity(cameraState.totalElapsedMs / cameraState.totalDurationMs)
    : 1;

  const maHighlightActive =
    definition.highlight_nodes.includes('heracles') && cameraIntensity > 0.12;

  return (
    <div
      className={className}
      data-blueprint-moment-id={definition.moment_id}
      data-blueprint-run-id={pipeline_run_id}
      data-blueprint-playing={isPlaying ? 'true' : 'false'}
      data-blueprint-elapsed-ms={Math.round(effectiveElapsedMs)}
      data-blueprint-completed={cameraState.completed ? 'true' : 'false'}
      style={{
        position: 'relative',
        width,
        height,
        overflow: 'hidden',
        borderRadius: 12,
        background: `radial-gradient(circle at 20% 20%, rgba(139, 92, 246, 0.12), transparent 55%), radial-gradient(circle at 80% 80%, rgba(255, 46, 136, 0.08), transparent 60%), ${BLUEPRINT_PALETTE.bg_0}`,
        border: `1px solid rgba(0, 240, 255, 0.22)`,
        boxShadow: '0 0 50px rgba(0, 240, 255, 0.15)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <motion.div
          style={{
            width: BLUEPRINT_SCENE_WIDTH,
            height: BLUEPRINT_SCENE_HEIGHT,
            position: 'relative',
            transformOrigin: 'center center',
          }}
          animate={{ scale: cameraState.zoom }}
          transition={{
            type: 'tween',
            duration: 0,
          }}
        >
          <PipelineCanvas
            pipeline_run_id={pipeline_run_id}
            nodes={nodes}
            edges={edges}
            view_mode="expanded"
            consoleDeepLinks={consoleDeepLinksResolved}
            showConfidenceOverlay={false}
            width={BLUEPRINT_SCENE_WIDTH}
            height={BLUEPRINT_SCENE_HEIGHT}
          />
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
            }}
          >
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${BLUEPRINT_SCENE_WIDTH} ${BLUEPRINT_SCENE_HEIGHT}`}
              style={{ display: 'block' }}
            >
              {/* Generic highlight pulses for non-MA nodes in highlight_nodes */}
              {definition.highlight_nodes
                .filter((id) => id !== 'heracles')
                .map((nodeId) => {
                  const position = layout.get(nodeId);
                  if (!position) return null;
                  return (
                    <HighlightPulse
                      key={nodeId}
                      x={position.x}
                      y={position.y}
                      radius={position.radius}
                      intensity={cameraIntensity}
                      accentColor={accentColorForNode(nodeId)}
                    />
                  );
                })}

              {/* Heracles MA highlight */}
              {heraclesLayout ? (
                <MaHighlight
                  x={heraclesLayout.x}
                  y={heraclesLayout.y}
                  radius={heraclesLayout.radius}
                  maSessionId={heraclesNode?.ma_session_id}
                  consoleDeepLinkUrl={heraclesDeepLink}
                  intensity={cameraIntensity}
                  isActive={maHighlightActive}
                />
              ) : null}
            </svg>
          </div>
        </motion.div>
      </div>

      <NarrationOverlayChip
        text={narrationState.activeText}
        truncated={narrationState.activeTextTruncated}
      />

      <TimelineMeta
        elapsedMs={effectiveElapsedMs}
        totalMs={cameraState.totalDurationMs}
        momentId={definition.moment_id}
      />
    </div>
  );
}

// ---------- Sub-components ----------

interface HighlightPulseProps {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly intensity: number;
  readonly accentColor: string;
}

function HighlightPulse(props: HighlightPulseProps): React.JSX.Element {
  const { x, y, radius, intensity, accentColor } = props;
  const ringRadius = radius + 10 + intensity * 6;
  return (
    <motion.g
      transform={`translate(${x}, ${y})`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.25 + intensity * 0.55 }}
      transition={{ duration: 0.5 }}
    >
      <motion.circle
        r={ringRadius}
        fill="none"
        stroke={accentColor}
        strokeOpacity={0.7}
        strokeWidth={2}
        animate={{
          scale: [1, 1.05, 1],
          opacity: [0.35, 0.75, 0.35],
        }}
        transition={{
          duration: 2.2,
          repeat: Infinity,
          ease: 'easeInOut' as const,
        }}
      />
    </motion.g>
  );
}

interface NarrationOverlayChipProps {
  readonly text: string | null;
  readonly truncated: boolean;
}

function NarrationOverlayChip(
  props: NarrationOverlayChipProps,
): React.JSX.Element | null {
  const { text, truncated } = props;
  if (!text) return null;
  return (
    <motion.div
      key={text}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      role="note"
      aria-live="polite"
      data-narration-truncated={truncated ? 'true' : 'false'}
      style={{
        position: 'absolute',
        bottom: 20,
        left: 20,
        right: 20,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          maxWidth: 760,
          padding: '10px 18px',
          borderRadius: 10,
          background: 'rgba(6, 6, 12, 0.82)',
          border: `1px solid rgba(0, 240, 255, 0.35)`,
          backdropFilter: 'blur(6px)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.55), 0 0 24px rgba(0, 240, 255, 0.18)',
          color: BLUEPRINT_PALETTE.ink,
          fontFamily: "'Share Tech Mono', ui-monospace, SFMono-Regular, monospace",
          fontSize: 14,
          lineHeight: 1.45,
          letterSpacing: 0.6,
          textAlign: 'center',
          whiteSpace: 'pre-wrap',
        }}
      >
        {text}
      </div>
    </motion.div>
  );
}

interface TimelineMetaProps {
  readonly elapsedMs: number;
  readonly totalMs: number;
  readonly momentId: string;
}

function TimelineMeta(props: TimelineMetaProps): React.JSX.Element {
  const { elapsedMs, totalMs, momentId } = props;
  const seconds = Math.max(0, elapsedMs) / 1000;
  const totalSeconds = Math.max(0, totalMs) / 1000;
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 12,
        left: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        color: BLUEPRINT_PALETTE.ink_dim,
        fontFamily: "'Share Tech Mono', ui-monospace, SFMono-Regular, monospace",
        fontSize: 10,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
      }}
    >
      <span style={{ color: BLUEPRINT_PALETTE.cyan }}>Blueprint Reveal</span>
      <span>//</span>
      <span>{momentId}</span>
      <span>//</span>
      <span>
        {seconds.toFixed(1)}s / {totalSeconds.toFixed(1)}s
      </span>
    </div>
  );
}

// ---------- Helpers ----------

const EMPTY_DEEP_LINKS: Record<string, string> = {};

function clampIntensity(v: number): number {
  if (!Number.isFinite(v) || Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function accentColorForNode(nodeId: string): string {
  // Apollo = advisor (gold), leads = cyan, builder workers = purple,
  // Cassandra Sonnet exception = gold_hot, everyone else = cyan.
  switch (nodeId) {
    case 'apollo':
      return BLUEPRINT_PALETTE.gold;
    case 'athena':
    case 'demeter':
    case 'tyche':
    case 'hecate':
    case 'proteus':
      return BLUEPRINT_PALETTE.cyan;
    case 'cassandra':
      return BLUEPRINT_PALETTE.gold_hot;
    default:
      return BLUEPRINT_PALETTE.purple;
  }
}

function scheduleRafSafe(cb: (timestamp: number) => void): number {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    // SSR or non-browser environment. Fall back to an immediate 16ms
    // timeout so the clock still advances during tests.
    const handle = setTimeout(() => cb(Date.now()), 16);
    return handle as unknown as number;
  }
  return window.requestAnimationFrame(cb);
}

function cancelRafSafe(handle: number): void {
  if (typeof window === 'undefined' || typeof window.cancelAnimationFrame !== 'function') {
    clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
    return;
  }
  window.cancelAnimationFrame(handle);
}

// ---------- Exports for downstream reuse ----------

export { totalCameraDurationMs };
export default BlueprintReveal;

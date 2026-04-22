//
// PipelineCanvas.tsx
//
// Conforms to: docs/contracts/pipeline_visualizer.contract.md v0.1.0
// Companion contracts:
//   - docs/contracts/event_bus.contract.md v0.1.0
//   - docs/contracts/managed_agent_executor.contract.md v0.1.0
//
// Live Builder pipeline visualizer. Hero demo-moment surface. Accepts an
// initial `nodes` / `edges` snapshot plus a live event bus; internally keeps
// the snapshot in sync by consuming the canonical pipeline event stream.
// Zustand slice is exported for tests and for Urania Blueprint Moment reuse
// (contract Section 11).
//
// Rendering is pure SVG. Keeps the canvas deterministic for Nemea regression
// snapshots and avoids the Pixi bootstrap cost during hackathon scope. Pixi
// can slot in later per contract Section 11.
//

'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { create } from 'zustand';
import type {
  EventBus,
  PipelineEvent,
  HandoffPayload,
  StepStartedPayload,
  StepCompletedPayload,
  ToolUsePayload,
  Unsubscribe,
} from '../../shared/events/pipeline_event';
import type {
  PipelineCanvasProps,
  PipelineNode,
  PipelineEdge,
  NodeStatus,
  ViewMode,
  ToolUseEntry,
} from './types';
import { AgentNode } from './AgentNode';
import { HandoffEdge } from './HandoffEdge';
import { ToolUseTicker, useToolUseRingBuffer } from './ToolUseTicker';
import { MAConsoleDeepLink } from './MAConsoleDeepLink';
import { CONFIDENCE_OVERLAY_FADE_MS } from './confidence_overlay';

// Cassandra's canonical `pipeline.prediction.emitted` payload shape (see
// app/builder/prediction/cassandra.ts line 491). Uses a nested confidence_map
// with per-specialist entries. The flatter `PredictionEmittedPayload` in
// handoff_events.ts is a sibling shape that Apollo-side emitters may publish;
// the subscriber tolerates both. Shape drift is tracked as an open item in
// docs/helios.decisions.md ADR-05.
type PredictionSpecialistEntry = {
  readonly specialist_id: string;
  readonly confidence_score: number;
};

type PredictionConfidenceMap = {
  readonly pipeline_run_id?: string;
  readonly overall_pipeline_confidence?: number;
  readonly per_specialist?: ReadonlyArray<PredictionSpecialistEntry>;
};

type PredictionEmittedLike =
  | {
      readonly confidence_map?: PredictionConfidenceMap;
    }
  | {
      readonly confidence?: number;
    };

interface PipelineStoreState {
  readonly run_id: string;
  readonly nodes: ReadonlyArray<PipelineNode>;
  readonly edges: ReadonlyArray<PipelineEdge>;
  readonly view_mode: ViewMode;
  readonly connection_detail: string | undefined;
  hydrate: (
    run_id: string,
    nodes: ReadonlyArray<PipelineNode>,
    edges: ReadonlyArray<PipelineEdge>,
    view_mode: ViewMode,
  ) => void;
  setViewMode: (mode: ViewMode) => void;
  applyStepStarted: (source_agent: string, payload: StepStartedPayload) => void;
  applyStepCompleted: (
    source_agent: string,
    payload: StepCompletedPayload,
  ) => void;
  applyStepFailed: (source_agent: string) => void;
  applyToolUse: (source_agent: string, payload: ToolUsePayload) => void;
  applyHandoff: (payload: HandoffPayload) => void;
  applyPrediction: (source_agent: string, confidence: number) => void;
  setConnectionDetail: (detail: string | undefined) => void;
}

// Factory so tests can create an isolated store per render.
export function createPipelineStore(
  initial: Pick<PipelineStoreState, 'run_id' | 'nodes' | 'edges' | 'view_mode'>,
) {
  return create<PipelineStoreState>((set) => ({
    ...initial,
    connection_detail: undefined,
    hydrate: (run_id, nodes, edges, view_mode) =>
      set({ run_id, nodes, edges, view_mode, connection_detail: undefined }),
    setViewMode: (mode) => set({ view_mode: mode }),
    applyStepStarted: (source_agent) =>
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.node_id === source_agent
            ? { ...node, status: 'active' satisfies NodeStatus }
            : node,
        ),
      })),
    applyStepCompleted: (source_agent, payload) =>
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.node_id === source_agent
            ? {
                ...node,
                status: 'completed' satisfies NodeStatus,
                tokens_consumed:
                  payload.tokens_consumed.input + payload.tokens_consumed.output,
                cost_usd: payload.cost_usd,
                current_tool_call: undefined,
              }
            : node,
        ),
      })),
    applyStepFailed: (source_agent) =>
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.node_id === source_agent
            ? { ...node, status: 'failed' satisfies NodeStatus }
            : node,
        ),
      })),
    applyToolUse: (source_agent, payload) =>
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.node_id === source_agent
            ? { ...node, current_tool_call: payload.tool_name }
            : node,
        ),
      })),
    applyHandoff: (payload) =>
      set((state) => ({
        edges: state.edges.map((edge) =>
          edge.from_node_id === payload.from_specialist &&
          edge.to_node_id === payload.to_specialist
            ? { ...edge, is_active: true }
            : edge,
        ),
      })),
    applyPrediction: (source_agent, confidence) =>
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.node_id === source_agent ? { ...node, confidence } : node,
        ),
      })),
    setConnectionDetail: (detail) => set({ connection_detail: detail }),
  }));
}

export interface PipelineCanvasLiveProps extends PipelineCanvasProps {
  // Bus plus run id are optional: omit them to render a static snapshot
  // (Storybook, Blueprint Moment static pullback, Nemea golden file).
  readonly bus?: EventBus;
  readonly width?: number;
  readonly height?: number;
  readonly reconnecting?: boolean;
}

export function PipelineCanvas(
  props: PipelineCanvasLiveProps,
): React.JSX.Element {
  const {
    pipeline_run_id,
    nodes: nodesProp,
    edges: edgesProp,
    view_mode: viewModeProp,
    onNodeClick,
    consoleDeepLinks,
    showConfidenceOverlay,
    className,
    bus,
    width = 960,
    height = 560,
    reconnecting = false,
  } = props;

  const storeRef = React.useRef<
    ReturnType<typeof createPipelineStore> | null
  >(null);
  if (storeRef.current === null) {
    storeRef.current = createPipelineStore({
      run_id: pipeline_run_id,
      nodes: nodesProp,
      edges: edgesProp,
      view_mode: viewModeProp,
    });
  }
  const store = storeRef.current;

  // Re-hydrate when parent snapshot changes (e.g., Advisor starts a new run).
  React.useEffect(() => {
    store.getState().hydrate(pipeline_run_id, nodesProp, edgesProp, viewModeProp);
  }, [store, pipeline_run_id, nodesProp, edgesProp, viewModeProp]);

  const nodes = store((state) => state.nodes);
  const edges = store((state) => state.edges);
  const view_mode = store((state) => state.view_mode);
  const setViewMode = store((state) => state.setViewMode);

  useBusSubscription(bus, pipeline_run_id, store);

  const systemReduceMotion = useReducedMotion();
  const reduceMotion = systemReduceMotion === true;
  const layout = React.useMemo(
    () => layoutNodes(nodes, width, height, view_mode),
    [nodes, width, height, view_mode],
  );
  const activeMaNode = React.useMemo(
    () => nodes.find((n) => n.tier === 'ma_lane') ?? undefined,
    [nodes],
  );

  const toolUseEntries = useToolUseRingBuffer(bus, pipeline_run_id, 16);
  const presentedEntries = React.useMemo<ReadonlyArray<ToolUseEntry>>(
    () => toolUseEntries,
    [toolUseEntries],
  );

  return (
    <div
      className={className}
      data-pipeline-run-id={pipeline_run_id}
      data-view-mode={view_mode}
      style={{
        position: 'relative',
        width,
        borderRadius: 12,
        background:
          'radial-gradient(circle at 20% 20%, rgba(139, 92, 246, 0.08), transparent 60%), radial-gradient(circle at 80% 80%, rgba(0, 240, 255, 0.08), transparent 60%), #06060c',
        border: '1px solid rgba(0, 240, 255, 0.18)',
        overflow: 'hidden',
        padding: 12,
      }}
    >
      <CanvasHeader
        view_mode={view_mode}
        onToggleViewMode={() =>
          setViewMode(view_mode === 'expanded' ? 'compact' : 'expanded')
        }
        reconnecting={reconnecting}
        ma_session_id={activeMaNode?.ma_session_id}
        consoleDeepLinks={consoleDeepLinks}
      />
      <svg
        role="img"
        aria-label="Live Builder pipeline visualization"
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block', marginTop: 8 }}
      >
        <defs>
          <radialGradient id="nerium-bg-glow" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#0f1222" />
            <stop offset="100%" stopColor="#06060c" />
          </radialGradient>
        </defs>
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="url(#nerium-bg-glow)"
        />
        <g data-layer="edges">
          {edges.map((edge) => {
            const from = layout.get(edge.from_node_id);
            const to = layout.get(edge.to_node_id);
            if (!from || !to) return null;
            return (
              <HandoffEdge
                key={`${edge.from_node_id}->${edge.to_node_id}-${edge.kind}`}
                edge={edge}
                from={{ x: from.x, y: from.y }}
                to={{ x: to.x, y: to.y }}
                reduceMotion={reduceMotion}
              />
            );
          })}
        </g>
        <g data-layer="nodes">
          {nodes.map((node) => {
            const position = layout.get(node.node_id);
            if (!position) return null;
            return (
              <NodeErrorBoundary key={node.node_id} node_id={node.node_id}>
                <AgentNode
                  node={node}
                  x={position.x}
                  y={position.y}
                  radius={position.radius}
                  showConfidenceOverlay={showConfidenceOverlay}
                  consoleDeepLink={
                    node.ma_session_id
                      ? consoleDeepLinks[node.ma_session_id]
                      : undefined
                  }
                  onClick={onNodeClick}
                  reduceMotion={reduceMotion}
                />
              </NodeErrorBoundary>
            );
          })}
        </g>
      </svg>
      <motion.div
        initial={false}
        animate={{
          opacity: showConfidenceOverlay ? 1 : 0.5,
        }}
        transition={{ duration: CONFIDENCE_OVERLAY_FADE_MS / 1000 }}
        style={{ marginTop: 10 }}
      >
        <ToolUseTicker
          pipeline_run_id={pipeline_run_id}
          max_visible_entries={6}
          entries={presentedEntries}
        />
      </motion.div>
    </div>
  );
}

function CanvasHeader(props: {
  readonly view_mode: ViewMode;
  readonly onToggleViewMode: () => void;
  readonly reconnecting: boolean;
  readonly ma_session_id: string | undefined;
  readonly consoleDeepLinks: Record<string, string>;
}): React.JSX.Element {
  const { view_mode, onToggleViewMode, reconnecting, ma_session_id, consoleDeepLinks } =
    props;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular',
            fontSize: 10,
            letterSpacing: 1.2,
            color: '#00f0ff',
            textTransform: 'uppercase',
          }}
        >
          Live Pipeline
        </span>
        {reconnecting ? (
          <span
            role="status"
            aria-live="polite"
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular',
              fontSize: 10,
              letterSpacing: 1,
              color: '#ffb300',
              textTransform: 'uppercase',
              border: '1px solid rgba(255, 179, 0, 0.55)',
              padding: '2px 6px',
              borderRadius: 4,
            }}
          >
            reconnecting
          </span>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <MAConsoleDeepLink
          ma_session_id={ma_session_id}
          consoleDeepLinks={consoleDeepLinks}
        />
        <button
          type="button"
          onClick={onToggleViewMode}
          aria-label={`Switch to ${view_mode === 'expanded' ? 'compact' : 'expanded'} view`}
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular',
            fontSize: 10,
            letterSpacing: 1,
            color: '#e6ecff',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: 6,
            padding: '6px 10px',
            cursor: 'pointer',
            textTransform: 'uppercase',
          }}
        >
          {view_mode === 'expanded' ? 'compact' : 'expanded'}
        </button>
      </div>
    </div>
  );
}

// Subscribes the canvas store to the canonical event bus. Lives here (not in
// stream_subscriber) because the store is internal to the React tree; stream
// subscriber owns transport-level reconnect, this hook owns state reducer.
function useBusSubscription(
  bus: EventBus | undefined,
  pipeline_run_id: string,
  store: ReturnType<typeof createPipelineStore>,
): void {
  React.useEffect(() => {
    if (!bus) return;
    const unsubscribers: Unsubscribe[] = [];

    unsubscribers.push(
      bus.subscribe<StepStartedPayload>(
        'pipeline.step.started',
        (event: PipelineEvent<StepStartedPayload>) => {
          if (event.pipeline_run_id !== pipeline_run_id) return;
          store.getState().applyStepStarted(event.source_agent, event.payload);
        },
      ),
    );
    unsubscribers.push(
      bus.subscribe<StepCompletedPayload>(
        'pipeline.step.completed',
        (event: PipelineEvent<StepCompletedPayload>) => {
          if (event.pipeline_run_id !== pipeline_run_id) return;
          store
            .getState()
            .applyStepCompleted(event.source_agent, event.payload);
        },
      ),
    );
    unsubscribers.push(
      bus.subscribe<{ specialist_id: string }>(
        'pipeline.step.failed',
        (event) => {
          if (event.pipeline_run_id !== pipeline_run_id) return;
          store.getState().applyStepFailed(event.source_agent);
        },
      ),
    );
    unsubscribers.push(
      bus.subscribe<ToolUsePayload>(
        'pipeline.step.tool_use',
        (event: PipelineEvent<ToolUsePayload>) => {
          if (event.pipeline_run_id !== pipeline_run_id) return;
          store.getState().applyToolUse(event.source_agent, event.payload);
        },
      ),
    );
    unsubscribers.push(
      bus.subscribe<HandoffPayload>(
        'pipeline.handoff',
        (event: PipelineEvent<HandoffPayload>) => {
          if (event.pipeline_run_id !== pipeline_run_id) return;
          store.getState().applyHandoff(event.payload);
        },
      ),
    );
    unsubscribers.push(
      bus.subscribe<PredictionEmittedLike>(
        'pipeline.prediction.emitted',
        (event) => {
          if (event.pipeline_run_id !== pipeline_run_id) return;
          const payload = event.payload;
          const state = store.getState();
          if (
            payload &&
            typeof payload === 'object' &&
            'confidence_map' in payload &&
            payload.confidence_map
          ) {
            const map = payload.confidence_map;
            if (Array.isArray(map.per_specialist)) {
              for (const entry of map.per_specialist) {
                if (
                  entry &&
                  typeof entry.specialist_id === 'string' &&
                  typeof entry.confidence_score === 'number'
                ) {
                  state.applyPrediction(
                    entry.specialist_id,
                    entry.confidence_score,
                  );
                }
              }
              return;
            }
          }
          if (
            payload &&
            typeof payload === 'object' &&
            'confidence' in payload &&
            typeof payload.confidence === 'number'
          ) {
            state.applyPrediction(event.source_agent, payload.confidence);
          }
        },
      ),
    );

    return () => {
      for (const unsubscribe of unsubscribers) {
        try {
          unsubscribe();
        } catch {
          // Safe to ignore: bus guarantees unsubscribe idempotency.
        }
      }
    };
  }, [bus, pipeline_run_id, store]);
}

// Simple tier-based ring layout. Tiers stack top-to-bottom (advisor on top,
// leads, ma_lane, workers at the bottom). Within a tier, nodes are evenly
// spread across the width. Good enough for 22 nodes with the Lumio topology
// per contract Section 11.
export function layoutNodes(
  nodes: ReadonlyArray<PipelineNode>,
  width: number,
  height: number,
  view_mode: ViewMode,
): Map<string, { x: number; y: number; radius: number }> {
  const rows: Record<string, PipelineNode[]> = {
    advisor: [],
    lead: [],
    ma_lane: [],
    worker: [],
  };
  for (const node of nodes) {
    (rows[node.tier] ?? rows.worker).push(node);
  }
  const tierOrder: Array<keyof typeof rows> = [
    'advisor',
    'lead',
    'ma_lane',
    'worker',
  ];
  const yPadding = 48;
  const xPadding = 36;
  const layout = new Map<string, { x: number; y: number; radius: number }>();
  const nonEmptyTiers = tierOrder.filter((tier) => rows[tier].length > 0);
  const rowCount = Math.max(1, nonEmptyTiers.length);
  const rowHeight = (height - yPadding * 2) / rowCount;
  const baseRadius = view_mode === 'compact' ? 18 : 26;

  nonEmptyTiers.forEach((tier, rowIndex) => {
    const y = yPadding + rowHeight * rowIndex + rowHeight / 2;
    const tierNodes = rows[tier];
    const colCount = Math.max(1, tierNodes.length);
    const columnWidth = (width - xPadding * 2) / colCount;
    tierNodes.forEach((node, colIndex) => {
      const x = xPadding + columnWidth * colIndex + columnWidth / 2;
      const radius = tier === 'ma_lane' ? baseRadius + 4 : baseRadius;
      layout.set(node.node_id, { x, y, radius });
    });
  });

  return layout;
}

interface NodeErrorBoundaryProps {
  readonly children: React.ReactNode;
  readonly node_id: string;
}

interface NodeErrorBoundaryState {
  readonly errored: boolean;
}

// Error boundary per contract Section 8: a single AgentNode render crash is
// contained and renders a red placeholder in place of the node, without
// taking down siblings.
class NodeErrorBoundary extends React.Component<
  NodeErrorBoundaryProps,
  NodeErrorBoundaryState
> {
  constructor(props: NodeErrorBoundaryProps) {
    super(props);
    this.state = { errored: false };
  }

  static getDerivedStateFromError(): NodeErrorBoundaryState {
    return { errored: true };
  }

  componentDidCatch(error: Error): void {
    // Surface to console; Nemea may attach a listener to fail regression runs.
    // eslint-disable-next-line no-console
    console.error(
      `[PipelineCanvas] node render failure for ${this.props.node_id}`,
      error,
    );
  }

  handleRetry = (): void => {
    this.setState({ errored: false });
  };

  render(): React.ReactNode {
    if (!this.state.errored) return this.props.children;
    return (
      <g
        role="button"
        tabIndex={0}
        aria-label={`Node ${this.props.node_id} render failed, tap to retry`}
        onClick={this.handleRetry}
        style={{ cursor: 'pointer' }}
      >
        <circle r={22} fill="#2a0b10" stroke="#ff3d5a" strokeWidth={2} />
        <text
          textAnchor="middle"
          y={4}
          fill="#ff3d5a"
          fontSize={10}
          fontFamily="ui-monospace, SFMono-Regular"
        >
          retry
        </text>
      </g>
    );
  }
}

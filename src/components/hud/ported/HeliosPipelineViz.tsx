'use client';

//
// HeliosPipelineViz.tsx (ported reference skeleton)
//
// Ported from: app/builder/viz/PipelineCanvas.tsx (Helios P2)
// Ported by: Talos-translator (2026-04-23)
// Target: Erato-v2 SideBar pipeline mini-viewer
//
// Conforms to:
// - docs/contracts/pipeline_visualizer.contract.md v0.1.0
// - docs/contracts/event_bus.contract.md v0.1.0
// - docs/contracts/managed_agent_executor.contract.md v0.1.0
//
// This skeleton preserves the store-factory pattern, tier-based layout, and
// bus-subscription semantics from V3 PipelineCanvas. Sub-components (AgentNode,
// HandoffEdge, ToolUseTicker, MAConsoleDeepLink) are imported from the V3 KEEP
// location under app/builder/viz/, not duplicated here, since those ship
// unchanged.
//
// The surface is rewritten for compact in-game HUD embed:
//   - Default width 360 instead of 960 (fits SideBar)
//   - Default height 240 instead of 560
//   - Compact view_mode default (smaller node radius)
//   - Explicit data-hud-role attribute for Zustand bridge wiring
//   - Removed reconnecting state UI clutter (SideBar has its own connection
//     indicator authored by Erato-v2)
//   - Removed inline CanvasHeader (TopBar shows live-pipeline status instead)
//
// What is preserved:
//   - createPipelineStore factory (each HUD instance isolated)
//   - useBusSubscription hook shape
//   - Tier-based ring layout math
//   - Error boundary on per-node render crash
//   - reducedMotion honor
//   - SVG rendering (not Pixi/Canvas) for Nemea regression stability
//
// Erato-v2 integration:
//   - Mount inside SideBar panel, composed below agent structure editor
//   - Subscribe to gameBridge event bus (which fans out to canonical
//     pipeline_event envelope via Pythia-v2 contract)
//   - Reuse createPipelineStore factory; each SideBar session gets its
//     own store instance
//   - Upstream node click handler should route to NPC focus or in-game
//     Advisor prompt-challenge trigger, not window dispatch
//

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
} from '../../../../app/shared/events/pipeline_event';
import type {
  PipelineCanvasProps,
  PipelineNode,
  PipelineEdge,
  NodeStatus,
  ViewMode,
  ToolUseEntry,
} from '../../../../app/builder/viz/types';
import { AgentNode } from '../../../../app/builder/viz/AgentNode';
import { HandoffEdge } from '../../../../app/builder/viz/HandoffEdge';
import {
  ToolUseTicker,
  useToolUseRingBuffer,
} from '../../../../app/builder/viz/ToolUseTicker';
import { CONFIDENCE_OVERLAY_FADE_MS } from '../../../../app/builder/viz/confidence_overlay';

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
}

export function createPipelineStore(
  initial: Pick<
    PipelineStoreState,
    'run_id' | 'nodes' | 'edges' | 'view_mode'
  >,
) {
  return create<PipelineStoreState>((set) => ({
    ...initial,
    hydrate: (run_id, nodes, edges, view_mode) =>
      set({ run_id, nodes, edges, view_mode }),
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
  }));
}

export interface HeliosPipelineVizProps extends PipelineCanvasProps {
  readonly bus?: EventBus;
  readonly width?: number;
  readonly height?: number;
}

export function HeliosPipelineViz(
  props: HeliosPipelineVizProps,
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
    width = 360,
    height = 240,
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

  React.useEffect(() => {
    store
      .getState()
      .hydrate(pipeline_run_id, nodesProp, edgesProp, viewModeProp);
  }, [store, pipeline_run_id, nodesProp, edgesProp, viewModeProp]);

  const nodes = store((state) => state.nodes);
  const edges = store((state) => state.edges);
  const view_mode = store((state) => state.view_mode);

  useBusSubscription(bus, pipeline_run_id, store);

  const systemReduceMotion = useReducedMotion();
  const reduceMotion = systemReduceMotion === true;
  const layout = React.useMemo(
    () => layoutNodes(nodes, width, height, view_mode),
    [nodes, width, height, view_mode],
  );

  const toolUseEntries = useToolUseRingBuffer(bus, pipeline_run_id, 16);
  const presentedEntries = React.useMemo<ReadonlyArray<ToolUseEntry>>(
    () => toolUseEntries,
    [toolUseEntries],
  );

  return (
    <div
      className={className}
      data-hud-role="helios-pipeline-viz"
      data-pipeline-run-id={pipeline_run_id}
      data-view-mode={view_mode}
      style={{
        position: 'relative',
        width,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <svg
        role="img"
        aria-label="Pipeline mini-viewer"
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block' }}
      >
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
        style={{ marginTop: 6 }}
      >
        <ToolUseTicker
          pipeline_run_id={pipeline_run_id}
          max_visible_entries={4}
          entries={presentedEntries}
        />
      </motion.div>
    </div>
  );
}

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
          /* bus guarantees unsubscribe idempotency */
        }
      }
    };
  }, [bus, pipeline_run_id, store]);
}

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
  const yPadding = 24;
  const xPadding = 16;
  const layout = new Map<string, { x: number; y: number; radius: number }>();
  const nonEmptyTiers = tierOrder.filter((tier) => rows[tier].length > 0);
  const rowCount = Math.max(1, nonEmptyTiers.length);
  const rowHeight = (height - yPadding * 2) / rowCount;
  const baseRadius = view_mode === 'compact' ? 10 : 14;

  nonEmptyTiers.forEach((tier, rowIndex) => {
    const y = yPadding + rowHeight * rowIndex + rowHeight / 2;
    const tierNodes = rows[tier];
    const colCount = Math.max(1, tierNodes.length);
    const columnWidth = (width - xPadding * 2) / colCount;
    tierNodes.forEach((node, colIndex) => {
      const x = xPadding + columnWidth * colIndex + columnWidth / 2;
      const radius = tier === 'ma_lane' ? baseRadius + 2 : baseRadius;
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
    // eslint-disable-next-line no-console
    console.error(
      `[HeliosPipelineViz] node render failure for ${this.props.node_id}`,
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
        <circle r={12} fill="#2a0b10" stroke="#ff3d5a" strokeWidth={2} />
        <text
          textAnchor="middle"
          y={4}
          fill="#ff3d5a"
          fontSize={8}
          fontFamily="ui-monospace, SFMono-Regular"
        >
          retry
        </text>
      </g>
    );
  }
}

export type { HeliosPipelineVizProps as Props };

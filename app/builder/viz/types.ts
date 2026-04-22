//
// types.ts
//
// Conforms to: docs/contracts/pipeline_visualizer.contract.md v0.1.0
// Companion contracts:
//   - docs/contracts/event_bus.contract.md v0.1.0
//   - docs/contracts/builder_specialist_executor.contract.md v0.1.0
//   - docs/contracts/prediction_layer_surface.contract.md (confidence input)
//   - docs/contracts/managed_agent_executor.contract.md (console deep link)
//
// Canonical type surface for Helios pipeline visualizer. Consumers: Apollo
// (mounts canvas via Erato slot), Urania (Blueprint Moment reuse), Nemea
// (visual regression fixture). Type evolution is additive only per contract.
//

import type { PipelineEventTopic } from '../../shared/events/pipeline_event';

export type NodeTier = 'advisor' | 'lead' | 'worker' | 'ma_lane';

export type NodePillar =
  | 'builder'
  | 'marketplace'
  | 'banking'
  | 'registry'
  | 'protocol';

export type NodeStatus =
  | 'idle'
  | 'active'
  | 'completed'
  | 'failed'
  | 'halted';

export type EdgeKind = 'handoff' | 'dependency' | 'ma_bridge';

export type ViewMode = 'compact' | 'expanded';

export interface PipelineNode {
  readonly node_id: string;
  readonly label: string;
  readonly tier: NodeTier;
  readonly pillar?: NodePillar;
  readonly status: NodeStatus;
  readonly confidence?: number;
  readonly current_tool_call?: string;
  readonly tokens_consumed?: number;
  readonly cost_usd?: number;
  readonly ma_session_id?: string;
}

export interface PipelineEdge {
  readonly from_node_id: string;
  readonly to_node_id: string;
  readonly kind: EdgeKind;
  readonly is_active: boolean;
}

export interface ToolUseEntry {
  readonly entry_id: string;
  readonly pipeline_run_id: string;
  readonly occurred_at: string;
  readonly source_agent: string;
  readonly tool_name: string;
  readonly tool_input_preview: string;
}

export interface PipelineCanvasProps {
  readonly pipeline_run_id: string;
  readonly nodes: ReadonlyArray<PipelineNode>;
  readonly edges: ReadonlyArray<PipelineEdge>;
  readonly view_mode: ViewMode;
  readonly onNodeClick?: (node_id: string) => void;
  readonly consoleDeepLinks: Record<string, string>;
  readonly showConfidenceOverlay: boolean;
  readonly className?: string;
  readonly topicFilter?: ReadonlyArray<PipelineEventTopic>;
}

export interface AgentNodeProps {
  readonly node: PipelineNode;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly showConfidenceOverlay: boolean;
  readonly consoleDeepLink?: string;
  readonly onClick?: (node_id: string) => void;
  readonly reduceMotion: boolean;
}

export interface HandoffEdgeProps {
  readonly edge: PipelineEdge;
  readonly from: { x: number; y: number };
  readonly to: { x: number; y: number };
  readonly reduceMotion: boolean;
}

export interface ToolUseTickerProps {
  readonly pipeline_run_id: string;
  readonly max_visible_entries: number;
  readonly entries?: ReadonlyArray<ToolUseEntry>;
  readonly className?: string;
}

export interface MAConsoleDeepLinkProps {
  readonly ma_session_id?: string;
  readonly consoleDeepLinks: Record<string, string>;
  readonly label?: string;
  readonly className?: string;
}

export interface NodeLayout {
  readonly node_id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface CanvasLayout {
  readonly width: number;
  readonly height: number;
  readonly nodes: ReadonlyArray<NodeLayout>;
}

// Confidence band thresholds per pipeline_visualizer.contract.md Section 4
// soft guidance plus helios prompt (green > 0.80, amber 0.60 to 0.80, red < 0.60).
export const CONFIDENCE_GREEN_MIN = 0.8;
export const CONFIDENCE_AMBER_MIN = 0.6;

export type ConfidenceBand = 'green' | 'amber' | 'red' | 'unknown';

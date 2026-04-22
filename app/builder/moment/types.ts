//
// types.ts
//
// Conforms to: docs/contracts/blueprint_moment.contract.md v0.1.0
// Companion contract: docs/contracts/pipeline_visualizer.contract.md v0.1.0
//
// Canonical type surface for the Urania Blueprint Moment module. Consumers:
// Apollo (triggers reveal during demo), Helios (reuses pullback animation
// helpers), Nemea (QA visual regression), Ghaisan (demo video recording).
//
// Schema shapes BlueprintMomentDefinition and BlueprintRevealProps are the
// literal surface defined in the contract Section 3. Internal helper types
// (CameraBeat, NarrationBeat) alias array-element shapes for readability in
// downstream code; they do not introduce new public behavior.
//

import type {
  PipelineNode,
  PipelineEdge,
} from '../viz/types';

// ---------- Public schema (contract Section 3, verbatim) ----------

export type BlueprintMomentTrigger =
  | 'manual'
  | 'auto_on_pipeline_completion'
  | 'auto_on_timestamp';

export type CameraEase = 'linear' | 'ease_in_out' | 'cubic';

export type VisibleNodeSet = 'all_22' | 'builder_only' | 'pillar_map';

export interface CameraSequenceEntry {
  readonly start_ms: number;
  readonly end_ms: number;
  readonly zoom_from: number;
  readonly zoom_to: number;
  readonly ease: CameraEase;
}

export interface NarrationOverlayEntry {
  readonly start_ms: number;
  readonly end_ms: number;
  readonly text: string;
}

export interface BlueprintMomentDefinition {
  readonly moment_id: string;
  readonly trigger: BlueprintMomentTrigger;
  readonly trigger_timestamp_ms_into_demo?: number;
  readonly narration_overlay: ReadonlyArray<NarrationOverlayEntry>;
  readonly camera_sequence: ReadonlyArray<CameraSequenceEntry>;
  readonly highlight_nodes: ReadonlyArray<string>;
  readonly visible_node_set: VisibleNodeSet;
}

export interface BlueprintRevealProps {
  readonly definition: BlueprintMomentDefinition;
  readonly pipeline_run_id: string;
  readonly onComplete: () => void;
  readonly isPlaying: boolean;
  // Optional composition extensions. Not part of the contract schema but
  // allowed because the contract draft leaves composition-layer props to the
  // implementor. Defaults fall back to the NERIUM team snapshot bundled
  // with BlueprintReveal so the component renders standalone.
  readonly nodes?: ReadonlyArray<PipelineNode>;
  readonly edges?: ReadonlyArray<PipelineEdge>;
  readonly consoleDeepLinks?: Record<string, string>;
  readonly width?: number;
  readonly height?: number;
  readonly overrideElapsedMs?: number;
  readonly onBeatChange?: (activeBeatIndex: number | null) => void;
  readonly className?: string;
}

// ---------- Internal helpers (not part of contract schema) ----------

export interface CameraState {
  readonly zoom: number;
  readonly activeSequenceIndex: number | null;
  readonly totalElapsedMs: number;
  readonly totalDurationMs: number;
  readonly completed: boolean;
}

export interface NarrationState {
  readonly activeBeatIndex: number | null;
  readonly activeText: string | null;
  readonly activeTextTruncated: boolean;
}

export interface BlueprintValidationIssue {
  readonly field: string;
  readonly index: number;
  readonly message: string;
  readonly severity: 'warn' | 'error';
}

// Character budget per visual line at the hackathon base font (Share Tech
// Mono 14px inside a 920px overlay container). Contract Section 7 caps
// overlay text at 2 visual lines. We budget two lines worth of characters
// before truncation kicks in.
export const NARRATION_MAX_CHARS_PER_LINE = 48;
export const NARRATION_MAX_VISUAL_LINES = 2;
export const NARRATION_MAX_CHARS =
  NARRATION_MAX_CHARS_PER_LINE * NARRATION_MAX_VISUAL_LINES;

// Default viewport used by BlueprintReveal when width/height props not
// provided. Chosen so that the scene layout (1800x1000) reveals fully at
// zoom 0.22 and focuses on the Builder core cluster at zoom 1.0.
export const BLUEPRINT_VIEWPORT_WIDTH = 960;
export const BLUEPRINT_VIEWPORT_HEIGHT = 560;

// Scene dimensions for the inner PipelineCanvas composition. Wider scene
// gives the camera pullback room to reveal all 22 tier rows without
// crowding.
export const BLUEPRINT_SCENE_WIDTH = 1800;
export const BLUEPRINT_SCENE_HEIGHT = 1000;

// Cyberpunk Shanghai palette anchors pulled from Metis M3 reference.
// Exported so ma_highlight and narration_overlay can stay in sync without
// reaching into the shared CSS layer.
export const BLUEPRINT_PALETTE = {
  bg_0: '#06060c',
  bg_1: '#0b0b18',
  cyan: '#00f0ff',
  magenta: '#ff2e88',
  purple: '#8b5cf6',
  gold: '#ffd166',
  gold_hot: '#ffb703',
  ink: '#e8ecff',
  ink_dim: '#8888a8',
} as const;

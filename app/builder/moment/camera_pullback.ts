//
// camera_pullback.ts
//
// Conforms to: docs/contracts/blueprint_moment.contract.md v0.1.0
//
// Pure TypeScript module. No React import. Drives the cinematic camera
// zoom sequence for the Urania Blueprint Moment. Given a list of
// CameraSequenceEntry beats plus a current elapsed-ms value, evaluates the
// active sequence and returns a zoom scalar ready to feed into a CSS
// transform. Also exports timeline-shape validators and duration helpers
// reused by Helios (contract Section 11 post-hackathon refactor notes
// suggest Helios adopt this pattern for its own pipeline pullback demos).
//
// Reuse surface:
// - evaluateCamera(sequences, elapsedMs): resolves current zoom + bookkeeping
// - totalCameraDurationMs(sequences): returns the last end_ms across all
//   sequences (source of onComplete firing timestamp)
// - validateCameraSequence(sequences): returns issues for upstream warning
// - sortCameraSequences(sequences): defensive sort helper
// - easing functions (linear, easeInOut, cubic) exported for reuse and test
//

import type {
  CameraEase,
  CameraSequenceEntry,
  CameraState,
  BlueprintValidationIssue,
} from './types';

// ---------- Easing primitives ----------

export function easeLinear(t: number): number {
  return clamp01(t);
}

export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  if (x < 0.5) return 4 * x * x * x;
  return 1 - Math.pow(-2 * x + 2, 3) / 2;
}

// "cubic" in the contract is the stronger pullback feel: slow start, hard
// acceleration, overshoot-free. This is an ease-out-cubic curve rather
// than the symmetric in-out. Feels more like a camera physically pulled
// away from the scene.
export function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

export function applyEase(ease: CameraEase, t: number): number {
  switch (ease) {
    case 'linear':
      return easeLinear(t);
    case 'ease_in_out':
      return easeInOutCubic(t);
    case 'cubic':
      return easeOutCubic(t);
    default:
      return easeLinear(t);
  }
}

// ---------- Sequence helpers ----------

export function sortCameraSequences(
  sequences: ReadonlyArray<CameraSequenceEntry>,
): ReadonlyArray<CameraSequenceEntry> {
  const copy = sequences.slice();
  copy.sort((a, b) => a.start_ms - b.start_ms);
  return copy;
}

export function totalCameraDurationMs(
  sequences: ReadonlyArray<CameraSequenceEntry>,
): number {
  if (sequences.length === 0) return 0;
  let max = 0;
  for (const s of sequences) {
    if (s.end_ms > max) max = s.end_ms;
  }
  return max;
}

export function validateCameraSequence(
  sequences: ReadonlyArray<CameraSequenceEntry>,
): BlueprintValidationIssue[] {
  const issues: BlueprintValidationIssue[] = [];
  sequences.forEach((seq, index) => {
    if (!isFiniteNumber(seq.start_ms) || !isFiniteNumber(seq.end_ms)) {
      issues.push({
        field: 'camera_sequence',
        index,
        message: 'start_ms or end_ms not finite',
        severity: 'error',
      });
      return;
    }
    if (seq.end_ms <= seq.start_ms) {
      // Contract Section 8 error handling: skip silently at runtime but
      // emit a warn-level issue so callers can log.
      issues.push({
        field: 'camera_sequence',
        index,
        message: 'end_ms must be strictly greater than start_ms; entry will be skipped',
        severity: 'warn',
      });
    }
    if (!isFiniteNumber(seq.zoom_from) || !isFiniteNumber(seq.zoom_to)) {
      issues.push({
        field: 'camera_sequence',
        index,
        message: 'zoom_from or zoom_to not finite',
        severity: 'error',
      });
    }
    if (seq.zoom_from <= 0 || seq.zoom_to <= 0) {
      issues.push({
        field: 'camera_sequence',
        index,
        message: 'zoom values must be positive non-zero scalars',
        severity: 'error',
      });
    }
  });
  return issues;
}

// ---------- Core evaluation ----------

// Resolves the camera state at a given elapsedMs. Handles:
// - elapsed before first sequence: returns zoom_from of first sequence,
//   active index null (pre-roll)
// - elapsed inside a sequence window: returns eased interpolation
// - elapsed past last sequence: returns zoom_to of last sequence, completed true
// - overlapping sequences: picks the sequence with the latest start_ms whose
//   window contains elapsedMs. Contract does not forbid overlap; later
//   sequences supersede earlier ones during shared ms.
// - malformed sequence (end_ms <= start_ms): filtered out silently
export function evaluateCamera(
  sequences: ReadonlyArray<CameraSequenceEntry>,
  elapsedMs: number,
): CameraState {
  const cleaned = sortCameraSequences(
    sequences.filter((s) => s.end_ms > s.start_ms),
  );
  const totalDuration = totalCameraDurationMs(cleaned);

  if (cleaned.length === 0) {
    return {
      zoom: 1.0,
      activeSequenceIndex: null,
      totalElapsedMs: Math.max(0, elapsedMs),
      totalDurationMs: 0,
      completed: true,
    };
  }

  const first = cleaned[0]!;
  const last = cleaned[cleaned.length - 1]!;

  if (elapsedMs < first.start_ms) {
    return {
      zoom: first.zoom_from,
      activeSequenceIndex: null,
      totalElapsedMs: Math.max(0, elapsedMs),
      totalDurationMs: totalDuration,
      completed: false,
    };
  }

  if (elapsedMs >= last.end_ms) {
    return {
      zoom: last.zoom_to,
      activeSequenceIndex: cleaned.length - 1,
      totalElapsedMs: elapsedMs,
      totalDurationMs: totalDuration,
      completed: true,
    };
  }

  // Find the latest sequence whose window contains elapsedMs. If none
  // contains it (gap between sequences), hold at the zoom_to of the most
  // recently completed sequence.
  let containing = -1;
  for (let i = 0; i < cleaned.length; i += 1) {
    const seq = cleaned[i]!;
    if (elapsedMs >= seq.start_ms && elapsedMs < seq.end_ms) {
      containing = i;
    }
  }

  if (containing >= 0) {
    const seq = cleaned[containing]!;
    const span = seq.end_ms - seq.start_ms;
    const t = span > 0 ? (elapsedMs - seq.start_ms) / span : 1;
    const eased = applyEase(seq.ease, t);
    const zoom = seq.zoom_from + (seq.zoom_to - seq.zoom_from) * eased;
    return {
      zoom,
      activeSequenceIndex: containing,
      totalElapsedMs: elapsedMs,
      totalDurationMs: totalDuration,
      completed: false,
    };
  }

  // Gap between sequences: hold at the zoom_to of the most recently passed
  // sequence.
  let lastCompleted = 0;
  for (let i = 0; i < cleaned.length; i += 1) {
    if (elapsedMs >= cleaned[i]!.end_ms) lastCompleted = i;
  }
  return {
    zoom: cleaned[lastCompleted]!.zoom_to,
    activeSequenceIndex: null,
    totalElapsedMs: elapsedMs,
    totalDurationMs: totalDuration,
    completed: false,
  };
}

// ---------- Internal utilities ----------

function clamp01(v: number): number {
  if (!isFiniteNumber(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

// ---------- Virtual clock tick helper ----------
// Exposed so BlueprintReveal can run an rAF loop that accumulates elapsed
// time while respecting pause/resume semantics. Pure function, no side
// effects.

export interface VirtualClockTickInput {
  readonly previousElapsedMs: number;
  readonly previousTimestamp: number | null;
  readonly currentTimestamp: number;
  readonly isPlaying: boolean;
}

export interface VirtualClockTickResult {
  readonly elapsedMs: number;
  readonly nextTimestamp: number;
}

export function tickVirtualClock(
  input: VirtualClockTickInput,
): VirtualClockTickResult {
  if (!input.isPlaying || input.previousTimestamp === null) {
    return {
      elapsedMs: input.previousElapsedMs,
      nextTimestamp: input.currentTimestamp,
    };
  }
  const delta = Math.max(0, input.currentTimestamp - input.previousTimestamp);
  return {
    elapsedMs: input.previousElapsedMs + delta,
    nextTimestamp: input.currentTimestamp,
  };
}

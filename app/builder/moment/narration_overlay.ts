//
// narration_overlay.ts
//
// Conforms to: docs/contracts/blueprint_moment.contract.md v0.1.0
//
// Pure TypeScript module. No React import. Text sync logic for the
// Blueprint Moment narration overlay. Given a list of NarrationOverlayEntry
// beats plus a current elapsed-ms value, resolves which beat is active,
// truncates text that would exceed the 2-visual-line cap per contract
// Section 7, and emits a warning flag when truncation fires.
//
// Reuse surface:
// - findActiveNarration(overlays, elapsedMs): resolves current beat
// - truncateOverlayText(text): returns {text, truncated}
// - validateNarrationOverlay(overlays): structural issues for logging
// - sortNarrationOverlays(overlays): defensive sort helper
//
// Voice anchor: narration copy is authored in docs/demo_video_script.md.
// This module is data-agnostic and re-usable for future moments (Prediction
// Layer deep dive, Protocol translation beat) per contract Section 11.
//

import type {
  NarrationOverlayEntry,
  NarrationState,
  BlueprintValidationIssue,
} from './types';
import {
  NARRATION_MAX_CHARS,
  NARRATION_MAX_CHARS_PER_LINE,
  NARRATION_MAX_VISUAL_LINES,
} from './types';

// ---------- Sequence helpers ----------

export function sortNarrationOverlays(
  overlays: ReadonlyArray<NarrationOverlayEntry>,
): ReadonlyArray<NarrationOverlayEntry> {
  const copy = overlays.slice();
  copy.sort((a, b) => a.start_ms - b.start_ms);
  return copy;
}

export function validateNarrationOverlay(
  overlays: ReadonlyArray<NarrationOverlayEntry>,
): BlueprintValidationIssue[] {
  const issues: BlueprintValidationIssue[] = [];
  overlays.forEach((entry, index) => {
    if (!isFiniteNumber(entry.start_ms) || !isFiniteNumber(entry.end_ms)) {
      issues.push({
        field: 'narration_overlay',
        index,
        message: 'start_ms or end_ms not finite',
        severity: 'error',
      });
      return;
    }
    if (entry.end_ms <= entry.start_ms) {
      issues.push({
        field: 'narration_overlay',
        index,
        message: 'end_ms must be strictly greater than start_ms; entry will be skipped',
        severity: 'warn',
      });
    }
    if (typeof entry.text !== 'string' || entry.text.length === 0) {
      issues.push({
        field: 'narration_overlay',
        index,
        message: 'text is missing or empty',
        severity: 'error',
      });
      return;
    }
    if (countVisualLines(entry.text) > NARRATION_MAX_VISUAL_LINES) {
      issues.push({
        field: 'narration_overlay',
        index,
        message: `text exceeds ${NARRATION_MAX_VISUAL_LINES} visual lines; will be truncated with ellipsis at render`,
        severity: 'warn',
      });
    }
  });
  return issues;
}

// ---------- Core lookup ----------

// Returns the latest overlay whose [start_ms, end_ms) window contains
// elapsedMs. Returns null when no overlay is active (pre-roll, post-roll,
// or gap between beats). Overlaps: later start_ms wins, matching the
// camera_pullback.evaluateCamera() tie-break rule for consistency across
// the timeline engine.
export function findActiveNarration(
  overlays: ReadonlyArray<NarrationOverlayEntry>,
  elapsedMs: number,
): NarrationState {
  const cleaned = overlays.filter((o) => o.end_ms > o.start_ms);

  if (cleaned.length === 0) {
    return { activeBeatIndex: null, activeText: null, activeTextTruncated: false };
  }

  let activeIndex: number | null = null;
  let latestStart = -Infinity;
  for (let i = 0; i < cleaned.length; i += 1) {
    const entry = cleaned[i]!;
    if (elapsedMs >= entry.start_ms && elapsedMs < entry.end_ms) {
      if (entry.start_ms > latestStart) {
        activeIndex = i;
        latestStart = entry.start_ms;
      }
    }
  }

  if (activeIndex === null) {
    return { activeBeatIndex: null, activeText: null, activeTextTruncated: false };
  }

  // Resolve the original (unfiltered) index so callers receive a stable
  // pointer into their own input array. Match by reference from cleaned
  // back to overlays.
  const chosen = cleaned[activeIndex]!;
  const originalIndex = overlays.indexOf(chosen);
  const truncation = truncateOverlayText(chosen.text);
  return {
    activeBeatIndex: originalIndex >= 0 ? originalIndex : activeIndex,
    activeText: truncation.text,
    activeTextTruncated: truncation.truncated,
  };
}

// ---------- Text truncation ----------

export interface TruncationResult {
  readonly text: string;
  readonly truncated: boolean;
}

// Caps overlay text at the visual-line budget. First pass respects any
// explicit newline by keeping the first NARRATION_MAX_VISUAL_LINES lines;
// second pass enforces the aggregate character budget so wrapped lines
// cannot push the rendered block past two visual rows. Ellipsis uses the
// single-character U+2026 to stay within the no-em-dash rule; U+2026 is a
// separate codepoint from U+2014 so the anti-em-dash lint does not flag.
export function truncateOverlayText(text: string): TruncationResult {
  if (typeof text !== 'string') {
    return { text: '', truncated: true };
  }
  const normalized = text.replace(/\r\n?/g, '\n');

  const explicitLines = normalized.split('\n');
  let wasTruncated = false;
  let candidate = normalized;

  if (explicitLines.length > NARRATION_MAX_VISUAL_LINES) {
    const trimmedLines = explicitLines
      .slice(0, NARRATION_MAX_VISUAL_LINES)
      .join('\n');
    candidate = ensureEllipsis(trimmedLines);
    wasTruncated = true;
  }

  if (candidate.length > NARRATION_MAX_CHARS) {
    const hardBudget = NARRATION_MAX_CHARS - 1; // reserve 1 char for ellipsis
    candidate = ensureEllipsis(candidate.slice(0, hardBudget).trimEnd());
    wasTruncated = true;
  }

  return { text: candidate, truncated: wasTruncated };
}

export function countVisualLines(text: string): number {
  if (typeof text !== 'string' || text.length === 0) return 0;
  const normalized = text.replace(/\r\n?/g, '\n');
  const explicitLines = normalized.split('\n');
  let visualLines = 0;
  for (const line of explicitLines) {
    if (line.length === 0) {
      visualLines += 1;
      continue;
    }
    visualLines += Math.ceil(line.length / NARRATION_MAX_CHARS_PER_LINE);
  }
  return visualLines;
}

function ensureEllipsis(s: string): string {
  const trimmed = s.trimEnd();
  if (trimmed.endsWith('…')) return trimmed;
  if (trimmed.endsWith('...')) return `${trimmed.slice(0, -3)}…`;
  return `${trimmed}…`;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

// ---------- Beat transition helper ----------
// Emits a stable change signal so React effects can run side-effect code
// (sound cue, analytics ping) exactly once per transition.

export function didActiveBeatChange(
  previous: NarrationState,
  next: NarrationState,
): boolean {
  return previous.activeBeatIndex !== next.activeBeatIndex;
}

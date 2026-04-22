//
// ToolUseTicker.tsx
//
// Conforms to: docs/contracts/pipeline_visualizer.contract.md v0.1.0
//
// Rolling log of pipeline.step.tool_use events for the current run. Drops
// oldest entries when visible count exceeds `max_visible_entries`. Auto-
// subscribes to the event bus via `subscribeTicker` helper (shared with
// PipelineCanvas so tests can inject a mock bus).
//
// When `entries` is passed directly, the ticker is a pure presentational
// component. This keeps the component Storybook-friendly and snapshotable
// for Nemea visual regression.
//

'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type {
  EventBus,
  PipelineEvent,
  ToolUsePayload,
} from '../../shared/events/pipeline_event';
import type { ToolUseEntry, ToolUseTickerProps } from './types';

const TIER_ACCENT = '#00f0ff';
const ENTRY_HEIGHT = 28;

export function ToolUseTicker(props: ToolUseTickerProps): React.JSX.Element {
  const { pipeline_run_id, max_visible_entries, entries, className } = props;
  const reduceMotion = useReducedMotion() === true;
  const visible = (entries ?? []).slice(-max_visible_entries);

  return (
    <div
      className={className}
      data-pipeline-run-id={pipeline_run_id}
      role="log"
      aria-label="Live tool use ticker"
      aria-live="polite"
      aria-relevant="additions"
      style={{
        background: 'rgba(6, 6, 12, 0.78)',
        border: '1px solid rgba(0, 240, 255, 0.25)',
        borderRadius: 8,
        padding: '8px 10px',
        minHeight: ENTRY_HEIGHT * Math.min(max_visible_entries, 4) + 16,
        fontFamily: 'ui-monospace, SFMono-Regular',
        fontSize: 11,
        color: '#b0bccc',
        overflow: 'hidden',
      }}
    >
      <AnimatePresence initial={false}>
        {visible.length === 0 ? (
          <motion.div
            key="empty"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            style={{ color: '#6a7687' }}
          >
            waiting for tool use events
          </motion.div>
        ) : (
          visible.map((entry) => (
            <motion.div
              key={entry.entry_id}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              style={{
                display: 'flex',
                gap: 8,
                padding: '3px 0',
                borderBottom: '1px solid rgba(176, 188, 204, 0.08)',
              }}
            >
              <span style={{ color: TIER_ACCENT, minWidth: 58 }}>
                {formatTime(entry.occurred_at)}
              </span>
              <span style={{ color: '#e6ecff', minWidth: 120 }}>
                {truncate(entry.source_agent, 18)}
              </span>
              <span style={{ color: '#ffd166', minWidth: 80 }}>
                {truncate(entry.tool_name, 12)}
              </span>
              <span
                style={{
                  color: '#b0bccc',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                {entry.tool_input_preview}
              </span>
            </motion.div>
          ))
        )}
      </AnimatePresence>
    </div>
  );
}

// Hook helper co-located here so PipelineCanvas can feed the ticker with the
// same bus subscription it drives the node state from. Accepts a bus plus
// run id and returns a ring buffer of recent tool use entries.
export function useToolUseRingBuffer(
  bus: EventBus | undefined,
  pipeline_run_id: string,
  maxEntries: number,
): ReadonlyArray<ToolUseEntry> {
  const [entries, setEntries] = React.useState<ReadonlyArray<ToolUseEntry>>([]);

  React.useEffect(() => {
    if (!bus) return;
    const unsubscribe = bus.subscribe<ToolUsePayload>(
      'pipeline.step.tool_use',
      (event: PipelineEvent<ToolUsePayload>) => {
        if (event.pipeline_run_id !== pipeline_run_id) return;
        setEntries((prev) => {
          const next: ToolUseEntry = {
            entry_id: event.event_id,
            pipeline_run_id: event.pipeline_run_id,
            occurred_at: event.occurred_at,
            source_agent: event.source_agent,
            tool_name: event.payload.tool_name,
            tool_input_preview: event.payload.tool_input_preview,
          };
          const updated = [...prev, next];
          if (updated.length > maxEntries * 2) {
            return updated.slice(updated.length - maxEntries * 2);
          }
          return updated;
        });
      },
    );
    return unsubscribe;
  }, [bus, pipeline_run_id, maxEntries]);

  return entries;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}...`;
}

function formatTime(isoString: string): string {
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return '--:--:--';
  const hh = String(parsed.getUTCHours()).padStart(2, '0');
  const mm = String(parsed.getUTCMinutes()).padStart(2, '0');
  const ss = String(parsed.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

'use client';
//
// LumioReplay.tsx
//
// Conforms to: docs/contracts/lumio_demo_cache.contract.md v0.1.0 Sections 4, 5
// Owner Agent: Dionysus (Builder Worker, Lumio Demo Executor, P3b)
//
// Purpose: React component that loads cache/lumio_run_2026_04_24.json and
// replays the Lumio Builder bake deterministically for the demo video. The
// replay re-paces pipeline events at intervals matching the original
// occurred_at deltas times speed_multiplier. All final artifacts are embedded
// in the trace so the component never fetches secondary assets, per contract.
//
// Honest-claim discipline (NarasiGhaisan Section 16, Dionysus hard_constraint):
// the component renders a persistent, non-dismissable badge that reads
// "Replaying cached Day-3 bake, not live". The badge is visible on every
// frame of the replay, in every viewport, to satisfy the non-ambiguous UI
// indication clause.
//

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PipelineEvent } from '../../shared/events/pipeline_event';
import {
  LUMIO_REPLAY_COMPAT_VERSION,
  TraceNotFoundError,
  TraceSchemaIncompatibleError,
  type LumioRunTrace,
  type LumioSpecialistStep,
  type LumioReplayPlayerOptions,
} from './cache_types';

type Status = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'complete' | 'error';

type LumioReplayProps = {
  readonly traceId?: string;
  readonly tracePath?: string;
  readonly initialSpeed?: number;
  readonly autoStart?: boolean;
  readonly onRunCompleted?: (trace: LumioRunTrace) => void;
};

const DEFAULT_TRACE_ID = 'lumio_run_2026_04_24';

function fmtDurationSec(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${rem} s`;
  return `${m} m ${rem.toString().padStart(2, '0')} s`;
}

function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)} k`;
  return `${(n / 1_000_000).toFixed(2)} M`;
}

function fmtCostUsd(n: number): string {
  if (n < 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(2)}`;
}

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

async function defaultFetchTrace(tracePath: string): Promise<LumioRunTrace> {
  const response = await fetch(tracePath, { cache: 'no-store' });
  if (!response.ok) {
    throw new TraceNotFoundError(DEFAULT_TRACE_ID, tracePath);
  }
  const json = (await response.json()) as LumioRunTrace;
  if (json.replay_compatibility_version !== LUMIO_REPLAY_COMPAT_VERSION) {
    throw new TraceSchemaIncompatibleError(
      json.replay_compatibility_version,
      LUMIO_REPLAY_COMPAT_VERSION,
    );
  }
  return json;
}

export function LumioReplay({
  traceId = DEFAULT_TRACE_ID,
  tracePath = '/cache/lumio_run_2026_04_24.json',
  initialSpeed = 1,
  autoStart = false,
  onRunCompleted,
}: LumioReplayProps): JSX.Element {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState<LumioRunTrace | null>(null);
  const [speed, setSpeed] = useState<number>(initialSpeed);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [emittedEvents, setEmittedEvents] = useState<number>(0);
  const [activeArtifactPath, setActiveArtifactPath] = useState<string | null>(null);
  const [now, setNow] = useState<number>(0);

  const timeoutsRef = useRef<Set<number>>(new Set());
  const pausedRef = useRef<boolean>(false);
  const cursorRef = useRef<number>(0);

  const clearAllTimeouts = useCallback(() => {
    for (const id of timeoutsRef.current) {
      window.clearTimeout(id);
    }
    timeoutsRef.current.clear();
  }, []);

  const loadTrace = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const data = await defaultFetchTrace(tracePath);
      if (data.trace_id !== traceId) {
        // Trace id mismatch is acceptable, log and continue with what we loaded.
        // Contract allows named-trace loading as a convenience.
      }
      setTrace(data);
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [traceId, tracePath]);

  useEffect(() => {
    loadTrace();
    return () => clearAllTimeouts();
  }, [loadTrace, clearAllTimeouts]);

  const play = useCallback(
    (options?: LumioReplayPlayerOptions) => {
      if (!trace || status === 'playing') return;
      const speedMul = Math.max(0.1, options?.speed_multiplier ?? speed);
      pausedRef.current = false;
      setStatus('playing');

      const events = trace.event_stream;
      const steps = trace.steps;
      const runStart = Date.parse(trace.recorded_at);

      // Schedule step advances based on step.started_at.
      for (const step of steps) {
        const delay = Math.max(0, (Date.parse(step.started_at) - runStart) / speedMul);
        const id = window.setTimeout(() => {
          if (pausedRef.current) return;
          setCurrentIndex(step.step_index);
          if (step.output.artifacts.length > 0) {
            setActiveArtifactPath(step.output.artifacts[0].path);
          }
          options?.onStep?.(step);
        }, delay);
        timeoutsRef.current.add(id);
      }

      // Schedule event emissions.
      for (let i = 0; i < events.length; i += 1) {
        const event = events[i];
        const delay = Math.max(0, (Date.parse(event.occurred_at) - runStart) / speedMul);
        const id = window.setTimeout(() => {
          if (pausedRef.current) return;
          cursorRef.current = i + 1;
          setEmittedEvents(i + 1);
          setNow(Date.parse(event.occurred_at) - runStart);
          options?.onEvent?.(event as PipelineEvent);
        }, delay);
        timeoutsRef.current.add(id);
      }

      // Terminal completion.
      const finalDelay = Math.max(0, trace.total_duration_ms / speedMul) + 50;
      const finalId = window.setTimeout(() => {
        if (pausedRef.current) return;
        setStatus('complete');
        onRunCompleted?.(trace);
      }, finalDelay);
      timeoutsRef.current.add(finalId);
    },
    [trace, status, speed, onRunCompleted],
  );

  const pause = useCallback(() => {
    if (status !== 'playing') return;
    pausedRef.current = true;
    clearAllTimeouts();
    setStatus('paused');
  }, [status, clearAllTimeouts]);

  const reset = useCallback(() => {
    clearAllTimeouts();
    pausedRef.current = false;
    setCurrentIndex(0);
    setEmittedEvents(0);
    setActiveArtifactPath(null);
    setNow(0);
    setStatus(trace ? 'ready' : 'idle');
  }, [trace, clearAllTimeouts]);

  const seekTo = useCallback(
    (stepIndex: number) => {
      if (!trace) return;
      const clamped = Math.max(0, Math.min(trace.steps.length - 1, stepIndex));
      clearAllTimeouts();
      pausedRef.current = true;
      const step = trace.steps[clamped];
      setCurrentIndex(clamped);
      setActiveArtifactPath(step.output.artifacts[0]?.path ?? null);
      const eventsBefore = trace.event_stream.filter(
        (e) => Date.parse(e.occurred_at) <= Date.parse(step.ended_at),
      ).length;
      setEmittedEvents(eventsBefore);
      setNow(Date.parse(step.ended_at) - Date.parse(trace.recorded_at));
      setStatus('paused');
    },
    [trace, clearAllTimeouts],
  );

  useEffect(() => {
    if (autoStart && trace && status === 'ready') {
      play();
    }
  }, [autoStart, trace, status, play]);

  const activeStep = useMemo<LumioSpecialistStep | null>(() => {
    if (!trace) return null;
    return trace.steps[currentIndex] ?? trace.steps[0];
  }, [trace, currentIndex]);

  const activeArtifact = useMemo(() => {
    if (!trace || !activeArtifactPath) return null;
    const fromStep = trace.steps[currentIndex]?.output.artifacts.find(
      (a) => a.path === activeArtifactPath,
    );
    if (fromStep) return fromStep;
    return null;
  }, [trace, currentIndex, activeArtifactPath]);

  const progressPercent = useMemo(() => {
    if (!trace) return 0;
    return Math.min(100, (now / trace.total_duration_ms) * 100);
  }, [trace, now]);

  if (status === 'loading') {
    return (
      <div className="p-8 text-sm text-gray-500" role="status" aria-live="polite">
        Loading Lumio cached trace from <code className="font-mono">{tracePath}</code>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="p-8 rounded-xl border border-red-300 bg-red-50 text-red-800" role="alert">
        <p className="font-semibold">Lumio replay could not load.</p>
        <p className="mt-1 text-sm">{error}</p>
        <button
          type="button"
          className="mt-3 px-3 py-1.5 rounded-md bg-red-800 text-white text-sm"
          onClick={loadTrace}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!trace) {
    return <div className="p-8 text-sm text-gray-500">No trace.</div>;
  }

  return (
    <div className="relative rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      {/* Honest-claim badge, always visible, never dismissable. */}
      <div
        role="note"
        aria-label="Cached bake disclosure"
        className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs"
      >
        <span className="inline-block w-2 h-2 rounded-full bg-amber-500" aria-hidden />
        <span className="font-medium">Replaying cached Day-3 bake, not live.</span>
        <span className="opacity-70">
          trace {trace.trace_id}, schema {trace.replay_compatibility_version}, bake mode {trace.bake_mode}
        </span>
      </div>

      <div className="grid md:grid-cols-12 gap-0">
        <aside className="md:col-span-4 border-r border-gray-200 bg-gray-50 p-5">
          <header className="mb-4">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Lumio Builder bake</p>
            <h2 className="mt-1 text-lg font-semibold text-gray-900">{trace.specialist_count} specialists, cached</h2>
            <p className="mt-1 text-xs text-gray-500">
              Total {fmtDurationSec(trace.total_duration_ms)}, {fmtCostUsd(trace.total_cost_usd)} cost
            </p>
          </header>

          <ol className="space-y-1">
            {trace.steps.map((step) => {
              const isActive = currentIndex === step.step_index && (status === 'playing' || status === 'paused');
              const isDone = step.step_index < currentIndex || status === 'complete';
              return (
                <li key={step.step_index}>
                  <button
                    type="button"
                    onClick={() => seekTo(step.step_index)}
                    className={cn(
                      'w-full text-left flex items-start gap-3 px-3 py-2 rounded-lg border transition',
                      isActive && 'border-indigo-400 bg-indigo-50',
                      !isActive && isDone && 'border-gray-200 bg-white',
                      !isActive && !isDone && 'border-transparent bg-transparent hover:bg-gray-100',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 w-6 h-6 rounded-full text-xs inline-flex items-center justify-center border',
                        isActive && 'bg-indigo-600 text-white border-indigo-600',
                        !isActive && isDone && 'bg-emerald-100 text-emerald-800 border-emerald-300',
                        !isActive && !isDone && 'bg-white text-gray-500 border-gray-300',
                      )}
                    >
                      {step.step_index}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-gray-900 truncate">
                        {step.specialist_id}
                      </span>
                      <span className="block text-xs text-gray-500 truncate">
                        {step.role} | {step.vendor_lane.replace('_', ' ')} | {fmtDurationSec(step.duration_ms)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <section className="md:col-span-8 flex flex-col">
          <div className="border-b border-gray-200 p-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Current step</p>
                {activeStep ? (
                  <h3 className="mt-1 text-xl font-semibold text-gray-900">
                    {activeStep.step_index}, {activeStep.specialist_id}
                  </h3>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {(status === 'ready' || status === 'paused' || status === 'complete') && (
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-sm font-medium"
                    onClick={() => {
                      if (status === 'complete') reset();
                      play();
                    }}
                  >
                    {status === 'complete' ? 'Replay' : 'Play'}
                  </button>
                )}
                {status === 'playing' && (
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium"
                    onClick={pause}
                  >
                    Pause
                  </button>
                )}
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm"
                  onClick={reset}
                  disabled={status === 'loading'}
                >
                  Reset
                </button>
                <div className="flex items-center gap-1 ml-2" role="group" aria-label="Playback speed">
                  {[1, 2, 5, 10, 20].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSpeed(v)}
                      className={cn(
                        'px-2 py-1 rounded-md text-xs border',
                        speed === v ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-700',
                      )}
                      aria-pressed={speed === v}
                    >
                      {v}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4" aria-hidden>
              <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                <div
                  className="h-full bg-gray-900 transition-[width] duration-150 ease-linear"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                <span>
                  {fmtDurationSec(now)} of {fmtDurationSec(trace.total_duration_ms)}
                </span>
                <span>
                  {emittedEvents} of {trace.event_stream.length} events
                </span>
              </div>
            </div>
          </div>

          {activeStep && (
            <div className="p-5 grid md:grid-cols-3 gap-4 border-b border-gray-200 bg-gray-50">
              <StatBlock label="Tokens in" value={fmtTokens(activeStep.output.tokens_consumed.input)} />
              <StatBlock label="Tokens out" value={fmtTokens(activeStep.output.tokens_consumed.output)} />
              <StatBlock label="Cost" value={fmtCostUsd(activeStep.output.cost_usd)} />
            </div>
          )}

          {activeStep && (
            <div className="p-5 border-b border-gray-200">
              <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Task prompt preview</p>
              <p className="mt-2 text-sm text-gray-800 leading-relaxed">{activeStep.input_preview}</p>

              <p className="mt-5 text-xs uppercase tracking-wider text-gray-500 font-semibold">Artifacts</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {activeStep.output.artifacts.map((artifact) => (
                  <button
                    key={artifact.path}
                    type="button"
                    onClick={() => setActiveArtifactPath(artifact.path)}
                    className={cn(
                      'px-2.5 py-1 rounded-md border text-xs',
                      activeArtifactPath === artifact.path
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-300 bg-white text-gray-700',
                    )}
                  >
                    {artifact.path.split('/').pop()}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="p-5 flex-1 min-h-0">
            {activeArtifact ? (
              <pre className="h-full max-h-[28rem] overflow-auto rounded-lg bg-gray-950 text-gray-100 text-xs p-4 leading-relaxed whitespace-pre-wrap">
                {activeArtifact.content.length > 20000
                  ? `${activeArtifact.content.slice(0, 20000)}\n\n[truncated, ${activeArtifact.content.length - 20000} more characters]`
                  : activeArtifact.content}
              </pre>
            ) : (
              <div className="text-sm text-gray-500">Press Play to begin the cached replay.</div>
            )}
          </div>
        </section>
      </div>

      <footer className="border-t border-gray-200 px-4 py-3 text-[11px] text-gray-500 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>Bake mode: {trace.bake_mode}</span>
        <span>Replay schema: {trace.replay_compatibility_version}</span>
        <span>
          Final artifacts embedded: {trace.final_artifacts.length} ({trace.final_artifacts.map((a) => a.path).join(', ')})
        </span>
      </footer>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-lg bg-white border border-gray-200 p-4">
      <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">{label}</p>
      <p className="mt-1 font-semibold text-gray-900 text-xl tabular-nums">{value}</p>
    </div>
  );
}

export default LumioReplay;

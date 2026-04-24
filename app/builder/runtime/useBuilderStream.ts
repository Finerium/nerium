//
// app/builder/runtime/useBuilderStream.ts
//
// Owner: Kratos (W2 P2 Session 3). Data-layer-only SSE consumer hook
// for the Builder runtime. Visual chrome is Marshall territory (P6);
// this file intentionally ships ZERO UI.
//
// Wire contract
// -------------
// - ``docs/contracts/ma_session_lifecycle.contract.md`` Section 4.2
//   GET /v1/ma/sessions/{id}/stream returns text/event-stream per
//   ``realtime_bus.contract.md`` Section 4.2.
// - Event envelope per ``realtime_bus.contract.md`` Section 3.1:
//     {id: number, type: string, data: object, occurred_at: string, version: 1}
//
// Authentication
// --------------
// Browser EventSource cannot set the Authorization header on the
// same origin, so this hook appends ``?ticket=<jwt>`` to the SSE URL.
// The caller obtains the ticket via ``POST /v1/realtime/ticket``
// (Nike, W2); this hook treats the ticket resolution as an
// injected-async dependency so the Nike seam stays decoupled.
//
// Reconnection
// ------------
// EventSource handles its own reconnection with the ``retry:``
// field served by the backend (3000 ms). On reconnect the browser
// automatically replays ``Last-Event-ID`` per the SSE spec, so
// resume-after-disconnect works for free as long as we preserve the
// connection's lastEventId across reconnects (native browser
// behaviour). No manual retry loop required here.
//
// Kratos W2 S2 ship status: SSE endpoint lives at
// ``/v1/ma/sessions/{id}/stream`` on the backend, publishes
// persisted events from ``ma_event`` and live-tails Redis Pub/Sub
// ``ma:event:<session_id>``.
//

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// -----------------------------------------------------------------
// Public event envelope types (mirror realtime_bus.contract.md 3.1)
// -----------------------------------------------------------------

export type BuilderEventType =
  | 'nerium.ma.queued'
  | 'nerium.ma.started'
  | 'nerium.ma.delta'
  | 'nerium.ma.tool_call'
  | 'nerium.ma.tool_result'
  | 'nerium.ma.thinking'
  | 'nerium.ma.usage'
  | 'nerium.ma.done'
  | 'nerium.ma.cancelled'
  | 'nerium.ma.errored'
  | 'nerium.system.budget_alert';

export interface BuilderEventEnvelope<T = Record<string, unknown>> {
  id: number;
  type: BuilderEventType | string;
  data: T;
  occurred_at: string;
  version: 1;
}

// -----------------------------------------------------------------
// Hook state + options
// -----------------------------------------------------------------

export type BuilderStreamStatus =
  | 'idle'
  | 'authenticating'
  | 'connecting'
  | 'open'
  | 'closed'
  | 'error';

export interface BuilderStreamState {
  status: BuilderStreamStatus;
  lastEvent: BuilderEventEnvelope | null;
  /**
   * Rolling buffer capped at ``bufferSize``. Oldest entries drop off
   * when the cap is reached so long-running sessions do not balloon
   * React's re-render cost.
   */
  events: BuilderEventEnvelope[];
  error: Error | null;
  /** Last SSE id observed; used for the `Last-Event-ID` resume header. */
  lastEventId: number | null;
}

export interface UseBuilderStreamOptions {
  /**
   * Async resolver that returns the short-lived realtime ticket.
   * Typically calls ``POST /v1/realtime/ticket`` (Nike, W2). The
   * hook abstracts it so tests + Tauri can inject their own path
   * (e.g. the Tauri build uses IPC to the native auth token).
   */
  getTicket: () => Promise<string>;

  /**
   * Override the SSE base URL. Defaults to same-origin ``/v1``.
   * Useful for development where the Next.js dev server and the
   * FastAPI backend live on different ports.
   */
  baseUrl?: string;

  /**
   * Cap on the in-memory event buffer. Defaults to 500.
   */
  bufferSize?: number;

  /**
   * Enable the hook. When ``false`` the effect does not open a
   * connection, letting callers mount the hook before the
   * ``sessionId`` is known.
   */
  enabled?: boolean;

  /**
   * Optional per-event hook for side effects outside React state
   * (OTel span creation, toast emit, etc.).
   */
  onEvent?: (event: BuilderEventEnvelope) => void;
}

const DEFAULT_BUFFER_SIZE = 500;

// -----------------------------------------------------------------
// useBuilderStream
// -----------------------------------------------------------------

/**
 * Subscribe to the Builder runtime SSE stream for a single session.
 *
 * @param sessionId UUID v7 of the MA session.
 * @param opts Ticket resolver + buffer options.
 * @returns Hook state + a ``close()`` helper.
 */
export function useBuilderStream(
  sessionId: string | null,
  opts: UseBuilderStreamOptions,
): BuilderStreamState & { close: () => void } {
  const bufferSize = opts.bufferSize ?? DEFAULT_BUFFER_SIZE;
  const baseUrl = opts.baseUrl ?? '/v1';

  const [state, setState] = useState<BuilderStreamState>({
    status: 'idle',
    lastEvent: null,
    events: [],
    error: null,
    lastEventId: null,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const closedRef = useRef(false);

  const close = useCallback(() => {
    closedRef.current = true;
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setState((prev) => ({ ...prev, status: 'closed' }));
  }, []);

  useEffect(() => {
    if (!sessionId || opts.enabled === false) {
      return;
    }
    closedRef.current = false;

    let eventSource: EventSource | null = null;
    let cancelled = false;

    const connect = async () => {
      try {
        setState((prev) => ({ ...prev, status: 'authenticating', error: null }));
        const ticket = await opts.getTicket();
        if (cancelled || closedRef.current) {
          return;
        }

        const url = `${baseUrl}/ma/sessions/${encodeURIComponent(
          sessionId,
        )}/stream?ticket=${encodeURIComponent(ticket)}`;

        setState((prev) => ({ ...prev, status: 'connecting' }));
        eventSource = new EventSource(url, { withCredentials: false });
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
          if (cancelled) return;
          setState((prev) => ({ ...prev, status: 'open', error: null }));
        };

        const handleEnvelope = (rawData: string, rawId: string | null) => {
          let envelope: BuilderEventEnvelope;
          try {
            envelope = JSON.parse(rawData) as BuilderEventEnvelope;
          } catch {
            return;
          }
          const nextId =
            typeof envelope.id === 'number'
              ? envelope.id
              : rawId
                ? Number.parseInt(rawId, 10)
                : null;
          setState((prev) => {
            const events = [...prev.events, envelope];
            if (events.length > bufferSize) {
              events.splice(0, events.length - bufferSize);
            }
            return {
              ...prev,
              lastEvent: envelope,
              events,
              lastEventId: nextId ?? prev.lastEventId,
            };
          });
          opts.onEvent?.(envelope);
        };

        // Named events use EventSource's addEventListener; generic
        // ``message`` catches events that do not set ``event:``.
        const NAMED_EVENTS: BuilderEventType[] = [
          'nerium.ma.queued',
          'nerium.ma.started',
          'nerium.ma.delta',
          'nerium.ma.tool_call',
          'nerium.ma.tool_result',
          'nerium.ma.thinking',
          'nerium.ma.usage',
          'nerium.ma.done',
          'nerium.ma.cancelled',
          'nerium.ma.errored',
          'nerium.system.budget_alert',
        ];

        for (const type of NAMED_EVENTS) {
          eventSource.addEventListener(type, (ev: MessageEvent) => {
            handleEnvelope(ev.data, ev.lastEventId);
          });
        }
        eventSource.onmessage = (ev) => handleEnvelope(ev.data, ev.lastEventId);

        eventSource.onerror = () => {
          if (cancelled) return;
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: new Error('EventSource error'),
          }));
          // EventSource reconnects automatically using retry: + the
          // browser-native ``Last-Event-ID`` behaviour, so we do NOT
          // call close() here. Caller decides whether to abandon.
        };
      } catch (err) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: err instanceof Error ? err : new Error(String(err)),
        }));
      }
    };

    void connect();

    return () => {
      cancelled = true;
      closedRef.current = true;
      if (eventSource) {
        eventSource.close();
      }
      eventSourceRef.current = null;
    };
    // ``opts`` may include closures that change every render; callers
    // should memoise them. We explicitly only re-run on sessionId /
    // baseUrl / enabled changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, baseUrl, opts.enabled, bufferSize]);

  return { ...state, close };
}

// -----------------------------------------------------------------
// createSession helper (plain fetch; not a hook)
// -----------------------------------------------------------------

export interface CreateSessionInput {
  prompt: string;
  model?: 'claude-opus-4-7' | 'claude-sonnet-4-6' | 'claude-haiku-4-5';
  maxTokens?: number;
  budgetUsdCap?: number;
  thinking?: boolean;
  tools?: string[];
  systemPrompt?: string;
  mode?: 'web' | 'tauri' | 'mcp';
}

export interface CreateSessionResponse {
  session_id: string;
  status: 'queued' | 'running';
  stream_url: string;
  cancel_url: string;
  created_at: string;
}

/**
 * Thin fetch wrapper around ``POST /v1/ma/sessions``. Kept outside
 * the hook so callers can compose the POST independently (e.g. to
 * land a session from a server action) and only open the stream once
 * they have the ``session_id``.
 *
 * ``getBearer`` returns the standard app JWT (NOT the realtime
 * ticket); the realtime ticket is only needed on the SSE open path.
 */
export interface CreateBuilderSessionOptions {
  getBearer: () => Promise<string>;
  baseUrl?: string;
  idempotencyKey?: string;
}

export async function createBuilderSession(
  input: CreateSessionInput,
  options: CreateBuilderSessionOptions,
): Promise<CreateSessionResponse> {
  const { getBearer, baseUrl, idempotencyKey } = options;
  const url = `${baseUrl ?? '/v1'}/ma/sessions`;
  const token = await getBearer();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  const body = JSON.stringify({
    prompt: input.prompt,
    model: input.model ?? 'claude-opus-4-7',
    max_tokens: input.maxTokens ?? 8192,
    budget_usd_cap: input.budgetUsdCap ?? 5.0,
    thinking: input.thinking ?? false,
    tools: input.tools ?? [],
    system_prompt: input.systemPrompt ?? null,
    mode: input.mode ?? 'web',
  });
  const response = await fetch(url, { method: 'POST', headers, body });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`createBuilderSession failed: ${response.status} ${detail}`);
  }
  return (await response.json()) as CreateSessionResponse;
}

// -----------------------------------------------------------------
// cancelBuilderSession helper
// -----------------------------------------------------------------

export interface CancelBuilderSessionResponse {
  session_id: string;
  status: string;
  cancel_requested: boolean;
  cancelled_at_request: string;
}

export async function cancelBuilderSession(
  sessionId: string,
  options: { getBearer: () => Promise<string>; baseUrl?: string },
): Promise<CancelBuilderSessionResponse> {
  const { getBearer, baseUrl } = options;
  const url = `${baseUrl ?? '/v1'}/ma/sessions/${encodeURIComponent(sessionId)}/cancel`;
  const token = await getBearer();
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`cancelBuilderSession failed: ${response.status} ${detail}`);
  }
  return (await response.json()) as CancelBuilderSessionResponse;
}

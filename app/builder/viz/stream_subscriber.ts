//
// stream_subscriber.ts
//
// Conforms to: docs/contracts/pipeline_visualizer.contract.md v0.1.0
// Companion contracts:
//   - docs/contracts/event_bus.contract.md v0.1.0
//   - docs/contracts/managed_agent_executor.contract.md v0.1.0 (MA SSE shape)
//
// Multiplexes two ingress paths into the NERIUM event bus:
//   1. Anthropic Managed Agents SSE streams per session (one EventSource per
//      active MA session) emitted by Heracles lane.
//   2. WebSocket from the local orchestrator for direct-SDK specialist events
//      emitted by Athena / Apollo server-side.
//
// Both paths normalize into `PipelineEvent<T>` envelopes and publish onto the
// in-process event bus. Helios PipelineCanvas subscribes once through the bus
// and never talks to raw streams directly, matching event_bus.contract.md
// Section 4 ("SSE bridge for client-side subscribers ships with Helios").
//
// Reconnect policy: exponential backoff with jitter, capped at 30 seconds,
// capped total attempts at 8 per session endpoint. A "reconnecting" badge is
// driven by the `connection_state` observable that PipelineCanvas reads; this
// module never renders itself.
//

import type {
  EventBus,
  EventHandler,
  PipelineEvent,
  PipelineEventTopic,
  ToolUsePayload,
  StepStartedPayload,
  StepCompletedPayload,
  HandoffPayload,
} from '../../shared/events/pipeline_event';

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed'
  | 'error';

export interface StreamSubscriberOptions {
  readonly bus: EventBus;
  readonly pipelineRunId: string;
  // Returns the current set of MA session endpoints. Helios polls this every
  // time a new pipeline.step.started event fires with vendor_lane
  // 'anthropic_managed'. Heracles populates via runtime state.
  readonly maSseUrlsProvider: () => ReadonlyArray<MaSseEndpoint>;
  // Local orchestrator direct-SDK bridge. Optional; if omitted, SSE only.
  readonly orchestratorWsUrl?: string;
  readonly onConnectionStateChange?: (state: ConnectionState, detail?: string) => void;
  // Dependency injection for tests. Defaults to browser globals.
  readonly eventSourceFactory?: (url: string) => EventSourceLike;
  readonly webSocketFactory?: (url: string) => WebSocketLike;
  readonly nowMs?: () => number;
  readonly setTimeoutFn?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  readonly clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void;
  readonly randomFn?: () => number;
}

export interface MaSseEndpoint {
  readonly session_id: string;
  readonly sse_url: string;
  readonly specialist_id: string;
}

// Minimal interface surface matched by browser EventSource. Lets us mock.
export interface EventSourceLike {
  addEventListener(type: string, listener: (ev: { data: string }) => void): void;
  close(): void;
  readonly readyState?: number;
}

// Minimal interface surface matched by browser WebSocket. Lets us mock.
export interface WebSocketLike {
  addEventListener(type: 'message', listener: (ev: { data: string }) => void): void;
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void;
  close(): void;
  readonly readyState?: number;
}

interface ActiveSseHandle {
  readonly session_id: string;
  readonly specialist_id: string;
  source: EventSourceLike;
  attempts: number;
  backoffTimer?: ReturnType<typeof setTimeout>;
  disposed: boolean;
}

const MAX_RECONNECT_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30_000;

export class StreamSubscriber {
  private readonly bus: EventBus;
  private readonly pipelineRunId: string;
  private readonly maSseUrlsProvider: () => ReadonlyArray<MaSseEndpoint>;
  private readonly orchestratorWsUrl?: string;
  private readonly onConnectionStateChange?: (
    state: ConnectionState,
    detail?: string,
  ) => void;
  private readonly eventSourceFactory: (url: string) => EventSourceLike;
  private readonly webSocketFactory: (url: string) => WebSocketLike;
  private readonly nowMs: () => number;
  private readonly setTimeoutFn: (
    fn: () => void,
    ms: number,
  ) => ReturnType<typeof setTimeout>;
  private readonly clearTimeoutFn: (
    handle: ReturnType<typeof setTimeout>,
  ) => void;
  private readonly randomFn: () => number;

  private readonly activeSse = new Map<string, ActiveSseHandle>();
  private activeWs?: WebSocketLike;
  private wsAttempts = 0;
  private wsBackoffTimer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private state: ConnectionState = 'idle';

  constructor(options: StreamSubscriberOptions) {
    this.bus = options.bus;
    this.pipelineRunId = options.pipelineRunId;
    this.maSseUrlsProvider = options.maSseUrlsProvider;
    this.orchestratorWsUrl = options.orchestratorWsUrl;
    this.onConnectionStateChange = options.onConnectionStateChange;
    this.eventSourceFactory =
      options.eventSourceFactory ?? ((url) => new EventSource(url) as EventSourceLike);
    this.webSocketFactory =
      options.webSocketFactory ?? ((url) => new WebSocket(url) as WebSocketLike);
    this.nowMs = options.nowMs ?? (() => Date.now());
    this.setTimeoutFn =
      options.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimeoutFn =
      options.clearTimeoutFn ?? ((handle) => clearTimeout(handle));
    this.randomFn = options.randomFn ?? Math.random;
  }

  public start(): void {
    if (this.disposed) return;
    this.transitionState('connecting');
    this.reconcileSseSessions();
    if (this.orchestratorWsUrl) {
      this.openWebSocket(this.orchestratorWsUrl);
    } else {
      // Direct SDK path optional; if omitted, SSE alone is sufficient to keep
      // the visualizer responsive.
      this.transitionState('open');
    }
  }

  public dispose(): void {
    this.disposed = true;
    for (const handle of this.activeSse.values()) {
      handle.disposed = true;
      if (handle.backoffTimer) this.clearTimeoutFn(handle.backoffTimer);
      safeCloseSource(handle.source);
    }
    this.activeSse.clear();
    if (this.wsBackoffTimer) this.clearTimeoutFn(this.wsBackoffTimer);
    if (this.activeWs) safeCloseSource(this.activeWs);
    this.activeWs = undefined;
    this.transitionState('closed');
  }

  // Reconcile the desired MA endpoint set with active EventSource handles.
  // Called automatically inside start() and exposed publicly so Helios can
  // re-sync when a new pipeline.step.started event announces a fresh MA lane.
  public reconcileSseSessions(): void {
    if (this.disposed) return;
    const desired = new Map<string, MaSseEndpoint>();
    for (const endpoint of this.maSseUrlsProvider()) {
      desired.set(endpoint.session_id, endpoint);
    }
    for (const [session_id, handle] of this.activeSse) {
      if (!desired.has(session_id)) {
        handle.disposed = true;
        if (handle.backoffTimer) this.clearTimeoutFn(handle.backoffTimer);
        safeCloseSource(handle.source);
        this.activeSse.delete(session_id);
      }
    }
    for (const endpoint of desired.values()) {
      if (!this.activeSse.has(endpoint.session_id)) {
        this.openSseSession(endpoint);
      }
    }
  }

  public connectionState(): ConnectionState {
    return this.state;
  }

  private openSseSession(endpoint: MaSseEndpoint): void {
    const source = this.eventSourceFactory(endpoint.sse_url);
    const handle: ActiveSseHandle = {
      session_id: endpoint.session_id,
      specialist_id: endpoint.specialist_id,
      source,
      attempts: 0,
      disposed: false,
    };
    this.activeSse.set(endpoint.session_id, handle);

    source.addEventListener('agent.message', (ev) =>
      this.ingestMaEvent(endpoint, 'agent.message', ev.data),
    );
    source.addEventListener('agent.tool_use', (ev) =>
      this.ingestMaEvent(endpoint, 'agent.tool_use', ev.data),
    );
    source.addEventListener('span.model_request_end', (ev) =>
      this.ingestMaEvent(endpoint, 'span.model_request_end', ev.data),
    );
    source.addEventListener('session.status_idle', (ev) =>
      this.ingestMaEvent(endpoint, 'session.status_idle', ev.data),
    );
    source.addEventListener('session.error', (ev) =>
      this.ingestMaEvent(endpoint, 'session.error', ev.data),
    );
    // Generic fallback; some SSE servers emit events without an event-type
    // header. Will be dropped if payload can't be classified.
    source.addEventListener('message', (ev) =>
      this.ingestMaEvent(endpoint, 'message', ev.data),
    );
    source.addEventListener('error', () => {
      if (handle.disposed) return;
      this.scheduleSseReconnect(endpoint, handle);
    });
  }

  private ingestMaEvent(
    endpoint: MaSseEndpoint,
    maTopic: string,
    rawPayload: string,
  ): void {
    if (this.disposed) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawPayload);
    } catch {
      // Non-JSON SSE data line; drop per contract error handling.
      return;
    }
    const envelope = translateMaEventToPipelineEvent(
      maTopic,
      parsed,
      endpoint,
      this.pipelineRunId,
    );
    if (!envelope) return;
    void this.bus.publish(envelope);
  }

  private scheduleSseReconnect(
    endpoint: MaSseEndpoint,
    handle: ActiveSseHandle,
  ): void {
    if (handle.disposed || this.disposed) return;
    handle.attempts += 1;
    if (handle.attempts > MAX_RECONNECT_ATTEMPTS) {
      this.transitionState(
        'error',
        `ma_session_reconnect_exhausted:${endpoint.session_id}`,
      );
      return;
    }
    const delay = backoffMs(handle.attempts, this.randomFn);
    this.transitionState(
      'reconnecting',
      `ma_session_backoff:${endpoint.session_id}:${delay}`,
    );
    handle.backoffTimer = this.setTimeoutFn(() => {
      if (handle.disposed || this.disposed) return;
      safeCloseSource(handle.source);
      this.activeSse.delete(endpoint.session_id);
      this.openSseSession(endpoint);
    }, delay);
  }

  private openWebSocket(url: string): void {
    const ws = this.webSocketFactory(url);
    this.activeWs = ws;
    ws.addEventListener('open', () => {
      this.wsAttempts = 0;
      this.transitionState('open');
    });
    ws.addEventListener('message', (ev) => {
      if (this.disposed) return;
      try {
        const parsed = JSON.parse(ev.data) as PipelineEvent<unknown>;
        if (looksLikePipelineEvent(parsed)) {
          void this.bus.publish(parsed);
        }
      } catch {
        // Drop malformed frames; contract guarantees publisher never fails.
      }
    });
    ws.addEventListener('close', () => {
      if (this.disposed) return;
      this.scheduleWsReconnect(url);
    });
    ws.addEventListener('error', () => {
      if (this.disposed) return;
      this.scheduleWsReconnect(url);
    });
  }

  private scheduleWsReconnect(url: string): void {
    this.wsAttempts += 1;
    if (this.wsAttempts > MAX_RECONNECT_ATTEMPTS) {
      this.transitionState('error', 'ws_reconnect_exhausted');
      return;
    }
    const delay = backoffMs(this.wsAttempts, this.randomFn);
    this.transitionState('reconnecting', `ws_backoff:${delay}`);
    this.wsBackoffTimer = this.setTimeoutFn(() => {
      if (this.disposed) return;
      this.openWebSocket(url);
    }, delay);
  }

  private transitionState(next: ConnectionState, detail?: string): void {
    if (this.state === next) return;
    this.state = next;
    this.onConnectionStateChange?.(next, detail);
  }
}

export function backoffMs(attempt: number, randomFn: () => number): number {
  const exponential = Math.min(
    MAX_BACKOFF_MS,
    BASE_BACKOFF_MS * Math.pow(2, attempt - 1),
  );
  const jitter = randomFn() * 0.3 * exponential;
  return Math.round(exponential - 0.15 * exponential + jitter);
}

function safeCloseSource(source: { close: () => void } | undefined): void {
  if (!source) return;
  try {
    source.close();
  } catch {
    // Ignore close errors; connection may already be dead.
  }
}

function looksLikePipelineEvent(value: unknown): value is PipelineEvent<unknown> {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.event_id === 'string' &&
    typeof v.topic === 'string' &&
    typeof v.pipeline_run_id === 'string' &&
    typeof v.occurred_at === 'string' &&
    typeof v.source_agent === 'string' &&
    'payload' in v
  );
}

interface MaRawAgentToolUse {
  readonly tool_name?: string;
  readonly input_preview?: string;
  readonly input?: unknown;
}

interface MaRawAgentMessage {
  readonly text?: string;
  readonly role?: string;
}

interface MaRawSessionIdle {
  readonly tokens_in?: number;
  readonly tokens_out?: number;
  readonly cost_usd?: number;
  readonly wallclock_ms?: number;
  readonly artifact_count?: number;
}

interface MaRawSessionError {
  readonly message?: string;
  readonly retry_count?: number;
}

// Translates MA SSE event shapes per MANAGED_AGENTS_RESEARCH.md Section 105 to
// canonical PipelineEvent envelopes. Returns undefined for events that carry
// no pipeline-visible signal (e.g., stray heartbeats).
export function translateMaEventToPipelineEvent(
  maTopic: string,
  payload: unknown,
  endpoint: MaSseEndpoint,
  pipelineRunId: string,
): PipelineEvent<unknown> | undefined {
  const occurred_at = new Date().toISOString();
  const event_id = synthesizeEventId();
  const source_agent = endpoint.specialist_id;

  switch (maTopic) {
    case 'agent.tool_use': {
      const p = payload as MaRawAgentToolUse;
      const toolUse: ToolUsePayload = {
        specialist_id: endpoint.specialist_id,
        tool_name: typeof p.tool_name === 'string' ? p.tool_name : 'unknown',
        tool_input_preview: trimPreview(
          typeof p.input_preview === 'string'
            ? p.input_preview
            : safeStringify(p.input),
        ),
      };
      const envelope: PipelineEvent<ToolUsePayload> = {
        event_id,
        topic: 'pipeline.step.tool_use',
        pipeline_run_id: pipelineRunId,
        occurred_at,
        source_agent,
        payload: toolUse,
      };
      return envelope;
    }
    case 'span.model_request_end': {
      const stepStarted: StepStartedPayload = {
        specialist_id: endpoint.specialist_id,
        role: 'integration_engineer',
        vendor_lane: 'anthropic_managed',
        budget_tokens: 0,
        budget_wallclock_seconds: 0,
      };
      const envelope: PipelineEvent<StepStartedPayload> = {
        event_id,
        topic: 'pipeline.step.started',
        pipeline_run_id: pipelineRunId,
        occurred_at,
        source_agent,
        payload: stepStarted,
      };
      return envelope;
    }
    case 'session.status_idle': {
      const p = payload as MaRawSessionIdle;
      const stepCompleted: StepCompletedPayload = {
        specialist_id: endpoint.specialist_id,
        tokens_consumed: {
          input: typeof p.tokens_in === 'number' ? p.tokens_in : 0,
          output: typeof p.tokens_out === 'number' ? p.tokens_out : 0,
        },
        cost_usd: typeof p.cost_usd === 'number' ? p.cost_usd : 0,
        wallclock_ms: typeof p.wallclock_ms === 'number' ? p.wallclock_ms : 0,
        artifact_count:
          typeof p.artifact_count === 'number' ? p.artifact_count : 0,
      };
      const envelope: PipelineEvent<StepCompletedPayload> = {
        event_id,
        topic: 'pipeline.step.completed',
        pipeline_run_id: pipelineRunId,
        occurred_at,
        source_agent,
        payload: stepCompleted,
      };
      return envelope;
    }
    case 'session.error': {
      const p = payload as MaRawSessionError;
      const envelope: PipelineEvent<{
        specialist_id: string;
        error_message: string;
        retry_count: number;
      }> = {
        event_id,
        topic: 'pipeline.step.failed',
        pipeline_run_id: pipelineRunId,
        occurred_at,
        source_agent,
        payload: {
          specialist_id: endpoint.specialist_id,
          error_message:
            typeof p.message === 'string' ? p.message : 'ma_session_error',
          retry_count: typeof p.retry_count === 'number' ? p.retry_count : 0,
        },
      };
      return envelope;
    }
    case 'agent.message': {
      const p = payload as MaRawAgentMessage;
      // Treat agent messages as a lightweight handoff signal so Helios can
      // flash the edge even before a real handoff fires. Optional.
      if (typeof p.text !== 'string' || p.text.length === 0) return undefined;
      return undefined;
    }
    case 'message':
    default:
      return undefined;
  }
}

function trimPreview(value: string): string {
  if (value.length <= 200) return value;
  return `${value.slice(0, 197)}...`;
}

function safeStringify(value: unknown): string {
  if (value === undefined || value === null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function synthesizeEventId(): string {
  // RFC 4122 v4-ish synthesis; production path lives in Ananke audit bus and
  // can be swapped in via event_id injection when the bus hops to Redis.
  // crypto.randomUUID is the browser-side primary; fallback keeps Node test
  // environments happy.
  const cryptoObj: { randomUUID?: () => string } | undefined =
    typeof globalThis !== 'undefined'
      ? (globalThis as unknown as { crypto?: { randomUUID?: () => string } })
          .crypto
      : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  const segments = [8, 4, 4, 4, 12].map((n) =>
    Array.from({ length: n }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join(''),
  );
  return segments.join('-');
}

export type SubscriberFilter = (event: PipelineEvent<unknown>) => boolean;

// Convenience helper: subscribe to the bus with an optional topic filter.
// Used internally by PipelineCanvas and by tests that want to drive the
// visualizer from a synthetic event log.
export function subscribeToBus<TPayload>(
  bus: EventBus,
  topic: PipelineEventTopic | '*',
  handler: EventHandler<TPayload>,
): () => void {
  return bus.subscribe(topic, handler);
}

export const STREAM_SUBSCRIBER_CONSTANTS = {
  MAX_RECONNECT_ATTEMPTS,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
};

// Guard-only export kept for tests that want to assert handoff shape in
// isolation. Not consumed by PipelineCanvas at runtime.
export function __debug_isHandoffPayload(
  value: unknown,
): value is HandoffPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.from_specialist === 'string' &&
    typeof v.to_specialist === 'string' &&
    Array.isArray(v.artifact_paths)
  );
}

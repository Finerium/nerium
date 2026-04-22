//
// ma_sse_bridge.ts
//
// Conforms to: docs/contracts/managed_agent_executor.contract.md v0.1.0
// Companion contract: docs/contracts/event_bus.contract.md v0.1.0
// Owner Agent: Heracles (Builder Worker, MA Integration Engineer, P2)
//
// Purpose: subscribe to an MA session's SSE event stream via
// GET /v1/sessions/{id}/stream, parse Anthropic-shaped SSE frames into our
// simplified ManagedSessionEvent shape, and invoke a per-event handler. The
// executor owns the final step of republishing to the pipeline event bus; the
// bridge stays transport-focused so it remains mockable in tests.
//
// Reconnect policy per contract Section 8: on connection drop, reopen with
// Last-Event-ID header up to 3 times. After that, bubble an 'error' kind
// event and stop. The executor treats that as a terminal failure and calls
// spawner.terminate(session_id) before returning SpecialistOutput.
//
// Anthropic-shape-to-NERIUM-kind mapping per contract Section 5:
//   session.started          -> 'step'      (sub_kind: 'session_started')
//   agent.message            -> 'message'
//   agent.tool_use           -> 'tool_use'
//   span.model_request_end   -> 'step'      (sub_kind: 'model_request_end')
//   span.tool_execution_end  -> 'step'      (sub_kind: 'tool_execution_end')
//   session.artifact_written -> 'artifact'
//   session.status_idled     -> 'completed'
//   session.error            -> 'error'
//   (unknown event names)    -> 'step'      (sub_kind: raw event name)
//
// Mapping is deliberately generous because MA is in beta and event names may
// shift between releases. The bridge logs unrecognised event names via the
// optional `on_unknown_event` diagnostic hook instead of throwing.
//

import { ManagedSessionSpawner, MaNetworkError } from './ma_session_spawner';

// ---------- Canonical event abstraction (per contract Section 3) ----------

export type ManagedSessionEventKind =
  | 'step'
  | 'tool_use'
  | 'message'
  | 'artifact'
  | 'error'
  | 'completed';

export interface ManagedSessionEvent {
  readonly session_id: string;
  readonly sequence: number;
  readonly kind: ManagedSessionEventKind;
  readonly occurred_at: string;
  readonly payload: Record<string, unknown>;
}

export type ManagedSessionEventHandler = (event: ManagedSessionEvent) => void | Promise<void>;

// ---------- Raw SSE frame shape ----------

interface RawSseFrame {
  readonly event_name: string;
  readonly data: string;
  readonly id?: string;
}

// ---------- Bridge configuration ----------

export interface MaSseBridgeConfig {
  readonly spawner: ManagedSessionSpawner;
  readonly max_reconnect_attempts: number;
  readonly reconnect_backoff_ms: ReadonlyArray<number>;
  readonly on_unknown_event?: (raw_event_name: string) => void;
}

export const DEFAULT_SSE_BRIDGE_CONFIG: Omit<MaSseBridgeConfig, 'spawner'> = {
  max_reconnect_attempts: 3,
  reconnect_backoff_ms: [500, 1500, 4000],
};

// ---------- Bridge implementation ----------

export class MaSseBridge {
  private readonly config: MaSseBridgeConfig;

  constructor(config: Partial<MaSseBridgeConfig> & Pick<MaSseBridgeConfig, 'spawner'>) {
    this.config = {
      ...DEFAULT_SSE_BRIDGE_CONFIG,
      ...config,
    };
  }

  // Subscribe to a session's event stream. Returns an unsubscribe function.
  // The handler is awaited serially per event to preserve ordering; callers
  // that need concurrency can dispatch internally.
  subscribe(
    session_id: string,
    handler: ManagedSessionEventHandler,
  ): () => void {
    const controller = new AbortController();
    let last_event_id: string | undefined;
    let sequence = 0;
    let stopped = false;

    const run = async (): Promise<void> => {
      for (
        let attempt = 0;
        attempt <= this.config.max_reconnect_attempts && !stopped;
        attempt += 1
      ) {
        try {
          const response = await fetch(
            this.config.spawner.sessionEventsUrl(session_id),
            {
              method: 'GET',
              headers: this.config.spawner.headersForStream(last_event_id),
              signal: controller.signal,
            },
          );
          if (!response.ok || !response.body) {
            if (response.status === 403) {
              await handler(
                this.makeEvent(session_id, sequence++, 'error', {
                  reason: 'sse_access_denied',
                  status: response.status,
                }),
              );
              return;
            }
            if (attempt >= this.config.max_reconnect_attempts) {
              await handler(
                this.makeEvent(session_id, sequence++, 'error', {
                  reason: 'sse_unrecoverable_status',
                  status: response.status,
                }),
              );
              return;
            }
            await sleep(this.backoffDelay(attempt));
            continue;
          }

          const iter = parseSseStream(response.body);
          for await (const frame of iter) {
            if (stopped) return;
            if (frame.id) last_event_id = frame.id;
            const event = this.mapFrameToEvent(session_id, sequence++, frame);
            if (!event) continue;
            await handler(event);
            if (event.kind === 'completed' || event.kind === 'error') {
              return;
            }
          }
          // Stream ended cleanly without explicit completed. Surface as
          // completed with inferred reason so executor can finalise.
          await handler(
            this.makeEvent(session_id, sequence++, 'completed', {
              reason: 'stream_closed_without_explicit_idled',
            }),
          );
          return;
        } catch (error) {
          if (stopped) return;
          if (attempt >= this.config.max_reconnect_attempts) {
            const message = error instanceof Error ? error.message : String(error);
            await handler(
              this.makeEvent(session_id, sequence++, 'error', {
                reason: 'sse_reconnect_exhausted',
                cause: message,
              }),
            );
            return;
          }
          await sleep(this.backoffDelay(attempt));
        }
      }
    };

    // Fire-and-forget, caller unsubscribes via returned function.
    void run().catch((error) => {
      const message = error instanceof MaNetworkError ? error.message : String(error);
      // Do not throw from async context. Emit a final error event so the
      // executor sees a terminal state and resolves.
      void handler(
        this.makeEvent(session_id, sequence++, 'error', {
          reason: 'sse_unexpected_throw',
          cause: message,
        }),
      );
    });

    return () => {
      stopped = true;
      controller.abort();
    };
  }

  private backoffDelay(attempt: number): number {
    const table = this.config.reconnect_backoff_ms;
    const index = Math.min(attempt, table.length - 1);
    return table[index];
  }

  private mapFrameToEvent(
    session_id: string,
    sequence: number,
    frame: RawSseFrame,
  ): ManagedSessionEvent | null {
    const parsed = safeParseJson(frame.data);
    const occurred_at =
      (parsed && typeof parsed.occurred_at === 'string' && parsed.occurred_at) ||
      new Date().toISOString();
    const payload: Record<string, unknown> = parsed && typeof parsed === 'object' ? parsed : {};

    const kind = this.resolveKind(frame.event_name);
    if (kind === null) {
      if (this.config.on_unknown_event) {
        this.config.on_unknown_event(frame.event_name);
      }
      return {
        session_id,
        sequence,
        kind: 'step',
        occurred_at,
        payload: { ...payload, raw_event_name: frame.event_name, sub_kind: 'unknown' },
      };
    }

    // Decorate with sub_kind for the 'step' meta-kind so downstream consumers
    // can distinguish session-level started/finished from inner model spans.
    const decorated_payload =
      kind === 'step'
        ? { ...payload, sub_kind: this.deriveSubKind(frame.event_name) }
        : payload;

    return {
      session_id,
      sequence,
      kind,
      occurred_at,
      payload: decorated_payload,
    };
  }

  private resolveKind(raw_event_name: string): ManagedSessionEventKind | null {
    switch (raw_event_name) {
      case 'session.started':
      case 'span.model_request_end':
      case 'span.tool_execution_end':
      case 'step':
      case 'step.started':
      case 'step.completed':
        return 'step';
      case 'agent.message':
      case 'message':
        return 'message';
      case 'agent.tool_use':
      case 'tool_use':
        return 'tool_use';
      case 'session.artifact_written':
      case 'artifact':
        return 'artifact';
      case 'session.status_idled':
      case 'completed':
        return 'completed';
      case 'session.error':
      case 'error':
        return 'error';
      default:
        return null;
    }
  }

  private deriveSubKind(raw_event_name: string): string {
    if (raw_event_name === 'session.started') return 'session_started';
    if (raw_event_name === 'span.model_request_end') return 'model_request_end';
    if (raw_event_name === 'span.tool_execution_end') return 'tool_execution_end';
    if (raw_event_name === 'step.started') return 'step_started';
    if (raw_event_name === 'step.completed') return 'step_completed';
    return raw_event_name;
  }

  private makeEvent(
    session_id: string,
    sequence: number,
    kind: ManagedSessionEventKind,
    payload: Record<string, unknown>,
  ): ManagedSessionEvent {
    return {
      session_id,
      sequence,
      kind,
      occurred_at: new Date().toISOString(),
      payload,
    };
  }
}

// ---------- SSE framing parser ----------
//
// Async iterator over a Response body that yields RawSseFrame values. Follows
// the SSE spec on line splitting and field handling. Data field is aggregated
// across multiple `data:` lines; blank line dispatches a frame.

async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<RawSseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event_name = 'message';
  let data_lines: string[] = [];
  let last_id: string | undefined;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        // Flush trailing buffered frame if any.
        if (data_lines.length > 0) {
          yield {
            event_name,
            data: data_lines.join('\n'),
            id: last_id,
          };
        }
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      let newline_index = buffer.indexOf('\n');
      while (newline_index !== -1) {
        const raw_line = buffer.slice(0, newline_index).replace(/\r$/, '');
        buffer = buffer.slice(newline_index + 1);
        if (raw_line === '') {
          if (data_lines.length > 0) {
            yield {
              event_name,
              data: data_lines.join('\n'),
              id: last_id,
            };
          }
          event_name = 'message';
          data_lines = [];
          newline_index = buffer.indexOf('\n');
          continue;
        }
        if (raw_line.startsWith(':')) {
          // Comment line per SSE spec.
          newline_index = buffer.indexOf('\n');
          continue;
        }
        const colon = raw_line.indexOf(':');
        const field = colon === -1 ? raw_line : raw_line.slice(0, colon);
        const field_value_raw = colon === -1 ? '' : raw_line.slice(colon + 1);
        const field_value = field_value_raw.startsWith(' ')
          ? field_value_raw.slice(1)
          : field_value_raw;
        if (field === 'event') {
          event_name = field_value;
        } else if (field === 'data') {
          data_lines.push(field_value);
        } else if (field === 'id') {
          last_id = field_value;
        }
        newline_index = buffer.indexOf('\n');
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Ignore; reader already released.
    }
  }
}

function safeParseJson(value: string): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { raw: parsed } as Record<string, unknown>;
  } catch {
    return { raw_text: value };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

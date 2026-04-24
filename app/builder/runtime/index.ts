//
// app/builder/runtime/index.ts
//
// Barrel export for the Builder runtime data layer. UI components in
// ``app/builder/*`` import from here so the SSE hook + HTTP helpers
// stay co-located.
//
// Owner: Kratos (W2 P2 S3). Visual chrome lives under Marshall P6;
// this module intentionally ships no React UI.
//

export type {
  BuilderEventEnvelope,
  BuilderEventType,
  BuilderStreamState,
  BuilderStreamStatus,
  CancelBuilderSessionResponse,
  CreateBuilderSessionOptions,
  CreateSessionInput,
  CreateSessionResponse,
  UseBuilderStreamOptions,
} from './useBuilderStream';

export {
  cancelBuilderSession,
  createBuilderSession,
  useBuilderStream,
} from './useBuilderStream';

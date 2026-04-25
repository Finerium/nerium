'use client';
//
// app/protocol/page.tsx
//
// Nemea Phase 5 QA emergency harness (2026-04-22). Renders the Triton
// TranslationSplit against the prebaked Lumio scenario using the shipped
// Anthropic + Gemini-mock adapters, then stacks the Morpheus MultiVendor
// panel below so both Protocol surfaces share a single route. The
// MultiVendorPanel exercises the enforceMockPolicy path so every non-
// Anthropic assignment is auto-locked to `mock` per the honest-claim policy.
//

import { useMemo, useState } from 'react';
import TranslationSplit from './demo/TranslationSplit';
import MultiVendorPanel from './vendor/MultiVendorPanel';
import { AnthropicAdapter } from './adapters/anthropic_adapter';
import { GeminiAdapterMock } from './adapters/gemini_adapter.mock';
import {
  PREBAKED_INTENT,
  PREBAKED_CLAUDE_RAW_RESPONSE,
  PREBAKED_GEMINI_MOCK_RAW_RESPONSE,
} from './demo/translation_demo_types';
import {
  enforceMockPolicy,
  type VendorAssignment,
  type VendorCapabilityProfile,
} from './vendor/vendor_adapter_ui_types';
import { HarnessShell } from '../_harness/HarnessShell';

const INITIAL_ASSIGNMENTS: ReadonlyArray<VendorAssignment> = enforceMockPolicy([
  { task: 'strategy', vendor_id: 'anthropic', execution_status: 'real' },
  { task: 'code_generation', vendor_id: 'anthropic', execution_status: 'real' },
  { task: 'copywriting', vendor_id: 'anthropic', execution_status: 'real' },
  { task: 'image_generation', vendor_id: 'gemini', execution_status: 'mock' },
  { task: 'research', vendor_id: 'anthropic', execution_status: 'real' },
]);

export default function ProtocolPage() {
  const { leftAdapter, rightAdapter, prebakedResponse, availableVendors } =
    useMemo(() => {
      const anth = new AnthropicAdapter();
      const gem = new GeminiAdapterMock();
      const available: VendorCapabilityProfile[] = [anth.profile, gem.profile];
      return {
        leftAdapter: anth,
        rightAdapter: gem,
        prebakedResponse: {
          left: anth.parseResponse(PREBAKED_CLAUDE_RAW_RESPONSE),
          right: gem.parseResponse(PREBAKED_GEMINI_MOCK_RAW_RESPONSE),
        },
        availableVendors: available,
      };
    }, []);

  const [assignments, setAssignments] = useState<VendorAssignment[]>(
    [...INITIAL_ASSIGNMENTS],
  );

  return (
    <HarnessShell
      heading="Protocol"
      sub="Cross-model translation. Claude keeps its XML tags, Gemini speaks native. Same AgentIntent, two faithful serializations with fidelity notes where Claude-only features drop."
    >
      <TranslationSplit
        intent={PREBAKED_INTENT}
        leftAdapter={leftAdapter}
        rightAdapter={rightAdapter}
        mode="prebaked"
        prebakedResponse={prebakedResponse}
      />
      <div style={{ marginTop: '2.5rem' }}>
        <MultiVendorPanel
          assignments={assignments}
          availableVendors={availableVendors}
          onAssignmentChange={(next) => setAssignments(enforceMockPolicy(next))}
        />
      </div>
    </HarnessShell>
  );
}

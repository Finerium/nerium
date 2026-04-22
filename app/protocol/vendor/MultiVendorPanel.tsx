'use client';

//
// MultiVendorPanel.tsx (Morpheus P3b).
//
// Conforms to:
// - docs/contracts/vendor_adapter_ui.contract.md v0.1.0 (Section 3
//   MultiVendorPanelProps, Section 4 interface rules, Section 5 event names,
//   Section 9 testing surface).
// - docs/contracts/protocol_adapter.contract.md v0.1.0 (VendorId,
//   VendorCapabilityProfile).
// - docs/heracles.decisions.md ADR-011 (MA lane HIDDEN in Multi-vendor mode).
// - docs/apollo.decisions.md ADR-0001 / ADR-0002 (multi_vendor mode is
//   UI-surfaceable with honest-claim annotation).
// - NarasiGhaisan Section 3 (model flexibility brand prop) and Section 16
//   (honest framing, non-dismissible annotation).
//
// Composition (top-to-bottom):
//   1. HonestAnnotation banner.        role=note, always-visible, locked text
//   2. Strategy mode context strip.    shows we are inside "multi_vendor" view
//   3. TaskAssignmentGrid.             interactive per-task picker
//   4. Assignment summary footer.      shows current assignments, mock counts
//
// Honest-claim enforcement:
// - annotation is mounted first so it is seen before the grid (contract
//   Section 4: "<MultiVendorPanel> renders the honest annotation at the top,
//   always visible").
// - every non-anthropic assignment is forced to execution_status='mock'
//   before onAssignmentChange fires (contract Section 4 + Section 9 test
//   "execution status auto-mock").
// - annotation_text override falls back to locked default when blank.
//
// MA lane visibility:
// - MA (Managed Agents) is an Anthropic-only lane (Heracles ADR-011).
// - Since this panel ONLY renders when strategy=multi_vendor, per ADR-011 the
//   MA lane must NOT be shown here at all. Morpheus implements this by
//   refusing to render any "ma" / "managed_agents" pseudo-vendor chip even if
//   a caller leaks one into `availableVendors`, and by omitting an MA task
//   row entirely from the grid. The filter is centralised below so future
//   additions flow through a single guard.
//

import { useCallback, useMemo, type ReactElement } from 'react';

import TaskAssignmentGrid from './TaskAssignmentGrid';
import HonestAnnotation from './HonestAnnotation';

import './styles.css';
import type {
  MultiVendorPanelProps,
  TaskDimension,
  VendorAssignment,
  VendorCapabilityProfile,
  VendorId,
} from './vendor_adapter_ui_types';
import {
  TASK_LABELS,
  VENDOR_LABELS,
  enforceMockPolicy,
  isMockVendor,
  normaliseExecutionStatus,
} from './vendor_adapter_ui_types';
import {
  HONEST_CLAIM_LOCKED_TEXT,
  MOCK_BADGE_LABEL,
} from './annotation_text.constant';

// Heracles ADR-011: the Managed Agents lane must not surface inside the
// multi_vendor strategy view. We keep the filter centralised so future
// additions (e.g., an "managed_agents" pseudo-vendor key) flow through here.
const MA_LANE_TOKENS: ReadonlySet<string> = new Set([
  'managed_agents',
  'ma',
  'anthropic_ma',
]);

function stripManagedAgentsLane(
  vendors: VendorCapabilityProfile[],
): VendorCapabilityProfile[] {
  return vendors.filter(
    (v) => !MA_LANE_TOKENS.has(String(v.vendor_id).toLowerCase()),
  );
}

function defaultAnthropicProfile(): VendorCapabilityProfile {
  return {
    vendor_id: 'anthropic',
    supports_xml_tagging: true,
    supports_system_prompt: true,
    supports_prompt_caching: true,
    supports_tool_use: true,
    supports_multimodal_input: true,
    supports_streaming: true,
    max_context_window_tokens: 1_000_000,
    native_format_name: 'anthropic_messages_v1',
  };
}

function buildNextAssignments(
  current: VendorAssignment[],
  task: TaskDimension,
  vendor_id: VendorId,
): VendorAssignment[] {
  const existing = current.find((a) => a.task === task);
  const next: VendorAssignment = {
    task,
    vendor_id,
    execution_status: normaliseExecutionStatus(vendor_id),
    rationale: existing?.rationale,
  };
  const withoutTask = current.filter((a) => a.task !== task);
  return [...withoutTask, next];
}

export default function MultiVendorPanel(
  props: MultiVendorPanelProps,
): ReactElement {
  const {
    assignments,
    availableVendors,
    onAssignmentChange,
    annotation_text,
    readOnly,
  } = props;

  const vendors = useMemo<VendorCapabilityProfile[]>(() => {
    const stripped = stripManagedAgentsLane(availableVendors);
    if (stripped.length === 0) {
      return [defaultAnthropicProfile()];
    }
    const hasAnthropic = stripped.some((v) => v.vendor_id === 'anthropic');
    return hasAnthropic
      ? stripped
      : [defaultAnthropicProfile(), ...stripped];
  }, [availableVendors]);

  const safeAnnotationText = (() => {
    if (annotation_text === undefined) return HONEST_CLAIM_LOCKED_TEXT;
    const trimmed = annotation_text.trim();
    if (trimmed.length === 0) {
      if (typeof console !== 'undefined') {
        console.warn(
          'MultiVendorPanel: empty annotation_text, falling back to locked default per contract Section 8.',
        );
      }
      return HONEST_CLAIM_LOCKED_TEXT;
    }
    return trimmed;
  })();

  const normalisedAssignments = useMemo<VendorAssignment[]>(() => {
    return enforceMockPolicy(assignments);
  }, [assignments]);

  const handleToggle = useCallback(
    (task: TaskDimension, vendor_id: VendorId) => {
      if (readOnly) return;
      const next = buildNextAssignments(normalisedAssignments, task, vendor_id);
      const enforced = enforceMockPolicy(next);
      onAssignmentChange(enforced);
    },
    [normalisedAssignments, onAssignmentChange, readOnly],
  );

  const mockCount = normalisedAssignments.filter((a) =>
    isMockVendor(a.vendor_id),
  ).length;
  const liveCount = normalisedAssignments.length - mockCount;

  const distinctVendors = Array.from(
    new Set(normalisedAssignments.map((a) => a.vendor_id)),
  );

  return (
    <section
      className="morpheus-panel"
      aria-label="Multi-vendor assignment panel"
      data-strategy-mode="multi_vendor"
      data-read-only={readOnly ? 'true' : 'false'}
    >
      <HonestAnnotation
        text={safeAnnotationText}
        severity="advisory"
        alwaysVisible
        className="morpheus-panel-annotation"
      />

      <header className="morpheus-panel-header">
        <div className="morpheus-panel-title">
          <span className="morpheus-panel-eyebrow">Strategy</span>
          <h2 className="morpheus-panel-heading">Multi-vendor plan</h2>
        </div>
        <p className="morpheus-panel-subheading">
          Pick which vendor handles each task. Anthropic assignments run live
          in this demo. Everything else stays simulated until the
          post-hackathon multi-vendor unlock.
        </p>
      </header>

      <TaskAssignmentGrid
        assignments={normalisedAssignments}
        availableVendors={vendors}
        onToggle={handleToggle}
        readOnly={readOnly}
      />

      <footer
        className="morpheus-panel-summary"
        aria-label="Current multi-vendor plan summary"
      >
        <dl className="morpheus-panel-summary-metrics">
          <div className="morpheus-panel-summary-metric">
            <dt>Assignments</dt>
            <dd>{normalisedAssignments.length}</dd>
          </div>
          <div className="morpheus-panel-summary-metric">
            <dt>Live (Anthropic)</dt>
            <dd>{liveCount}</dd>
          </div>
          <div
            className="morpheus-panel-summary-metric"
            data-variant="mock"
          >
            <dt>Simulated</dt>
            <dd>{mockCount}</dd>
          </div>
          <div className="morpheus-panel-summary-metric">
            <dt>Distinct vendors</dt>
            <dd>{distinctVendors.length}</dd>
          </div>
        </dl>
        {normalisedAssignments.length > 0 ? (
          <ul className="morpheus-panel-summary-list">
            {normalisedAssignments.map((a) => (
              <li key={a.task} className="morpheus-panel-summary-row">
                <span className="morpheus-panel-summary-task">
                  {TASK_LABELS[a.task]}
                </span>
                <span className="morpheus-panel-summary-arrow" aria-hidden="true">
                  {'->'}
                </span>
                <span
                  className="morpheus-panel-summary-vendor"
                  data-mock={isMockVendor(a.vendor_id) ? 'true' : 'false'}
                >
                  {VENDOR_LABELS[a.vendor_id]}
                </span>
                {isMockVendor(a.vendor_id) ? (
                  <span
                    className="morpheus-panel-summary-badge"
                    aria-label="simulated execution"
                  >
                    {MOCK_BADGE_LABEL}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </footer>
    </section>
  );
}

export {
  buildNextAssignments,
  stripManagedAgentsLane,
  defaultAnthropicProfile,
};

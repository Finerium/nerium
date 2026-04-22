'use client';

//
// TaskAssignmentGrid.tsx (Morpheus P3b).
//
// Conforms to:
// - docs/contracts/vendor_adapter_ui.contract.md v0.1.0
//   (Section 3 TaskAssignmentGridProps, Section 4 2D grid interaction,
//    Section 8 error handling, Section 9 testing surface).
// - docs/contracts/protocol_adapter.contract.md v0.1.0 VendorId values.
//
// Grid layout: rows = TaskDimension, columns = VendorCapabilityProfile.
// Each cell is a button that assigns its (task, vendor_id) pair. Current
// assignment per row is marked with `aria-pressed="true"`. A cell whose
// vendor capability does not cover the task still renders and is clickable;
// when selected we surface a capability warning badge so the user sees they
// picked a mismatched pairing (contract Section 8: "permitted but flagged").
//
// Keyboard model: standard button semantics. Tab through cells row-by-row.
// Space / Enter activate. Arrow keys are not intercepted; native tab order
// and browser defaults apply so the grid behaves like a table of toggles,
// mirroring the advisor-pill pattern already established in styles.css.
//
// Mock badge: any vendor !== 'anthropic' is demo-mock per hackathon scope
// (CLAUDE.md anti-pattern 7). The badge reads "simulated" so the label never
// overclaims live multi-vendor routing. See annotation_text.constant.ts.
//

import { useCallback, type KeyboardEvent, type ReactElement } from 'react';

import type {
  TaskAssignmentGridProps,
  TaskDimension,
  VendorAssignment,
  VendorCapabilityProfile,
  VendorId,
} from './vendor_adapter_ui_types';
import {
  TASK_DIMENSIONS,
  TASK_LABELS,
  VENDOR_LABELS,
  isMockVendor,
} from './vendor_adapter_ui_types';
import {
  ANTHROPIC_BADGE_LABEL,
  MOCK_BADGE_LABEL,
} from './annotation_text.constant';

function findAssignment(
  assignments: VendorAssignment[],
  task: TaskDimension,
): VendorAssignment | undefined {
  return assignments.find((a) => a.task === task);
}

function vendorSupportsTask(
  profile: VendorCapabilityProfile,
  task: TaskDimension,
): boolean {
  switch (task) {
    case 'image_generation':
    case 'video_generation':
      return profile.supports_multimodal_input;
    case 'code_generation':
    case 'strategy':
    case 'ui_design':
    case 'copywriting':
    case 'data_analysis':
    case 'research':
      return true;
    default:
      return true;
  }
}

export default function TaskAssignmentGrid(
  props: TaskAssignmentGridProps,
): ReactElement {
  const { assignments, availableVendors, onToggle, readOnly } = props;

  const vendors: VendorCapabilityProfile[] =
    availableVendors.length > 0
      ? availableVendors
      : [
          {
            vendor_id: 'anthropic',
            supports_xml_tagging: true,
            supports_system_prompt: true,
            supports_prompt_caching: true,
            supports_tool_use: true,
            supports_multimodal_input: true,
            supports_streaming: true,
            max_context_window_tokens: 1_000_000,
            native_format_name: 'anthropic_messages_v1',
          },
        ];

  const handleCellActivate = useCallback(
    (task: TaskDimension, vendor_id: VendorId) => {
      if (readOnly) return;
      const existing = findAssignment(assignments, task);
      if (existing && existing.vendor_id === vendor_id) return;
      onToggle(task, vendor_id);
    },
    [assignments, onToggle, readOnly],
  );

  const handleKeyDown = useCallback(
    (
      event: KeyboardEvent<HTMLButtonElement>,
      task: TaskDimension,
      vendor_id: VendorId,
    ) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      handleCellActivate(task, vendor_id);
    },
    [handleCellActivate],
  );

  const emptyVendors = vendors.length === 0;

  return (
    <div
      className="morpheus-grid"
      role="table"
      aria-label="Per-task vendor assignment grid"
      aria-readonly={readOnly ? 'true' : 'false'}
    >
      <div className="morpheus-grid-row morpheus-grid-row-header" role="row">
        <span className="morpheus-grid-header-cell morpheus-grid-task-cell" role="columnheader">
          Task
        </span>
        {vendors.map((vendor) => {
          const mock = isMockVendor(vendor.vendor_id);
          return (
            <span
              key={vendor.vendor_id}
              className="morpheus-grid-header-cell"
              role="columnheader"
              data-mock={mock ? 'true' : 'false'}
            >
              <span className="morpheus-vendor-name">
                {VENDOR_LABELS[vendor.vendor_id]}
              </span>
              <span
                className="morpheus-vendor-status"
                data-mock={mock ? 'true' : 'false'}
              >
                {mock ? MOCK_BADGE_LABEL : ANTHROPIC_BADGE_LABEL}
              </span>
            </span>
          );
        })}
      </div>

      {TASK_DIMENSIONS.map((task) => {
        const assignment = findAssignment(assignments, task);
        return (
          <div
            key={task}
            className="morpheus-grid-row"
            role="row"
            data-assigned={assignment ? 'true' : 'false'}
          >
            <span
              className="morpheus-grid-task-cell"
              role="rowheader"
              scope="row"
            >
              {TASK_LABELS[task]}
            </span>
            {vendors.map((vendor) => {
              const selected = assignment?.vendor_id === vendor.vendor_id;
              const mock = isMockVendor(vendor.vendor_id);
              const capable = vendorSupportsTask(vendor, task);
              const capabilityWarn = selected && !capable;
              return (
                <button
                  key={`${task}-${vendor.vendor_id}`}
                  type="button"
                  role="gridcell"
                  className="morpheus-grid-cell"
                  aria-pressed={selected}
                  aria-label={`Assign ${VENDOR_LABELS[vendor.vendor_id]} to ${TASK_LABELS[task]}${
                    mock ? ', simulated execution' : ''
                  }${capabilityWarn ? ', capability mismatch' : ''}`}
                  disabled={readOnly && !selected}
                  data-selected={selected ? 'true' : 'false'}
                  data-mock={mock ? 'true' : 'false'}
                  data-capability-warn={capabilityWarn ? 'true' : 'false'}
                  onClick={() => handleCellActivate(task, vendor.vendor_id)}
                  onKeyDown={(event) =>
                    handleKeyDown(event, task, vendor.vendor_id)
                  }
                >
                  <span className="morpheus-grid-cell-dot" aria-hidden="true" />
                  <span className="morpheus-grid-cell-label">
                    {selected ? 'Assigned' : 'Assign'}
                  </span>
                  {capabilityWarn ? (
                    <span
                      className="morpheus-grid-cell-warn"
                      title="Capability mismatch, will run as mock"
                    >
                      capability mismatch
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        );
      })}

      {emptyVendors ? (
        <p className="morpheus-grid-empty" role="status">
          No vendors available. Default Anthropic fallback rendered.
        </p>
      ) : null}

      {assignments.length === 0 ? (
        <p className="morpheus-grid-prompt" role="status">
          Pick at least one task-vendor pair to preview the multi-vendor plan.
        </p>
      ) : null}
    </div>
  );
}

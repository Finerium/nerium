//
// tests/builder/model_selection_modal.test.ts
//
// Lu (W3 T3) authored unit tests. Runs via `node --test`. Mirrors the
// repo convention used by tests/dialogue.test.ts and tests/quest.test.ts:
// no vitest, no jest, no React renderer; assert pure-function helpers and
// store state transitions only. Component rendering is covered by the
// Playwright spec at tests/builder/model_selection_modal.spec.ts.
//
// Coverage:
//   - sekuriTemplate parser strict-mode rejects malformed payloads.
//   - sekuriTemplate cost aggregator sums vendor cost entries.
//   - builderModelSelectionStore initial state + open/close cycle.
//   - builderModelSelectionStore primary vendor + multi-vendor toggle
//     invariant: primary vendor cannot be unselected, single-vendor mode
//     collapses selection back to the primary.
//

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  __parseSekuriTemplate,
  totalEstimatedCostUsd,
  type SekuriTemplate,
} from '../../src/lib/sekuriTemplate';
import { useBuilderModelSelectionStore } from '../../src/stores/builderModelSelectionStore';

const VALID_RAW = {
  complexity: 'large',
  tier_rationale: 'Marketplace multi-tenant',
  user_options: {
    vendor_choice: 'auto',
    model_specific: 'mixed',
    claude_execution_mode: 'hybrid',
    multi_vendor_routing_enabled: true,
    per_agent_vendor_overrides: {},
  },
  agent_count: 14,
  parallel_groups: [],
  estimated_duration_minutes: 45,
  estimated_cost_usd_per_vendor: {
    anthropic: 5.5,
    google: 1.2,
    higgsfield: 0.8,
    seedance: 0.5,
  },
  user_revisable: true,
  spawned_terminal_count: 6,
  sample_prompts_matched: ['build me a marketplace'],
};

describe('sekuriTemplate parser', () => {
  it('parses a valid large template', () => {
    const t = __parseSekuriTemplate(VALID_RAW);
    assert.equal(t.complexity, 'large');
    assert.equal(t.user_options.claude_execution_mode, 'hybrid');
    assert.equal(t.agent_count, 14);
    assert.equal(t.estimated_cost_usd_per_vendor.anthropic, 5.5);
  });

  it('rejects an unknown complexity', () => {
    assert.throws(() => {
      __parseSekuriTemplate({
        ...VALID_RAW,
        complexity: 'huge',
      });
    });
  });

  it('rejects a missing user_options block', () => {
    const { user_options: _drop, ...rest } = VALID_RAW as Record<string, unknown> & {
      user_options: unknown;
    };
    void _drop;
    assert.throws(() => {
      __parseSekuriTemplate(rest);
    });
  });

  it('rejects an invalid claude_execution_mode', () => {
    assert.throws(() => {
      __parseSekuriTemplate({
        ...VALID_RAW,
        user_options: {
          ...VALID_RAW.user_options,
          claude_execution_mode: 'rogue_mode',
        },
      });
    });
  });
});

describe('sekuriTemplate totalEstimatedCostUsd', () => {
  const sample: SekuriTemplate = __parseSekuriTemplate(VALID_RAW);

  it('sums anthropic + google when both selected', () => {
    const total = totalEstimatedCostUsd(sample, ['anthropic', 'google']);
    // 5.5 + 1.2
    assert.equal(Number(total.toFixed(2)), 6.7);
  });

  it('returns zero when no vendor matches', () => {
    const total = totalEstimatedCostUsd(sample, ['ghost-vendor']);
    assert.equal(total, 0);
  });

  it('skips unknown vendor ids gracefully', () => {
    const total = totalEstimatedCostUsd(sample, ['anthropic', 'ghost-vendor']);
    assert.equal(Number(total.toFixed(2)), 5.5);
  });
});

describe('builderModelSelectionStore', () => {
  it('starts closed with anthropic primary', () => {
    useBuilderModelSelectionStore.getState().reset();
    const s = useBuilderModelSelectionStore.getState();
    assert.equal(s.open, false);
    assert.equal(s.primaryVendor, 'anthropic');
    assert.equal(s.multiVendorRoutingEnabled, false);
    assert.deepEqual([...s.selectedVendorIds], ['anthropic']);
    assert.equal(s.complexity, null);
  });

  it('openModal sets complexity and reseeds selection', () => {
    useBuilderModelSelectionStore.getState().reset();
    useBuilderModelSelectionStore.getState().setPrimaryVendor('google');
    useBuilderModelSelectionStore.getState().openModal('large');
    const s = useBuilderModelSelectionStore.getState();
    assert.equal(s.open, true);
    assert.equal(s.complexity, 'large');
    assert.equal(s.primaryVendor, 'anthropic');
    assert.deepEqual([...s.selectedVendorIds], ['anthropic']);
  });

  it('toggleVendor is a no-op while routing is single-vendor', () => {
    useBuilderModelSelectionStore.getState().reset();
    useBuilderModelSelectionStore.getState().openModal('large');
    useBuilderModelSelectionStore.getState().toggleVendor('google');
    const s = useBuilderModelSelectionStore.getState();
    assert.deepEqual([...s.selectedVendorIds], ['anthropic']);
  });

  it('multi-vendor routing toggles vendor membership', () => {
    useBuilderModelSelectionStore.getState().reset();
    useBuilderModelSelectionStore.getState().openModal('large');
    useBuilderModelSelectionStore.getState().setMultiVendorRoutingEnabled(true);
    useBuilderModelSelectionStore.getState().toggleVendor('google');
    let s = useBuilderModelSelectionStore.getState();
    assert.ok(s.selectedVendorIds.includes('google'));
    assert.ok(s.selectedVendorIds.includes('anthropic'));
    // Toggling again removes google.
    useBuilderModelSelectionStore.getState().toggleVendor('google');
    s = useBuilderModelSelectionStore.getState();
    assert.ok(!s.selectedVendorIds.includes('google'));
  });

  it('primary vendor cannot be removed via toggleVendor', () => {
    useBuilderModelSelectionStore.getState().reset();
    useBuilderModelSelectionStore.getState().openModal('large');
    useBuilderModelSelectionStore.getState().setMultiVendorRoutingEnabled(true);
    useBuilderModelSelectionStore.getState().toggleVendor('anthropic');
    const s = useBuilderModelSelectionStore.getState();
    assert.ok(s.selectedVendorIds.includes('anthropic'));
  });

  it('disabling multi-vendor routing collapses selection back to primary', () => {
    useBuilderModelSelectionStore.getState().reset();
    useBuilderModelSelectionStore.getState().openModal('large');
    useBuilderModelSelectionStore.getState().setMultiVendorRoutingEnabled(true);
    useBuilderModelSelectionStore.getState().toggleVendor('google');
    useBuilderModelSelectionStore.getState().toggleVendor('seedance');
    useBuilderModelSelectionStore.getState().setMultiVendorRoutingEnabled(false);
    const s = useBuilderModelSelectionStore.getState();
    assert.equal(s.multiVendorRoutingEnabled, false);
    assert.deepEqual([...s.selectedVendorIds], ['anthropic']);
  });

  it('closeModal flips open false but preserves config', () => {
    useBuilderModelSelectionStore.getState().reset();
    useBuilderModelSelectionStore.getState().openModal('medium');
    useBuilderModelSelectionStore.getState().setClaudeExecutionMode('managed_agents');
    useBuilderModelSelectionStore.getState().closeModal();
    const s = useBuilderModelSelectionStore.getState();
    assert.equal(s.open, false);
    assert.equal(s.claudeExecutionMode, 'managed_agents');
    assert.equal(s.complexity, 'medium');
  });
});

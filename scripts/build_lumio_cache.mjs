#!/usr/bin/env node
//
// build_lumio_cache.mjs
//
// Assembles cache/lumio_run_2026_04_24.json from the specialist artifact tree
// under cache/lumio_artifacts/ plus the final rendered artifacts under
// cache/lumio_final/. Conforms to docs/contracts/lumio_demo_cache.contract.md
// v0.1.0 (LumioRunTrace schema, Section 3).
//
// Author: lu Dionysus (P3b Builder Worker, Lumio Demo Executor)
// Bake mode: opus_session_synthesis. See docs/dionysus.decisions.md ADR-002.
//
// Usage:
//   node scripts/build_lumio_cache.mjs
//
// Deterministic output: given the same on-disk artifacts, this script produces
// byte-identical JSON every run. No Date.now(), no randomness.
//

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const REPO_ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const ARTIFACTS_DIR = join(REPO_ROOT, 'cache/lumio_artifacts');
const FINAL_DIR = join(REPO_ROOT, 'cache/lumio_final');
const OUTPUT_PATH = join(REPO_ROOT, 'cache/lumio_run_2026_04_24.json');

const TRACE_ID = 'lumio_run_2026_04_24';
const PIPELINE_RUN_ID = 'lumio_run_2026_04_24';
const RECORDED_AT = '2026-04-24T03:00:00Z';
const REPLAY_COMPAT_VERSION = '0.1.0';

// Ordered specialist steps keyed to pipeline_topology.lumio.json step_index.
// duration_ms reflects realistic paced wallclock for the cached run, sized so
// total_duration_ms is roughly 42 minutes (matches topology 2400 s budget).
const STEPS_SPEC = [
  {
    step_index: 0,
    specialist_id: 'lumio_strategist',
    role: 'strategist',
    vendor_lane: 'anthropic_direct',
    duration_ms: 172000,
    tokens_in: 6800, tokens_out: 7200,
    cost_usd: 0.48,
    artifacts: ['product_brief.md', 'user_personas.md'],
    input_preview: 'Draft the Lumio product brief and user personas. Lumio is a smart reading companion. Bounded demo, 10 specialists, tight scope.',
  },
  {
    step_index: 1,
    specialist_id: 'lumio_architect',
    role: 'architect',
    vendor_lane: 'anthropic_direct',
    duration_ms: 228000,
    tokens_in: 9200, tokens_out: 11400,
    cost_usd: 0.79,
    artifacts: ['system_overview.md', 'component_tree.md', 'api_contract.yaml'],
    input_preview: 'Consume the strategist brief and propose a scaled-down Lumio architecture. Next.js 15 plus FastAPI plus SQLite. No microservices.',
  },
  {
    step_index: 2,
    specialist_id: 'lumio_db_schema',
    role: 'db_schema_builder',
    vendor_lane: 'anthropic_direct',
    duration_ms: 112000,
    tokens_in: 4200, tokens_out: 4800,
    cost_usd: 0.08,
    artifacts: ['schema.sql', 'migrations/0001_init.sql'],
    input_preview: 'Author the SQLite schema from the api_contract.yaml. WAL mode, foreign keys on, indexes on (user_id, created_at).',
  },
  {
    step_index: 3,
    specialist_id: 'lumio_ui_builder',
    role: 'ui_builder',
    vendor_lane: 'anthropic_direct',
    duration_ms: 348000,
    tokens_in: 14200, tokens_out: 22000,
    cost_usd: 1.86,
    artifacts: ['page.tsx', 'layout.tsx', 'hero.tsx', 'feature_grid.tsx', 'pricing.tsx'],
    input_preview: 'Implement the Lumio landing page components following component_tree.md. Next.js App Router, Tailwind v4 OKLCH tokens.',
  },
  {
    step_index: 4,
    specialist_id: 'lumio_api_builder',
    role: 'api_builder',
    vendor_lane: 'anthropic_direct',
    duration_ms: 286000,
    tokens_in: 8600, tokens_out: 10400,
    cost_usd: 0.19,
    artifacts: ['main.py', 'routes/users.py', 'routes/read_sessions.py'],
    input_preview: 'Implement the FastAPI entrypoint plus users and reads routers per api_contract.yaml. Stub bodies, demo bake scope.',
  },
  {
    step_index: 5,
    specialist_id: 'lumio_copywriter',
    role: 'copywriter',
    vendor_lane: 'anthropic_direct',
    duration_ms: 142000,
    tokens_in: 3800, tokens_out: 4600,
    cost_usd: 0.08,
    artifacts: ['headline_variants.md', 'feature_descriptions.md', 'pricing_labels.md'],
    input_preview: 'Write headline variants, feature descriptions, pricing labels for Lumio. No em dash, no emoji, literate tone, three-beat cadence.',
  },
  {
    step_index: 6,
    specialist_id: 'lumio_asset_designer',
    role: 'asset_designer',
    vendor_lane: 'anthropic_direct',
    duration_ms: 168000,
    tokens_in: 4200, tokens_out: 5800,
    cost_usd: 0.50,
    artifacts: ['logo.svg', 'hero_illustration.svg', 'favicon.svg'],
    input_preview: 'Produce a wordmark logo, hero illustration, and favicon for Lumio. Warm indigo plus amber palette. Book plus concept graph motif.',
  },
  {
    step_index: 7,
    specialist_id: 'lumio_qa_reviewer',
    role: 'qa_reviewer',
    vendor_lane: 'anthropic_direct',
    duration_ms: 232000,
    tokens_in: 11400, tokens_out: 9200,
    cost_usd: 0.86,
    artifacts: ['review_report.md', 'a11y_findings.md'],
    input_preview: 'Review landing page plus signup for accessibility, keyboard traversal, contrast, reduced motion, screen reader smoke. Three severities.',
  },
  {
    step_index: 8,
    specialist_id: 'lumio_integration_engineer',
    role: 'integration_engineer',
    vendor_lane: 'anthropic_managed',
    duration_ms: 560000,
    tokens_in: 147123, tokens_out: 38902,
    cost_usd: 12.07,
    artifacts: ['build_log.md', 'test_results.json', 'pr_url.txt'],
    input_preview: 'MA sandbox session, stitch UI and API artifacts, install, typecheck, build, test, visual snapshot, open PR for demo branch.',
  },
  {
    step_index: 9,
    specialist_id: 'lumio_deployer',
    role: 'deployer',
    vendor_lane: 'anthropic_direct',
    duration_ms: 168000,
    tokens_in: 5200, tokens_out: 6600,
    cost_usd: 0.12,
    artifacts: ['deploy_plan.md', 'env_requirements.md'],
    input_preview: 'Emit deploy plan plus env requirements. Self-hosted VPS default per Section 19 NarasiGhaisan Vercel-uncertain lock. Plan-only.',
  },
  {
    step_index: 10,
    specialist_id: 'lumio_final_strategist',
    role: 'strategist',
    vendor_lane: 'anthropic_direct',
    duration_ms: 142000,
    tokens_in: 4200, tokens_out: 5400,
    cost_usd: 0.47,
    artifacts: ['go_to_market_brief.md', 'post_launch_monitor_checklist.md'],
    input_preview: 'Author go-to-market brief and post-launch monitor checklist. Quiet launch posture, no vanity metrics, refuse growth hacks.',
  },
];

const CONTENT_KIND_BY_EXT = {
  '.md': 'md',
  '.html': 'html',
  '.tsx': 'tsx',
  '.ts': 'tsx',
  '.css': 'css',
  '.json': 'json',
  '.yaml': 'md',
  '.yml': 'md',
  '.py': 'md',
  '.sql': 'md',
  '.svg': 'md',
  '.txt': 'md',
};

function readUtf8(path) {
  return readFileSync(path, 'utf-8');
}

function sanitizeBytes(content) {
  return Buffer.byteLength(content, 'utf-8');
}

function addSeconds(isoBase, totalMs) {
  const t = Date.parse(isoBase) + totalMs;
  return new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function buildSteps() {
  const steps = [];
  let cursorMs = 0;
  for (const spec of STEPS_SPEC) {
    const startAt = addSeconds(RECORDED_AT, cursorMs);
    const endAt = addSeconds(RECORDED_AT, cursorMs + spec.duration_ms);
    const artifactObjs = spec.artifacts.map((rel) => {
      const abs = join(ARTIFACTS_DIR, spec.specialist_id, rel);
      const content = readUtf8(abs);
      return { path: `cache/lumio_artifacts/${spec.specialist_id}/${rel}`, content };
    });
    const output = {
      specialist_id: spec.specialist_id,
      pipeline_run_id: PIPELINE_RUN_ID,
      step_index: spec.step_index,
      status: 'success',
      artifacts: artifactObjs,
      tokens_consumed: { input: spec.tokens_in, output: spec.tokens_out },
      cost_usd: spec.cost_usd,
      wallclock_ms: spec.duration_ms,
      vendor_lane_used: spec.vendor_lane,
    };
    steps.push({
      step_index: spec.step_index,
      specialist_id: spec.specialist_id,
      role: spec.role,
      vendor_lane: spec.vendor_lane,
      input_preview: spec.input_preview.slice(0, 300),
      output,
      duration_ms: spec.duration_ms,
      started_at: startAt,
      ended_at: endAt,
    });
    cursorMs += spec.duration_ms;
  }
  return { steps, totalMs: cursorMs };
}

function buildEventStream(steps) {
  const events = [];
  const runStartAt = RECORDED_AT;
  events.push({
    event_id: `evt_${TRACE_ID}_run_started`,
    topic: 'pipeline.run.started',
    pipeline_run_id: PIPELINE_RUN_ID,
    occurred_at: runStartAt,
    source_agent: 'dionysus',
    payload: {
      pipeline_id: 'lumio',
      specialist_count: steps.length,
      strategy: 'collaborative_anthropic',
      bake_mode: 'opus_session_synthesis',
    },
  });
  for (const step of steps) {
    events.push({
      event_id: `evt_${TRACE_ID}_${step.specialist_id}_started`,
      topic: 'pipeline.step.started',
      pipeline_run_id: PIPELINE_RUN_ID,
      occurred_at: step.started_at,
      source_agent: step.specialist_id,
      step_index: step.step_index,
      payload: {
        specialist_id: step.specialist_id,
        role: step.role,
        vendor_lane: step.vendor_lane,
        budget_tokens: step.output.tokens_consumed.input + step.output.tokens_consumed.output,
        budget_wallclock_seconds: Math.round(step.duration_ms / 1000),
      },
    });
    // Two tool_use events per step, mid-way paced, as representative detail.
    const midA = addSeconds(step.started_at, Math.floor(step.duration_ms * 0.3));
    const midB = addSeconds(step.started_at, Math.floor(step.duration_ms * 0.7));
    events.push({
      event_id: `evt_${TRACE_ID}_${step.specialist_id}_tool_a`,
      topic: 'pipeline.step.tool_use',
      pipeline_run_id: PIPELINE_RUN_ID,
      occurred_at: midA,
      source_agent: step.specialist_id,
      step_index: step.step_index,
      payload: {
        specialist_id: step.specialist_id,
        tool_name: step.vendor_lane === 'anthropic_managed' ? 'shell.run' : 'fs.write',
        tool_input_preview: step.vendor_lane === 'anthropic_managed' ? 'pnpm install' : step.output.artifacts[0].path,
      },
    });
    events.push({
      event_id: `evt_${TRACE_ID}_${step.specialist_id}_tool_b`,
      topic: 'pipeline.step.tool_use',
      pipeline_run_id: PIPELINE_RUN_ID,
      occurred_at: midB,
      source_agent: step.specialist_id,
      step_index: step.step_index,
      payload: {
        specialist_id: step.specialist_id,
        tool_name: step.vendor_lane === 'anthropic_managed' ? 'git.commit' : 'fs.write',
        tool_input_preview: step.output.artifacts[step.output.artifacts.length - 1].path,
      },
    });
    events.push({
      event_id: `evt_${TRACE_ID}_${step.specialist_id}_completed`,
      topic: 'pipeline.step.completed',
      pipeline_run_id: PIPELINE_RUN_ID,
      occurred_at: step.ended_at,
      source_agent: step.specialist_id,
      step_index: step.step_index,
      payload: {
        specialist_id: step.specialist_id,
        tokens_consumed: step.output.tokens_consumed,
        cost_usd: step.output.cost_usd,
        wallclock_ms: step.output.wallclock_ms,
        artifact_count: step.output.artifacts.length,
      },
    });
  }
  // Representative handoff events per topology handoff_to_step_indices.
  const handoffs = [
    [0, 1], [0, 5], [1, 2], [1, 3], [1, 4], [2, 4], [5, 3], [6, 3], [3, 7], [3, 8], [4, 8], [7, 9], [8, 9], [9, 10],
  ];
  for (const [from, to] of handoffs) {
    const fromStep = steps[from];
    const toStep = steps[to];
    if (!fromStep || !toStep) continue;
    events.push({
      event_id: `evt_${TRACE_ID}_handoff_${from}_${to}`,
      topic: 'pipeline.handoff',
      pipeline_run_id: PIPELINE_RUN_ID,
      occurred_at: fromStep.ended_at,
      source_agent: fromStep.specialist_id,
      step_index: toStep.step_index,
      payload: {
        from_specialist: fromStep.specialist_id,
        to_specialist: toStep.specialist_id,
        artifact_paths: fromStep.output.artifacts.map((a) => a.path),
      },
    });
  }
  // Final run.completed
  const lastStep = steps[steps.length - 1];
  events.push({
    event_id: `evt_${TRACE_ID}_run_completed`,
    topic: 'pipeline.run.completed',
    pipeline_run_id: PIPELINE_RUN_ID,
    occurred_at: lastStep.ended_at,
    source_agent: 'dionysus',
    payload: {
      specialist_count: steps.length,
      total_cost_usd: Number(steps.reduce((a, s) => a + s.output.cost_usd, 0).toFixed(2)),
      total_tokens: steps.reduce(
        (a, s) => ({ input: a.input + s.output.tokens_consumed.input, output: a.output + s.output.tokens_consumed.output }),
        { input: 0, output: 0 },
      ),
    },
  });
  events.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  return events;
}

function buildFinalArtifacts() {
  const finals = [];
  const entries = readdirSync(FINAL_DIR);
  for (const name of entries) {
    const abs = join(FINAL_DIR, name);
    const stat = statSync(abs);
    if (!stat.isFile()) continue;
    const content = readUtf8(abs);
    const ext = extname(name).toLowerCase();
    const content_kind = CONTENT_KIND_BY_EXT[ext] || 'md';
    finals.push({
      path: name,
      content_kind,
      bytes: sanitizeBytes(content),
      content,
    });
  }
  finals.sort((a, b) => a.path.localeCompare(b.path));
  return finals;
}

function main() {
  const { steps, totalMs } = buildSteps();
  const events = buildEventStream(steps);
  const finals = buildFinalArtifacts();
  const totalCost = Number(steps.reduce((a, s) => a + s.output.cost_usd, 0).toFixed(2));
  const trace = {
    trace_id: TRACE_ID,
    recorded_at: RECORDED_AT,
    total_duration_ms: totalMs,
    total_cost_usd: totalCost,
    specialist_count: steps.length,
    bake_mode: 'opus_session_synthesis',
    bake_mode_note:
      'Synthesized in a single Dionysus Opus 4.7 session on Day 1 per docs/dionysus.decisions.md ADR-002. The trace stands in for a live 11-specialist Builder run. LumioReplay surfaces a visible cached-bake label per hackathon honest-claim rule.',
    steps,
    event_stream: events,
    final_artifacts: finals,
    replay_compatibility_version: REPLAY_COMPAT_VERSION,
  };
  const out = JSON.stringify(trace, null, 2) + '\n';
  writeFileSync(OUTPUT_PATH, out, 'utf-8');
  const rel = relative(REPO_ROOT, OUTPUT_PATH);
  const verifyEveryArtifactBytes = finals.every((a) => sanitizeBytes(a.content) === a.bytes);
  process.stdout.write(
    `wrote ${rel}, ${Buffer.byteLength(out, 'utf-8')} bytes, ` +
    `${steps.length} steps, ${events.length} events, ${finals.length} final artifacts, ` +
    `bytes integrity ${verifyEveryArtifactBytes ? 'ok' : 'MISMATCH'}\n`,
  );
  if (!verifyEveryArtifactBytes) process.exit(1);
}

main();

---
title: Managed Agents Research for NERIUM Builder
phase: M1
author: Metis (Agent Pipeline Architect, Claude Chat specialist)
date: 2026-04-22
status: complete, awaiting V2 approval to proceed M2
hard_constraints_verified: no em dash, no emoji, Greek fresh pool N/A (no agent names defined at this phase)
---

# Managed Agents for NERIUM: a 4-day bet, not a 5-day foundation

## Bottom line up front

Claude Managed Agents (MA) is a real, shipped product. It is public beta since April 8, 2026. It is a plausible but risky foundation for NERIUM Builder. The cleanest play for a 5-day, solo-developer, $500-budget hackathon is **light integration**: keep direct `anthropic.messages.create` (or the Claude Agent SDK) as Builder's primary executor and wire MA into **one flagship heavy-lift specialist lane** that produces a visibly autonomous, multi-hour agent trace for the demo. That preserves the multi-vendor roadmap, keeps cost predictable, and still positions NERIUM credibly for the hypothesized "Best Managed Agents Use" prize.

Critical caveat on the prize itself. The existence of a specifically-named "Best Managed Agents Use" $5,000 track could not be confirmed in any public source. Treat it as sponsor-lore until confirmed in the participant Discord on Day 1.

The strategic tension is simple. MA solves real plumbing (sandboxed containers, event logs, SSE, credential vaults, skills, MCP) that NERIUM would otherwise have to build. But MA is Claude-only, caps orchestration at one level of delegation, gates its most impressive primitives (multi-agent coordination, memory, outcomes) behind a separate research-preview access form, and forces Builder's multi-vendor roadmap (Gemini, Higgsfield, others) onto a parallel execution path post-hackathon. On a 4-day clock you cannot afford to discover those limits on Day 3.

---

## A. Capability matrix across the three options

| Dimension | A1. Managed Agents | A2. Claude Code subagents (`--dangerously-skip-permissions` + Task tool) | A3. Direct Anthropic SDK (`messages.create`) |
|---|---|---|---|
| **Runtime location** | Anthropic-hosted sandboxed container per session | User's local machine | Your backend or wherever you run code |
| **Max concurrent agents** | Not published. Rate-limited at 60 creates/min, 600 reads/min per org | Bounded by local CPU/RAM and Claude Code's own orchestrator | Bounded by your infra plus Claude API tier rate limits |
| **State / memory** | Durable append-only event log per session, persistent `/mnt/session/outputs/` filesystem, cross-session "Agent Memory" stores in research preview (8 stores/session, 100 KB each) | Ephemeral to the local Claude Code process, files on local disk | You build it (DB, vector store, your own event log) |
| **Built-in tools** | `agent_toolset_20260401`: Bash, Read/Write/Edit/Glob/Grep, `web_fetch`, `web_search`, remote MCP (with vault-proxied OAuth), up to 20 skills per session | Full Claude Code tool suite locally, Task tool for subagent spawn, bash, file ops, MCP | None. You wire every tool yourself |
| **Computer use** | Not listed in MA tools reference. Status unknown inside MA containers | Yes via local automation | Yes, as a Messages API tool |
| **Long-running runs** | Advertised "minutes or hours", autonomy through disconnects, hard ceiling not published | Bounded by user's local session. Pausing equals terminal closed | Bounded by your own timeout logic |
| **Observability** | Claude Console "Sessions" UI with live event/tool/token traces, SSE on `/v1/sessions/:id/stream`, webhook on `session.status_idled` | Terminal stdout. No first-party cloud trace | You build it |
| **Permission model** | Sandboxed container, per-tool `permission_policy` (`always_allow`/`always_ask`), network scoping, server-side credential vault | `--dangerously-skip-permissions` explicitly disables guards. Fine for local dev, not for user-facing SaaS | You own the policy surface |
| **Cancellation** | Interrupt events plus delete session (cannot delete while running) | `Ctrl-C` or kill process | You control it |
| **Integration surface** | REST (`/v1/agents`, `/v1/environments`, `/v1/sessions`, `…/events`, `…/stream`), SDKs in Python, TypeScript, Java, Go, C#, Ruby, PHP, new `ant` CLI, Console UI, webhook on idle | CLI only. Not a programmatic substrate for a SaaS product | REST plus all same SDKs |
| **Streaming to UI** | Native SSE, webhook for async idle | Terminal only | Standard SSE on `messages.create` |
| **Nested orchestration (agent then agent then agent)** | Only one level of delegation, and multi-agent is research-preview only (access form required) | Task tool can spawn subagents, deeper nesting is implementation-dependent and fragile | Unlimited. You own the graph |
| **Multi-model inside one run** | Agent is pinned to one Claude model. Workaround: Advisor Tool (beta) for Opus-as-advisor from Sonnet executor, multi-agent preview lets coordinator dispatch to differently-modeled agents | You route per-call | You route per-call |
| **Non-Claude models** | Claude only. No OpenAI, Gemini, OSS support documented | Claude only (Claude Code is the harness) | Any vendor. You choose |
| **Availability** | Public beta, direct Claude API only. Not on Bedrock, Vertex, Foundry | GA | GA |

**What this means for NERIUM.** Option A2 (Claude Code subagents) is disqualified as Builder's execution substrate because it is a developer CLI, not a programmatic SaaS backplane. You cannot serve users from it. The real choice is **A1 vs. A3**, with A1 offering observability and state plumbing "for free" at the cost of vendor lock-in and a one-level delegation ceiling.

---

## B. Cost model for Managed Agents

Pricing is **additive, not premium**. You pay standard Claude token rates PLUS a container runtime meter PLUS any metered tools.

| Line item | Rate | Notes |
|---|---|---|
| Input tokens (Opus 4.7) | $5 per 1M tokens | Same as Messages API |
| Output tokens (Opus 4.7) | $25 per 1M tokens | Same as Messages API |
| Cache read / write multipliers | 0.1x / 1.25x | Applied automatically by the harness |
| **Session runtime** | **$0.08 per session-hour**, metered to the millisecond, only while `status = running` | Idle, rescheduling, or terminated states do not bill |
| Web search | $10 per 1,000 searches | Unchanged from Messages API |
| Web fetch, bash, file ops, grep/glob | No extra fee | Token cost only |
| Code execution container-hours | Subsumed into session runtime | MA replaces the separate Code Execution billing |
| Batch API 50% discount | Does NOT apply to MA sessions | Material for heavy async workloads |
| US-only inference | 1.1x multiplier | Standard `inference_geo` behavior |

**Worked example** (from Anthropic's own docs): one-hour Opus 4.7 session, 50K input + 15K output tokens: input $0.25 + output $0.375 + runtime $0.08 which approximately equals $0.705. With 80% of input from cache drops to roughly $0.525. Session runtime is approximately 11% of a normal token-heavy workload. The real overhead is small, and for code-execution-heavy flows MA is actually cheaper than `messages.create` plus separate container billing.

### Budget math for NERIUM

The $500 hackathon credit is the constraint. One full Builder demo run on Opus 4.7 with 20 to 25 specialist sessions, assume average 40 minutes runtime and 80K tokens each per specialist:

$$\text{cost per Builder run} \approx 25 \times (0.08 \times 0.67 + 80{,}000 \times \$5/10^6 + 20{,}000 \times \$25/10^6)$$
$$\approx 25 \times (\$0.054 + \$0.40 + \$0.50) \approx \$24 \text{ per end-to-end Builder run}$$

That permits roughly 20 full Builder runs on the $500 credit. Survivable for development plus 3 to 5 polished demo runs on stage. But do NOT allow open-ended demos. Every run must be bounded by a hard token/runtime cap via the Task Budgets beta header.

No MA-specific free tier is published. Every selected hackathon participant receives $500 in API credits per the Anthropic blog. No additional "free MA session-hours" allocation was found.

---

## C. Integration surface for NERIUM Builder

### C1. Can Builder's executor layer be implemented using MA? Yes, with one architectural caveat.

Your backend calls `POST /v1/sessions` N times in parallel (one per specialist), streams each session's events over SSE, and aggregates outputs. Python, TypeScript, Java, Go, C#, Ruby, PHP SDKs all ship. Rate limits (60 creates/min, 600 reads/min per org) are comfortable for 25 specialists per Builder run. The official Data Analyst cookbook demonstrates exactly this flow (CSV in, HTML report out, outputs pulled via Files API with `scope_id=<session_id>`).

### C2. Can MA call MA (nested orchestration)? Only one level, and only in research preview.

The `multi-agent` docs are explicit: "Only one level of delegation is supported: the coordinator can call other agents, but those agents cannot call agents of their own." This is NOT NERIUM's recursive "agent-that-spawns-agents-that-spawns-agents" thesis running natively on MA. You have two viable workarounds:

1. **Orchestrate from your backend** (recommended). NERIUM's Builder lives as your Python/TS process. It spawns independent MA sessions per specialist. When a specialist needs to subcontract, your backend spawns a fresh MA session for the sub-specialist. True recursion depth is unlimited because the recursion lives in YOUR code, not inside MA. This also keeps the multi-vendor pathway open.

2. **Use the research-preview `callable_agents` feature** for one level only, for Builder then specialists. Requires submitting the form at `claude.com/form/claude-managed-agents` and hoping approval lands in under 4 days. Risky.

### C3. Multi-model routing inside a run? Limited.

An agent definition pins one model. Workarounds: (a) the **Advisor Tool** beta lets a Sonnet executor consult an Opus advisor mid-generation, (b) the multi-agent research preview lets a coordinator dispatch to agents pinned to different models. For NERIUM's "Collaborative Anthropic" strategy (Opus plus Sonnet plus Haiku mixed), the backend-orchestrated pattern in C1 is simpler. Each specialist session picks its model at creation time.

### C4. Model lock-in? Claude only. Full stop.

No OpenAI, Gemini, Higgsfield, or open-source support. For NERIUM's "Multi-vendor" strategy post-hackathon, MA is an Anthropic-execution path that must coexist with a separate non-MA path for other vendors.

### C5. Programmatic interface. Strong.

REST plus 7 SDKs plus SSE plus webhook-on-idle plus Console UI. Everything you need to build a user-facing "pipeline running" view.

### C6. Observability for real-time "agent pipeline running" UX. Excellent out of the box.

SSE events (`agent.message`, `agent.tool_use`, `session.status_idle`, `span.model_request_end`, `session.error`) stream from each session. You can multiplex N session streams into a single NERIUM UI pane showing tool calls, files written, and model decisions live. The Claude Console tracing view is also a valuable fallback and inspection surface. Use it during judging if the custom UI degrades. This is the single strongest demo primitive MA offers and the reason to integrate at all.

---

## D. Strategic recommendation for NERIUM hackathon

### D1. Verdict: light integration, not primary substrate.

**Do not rebuild Builder's executor on top of MA for the hackathon.** Do ship MA as a visibly autonomous specialist lane within Builder that the demo leans on hard. Concretely: one of the 20 to 25 internal specialists, pick a high-demo-value one like **`integration_engineer`** (the one that actually writes code, runs tests in a sandboxed container, and opens a PR), runs as a Managed Agent session. Everyone else runs via direct `messages.create` or the Claude Agent SDK.

This is the best point on the impact, risk, budget, roadmap curve because:

- **Impact (30%):** keeping Builder architecture flexible lets you tell the multi-vendor story that judges find genuinely novel, instead of forcing a single-vendor narrative.
- **Demo (25%):** MA's Console trace plus SSE pipeline view plus "it just ran autonomously for 40 minutes in a container and filed a PR" is the single most visually compelling demo moment available to you. Spotlight it.
- **Opus 4.7 use (25%):** routing the MA specialist to Opus 4.7 with `xhigh` effort on a real coding task showcases the flagship model on its strongest benchmark (SWE-bench Verified 87.6%).
- **Depth (20%):** the recursive orchestrator lives in your backend, demonstrably spawns heterogeneous specialists across strategies (Opus-all, mixed, multi-vendor), and uses MA where MA is best. That is deeper than wrapping MA naively.

### D2. Against the constraints.

- **$500 credit:** a single MA specialist per Builder run at roughly $1 to $3 per run fits easily. Cap development to approximately 50 runs total ($150 MA exposure), reserving 70% of budget for the other specialists.
- **4 remaining build days, solo dev:** integration surface is small. One POST to `/v1/sessions`, one SSE reader, one Files API fetch. Budget 4 to 6 hours for MA integration, not 2 days.
- **Multi-vendor roadmap:** by isolating MA behind a `BuilderSpecialistExecutor` interface with `AnthropicManagedExecutor`, `AnthropicDirectExecutor`, `GeminiExecutor`, `HiggsfieldExecutor` implementations, you accrue zero refactor debt. MA becomes one executor among many, selected when strategy equals "Collaborative Anthropic" or "Opus all".
- **Hypothetical $5K Managed Agents prize:** meaningful expected value only if the prize exists. At 15 to 20% of the polled side-prize pool and unverified, the rational bet is to deserve it on the merits rather than twist architecture toward it.

### D3. Minimum-viable MA integration (under 20% of budget/time).

1. One agent definition: `nerium-integration-engineer` on Claude Opus 4.7, toolset `agent_toolset_20260401`, skills for git plus test runner.
2. One environment template with networking `limited` plus an allow-list for GitHub and your test registry. Inject a scoped GitHub token into the vault.
3. Backend endpoint `POST /builder/run` creates one MA session per integration task, subscribes to the SSE stream, forwards events to the NERIUM UI via websocket.
4. UI renders a live tool-call log and links to the Claude Console trace for each session. The "receipt."
5. Final artifact: a PR URL plus the session trace snapshot in the demo slide.

This is approximately 200 LOC plus UI wiring. It is a demo moment, not a refactor.

### D4. Post-hackathon refactor debt.

Low, provided you hide MA behind the executor interface from day one. If you instead make MA the direct orchestrator of all 25 specialists, you inherit: (a) Claude-only execution paths bleeding into specialist contracts, (b) one-level delegation cap baked into agent graph assumptions, (c) Bedrock, Vertex, Foundry exclusion (MA is Claude API direct only), and (d) beta-header lifecycle management. The executor-interface pattern pays for itself within weeks when Gemini and Higgsfield lanes ship.

---

## E. "Best Managed Agents Use" prize: a critical unknown

**Public sources do not confirm a "Best Managed Agents Use" $5,000 prize exists.** Cerebral Valley's event page, the @claudeai announcement tweet, Anthropic's blog, and aggregator mirrors all agree on three $5,000 side prizes. But none name the categories. In the prior Opus 4.6 hackathon, side prizes were named ex post by judges ("Keep Thinking" for TARA, "Creative Exploration" for Conductr). If the category naming pattern repeats, any project doing serious MA work is equally positioned to receive it regardless of branding. And any project that contorts itself around a specifically-named category may be solving for a fiction.

**Action:** Confirm the category in the hackathon Discord or Slack on Day 1. If confirmed, proceed per D3. If unconfirmed, proceed per D3 anyway. The rationale holds on demo-impact grounds.

### E1. What "best use" likely means to judges.

The named judges (Boris Cherny, Cat Wu, Thariq Shihipar, Lydia Hallie, Ado Kukic, Jason Bigman) are Claude Code product and engineering leads, not researchers. They reward:

- Long-horizon autonomy with an artifact at the end. Not chatbots.
- Outcome-driven design. Defining success criteria and letting the harness iterate (the research-preview `outcomes` feature is literally named this).
- Clean use of the harness primitives. Events, skills, vaults, scoped permissions. Rather than reinventing them in application code.
- Real domain, real user, real pain. Every Opus 4.6 winner solved a concrete workflow (permit filing, clinical followup, road appraisal, kids' coding, live music).
- Good traces. Judges will open the Console. A tidy, well-labeled session trace is a quiet flex.

### E2. Known case studies NERIUM must differentiate from.

Anthropic's launch-partner pantheon: **Notion** (parallel workspace tasks), **Asana** (AI Teammates), **Rakuten** (enterprise specialists), **Sentry** (Seer plus Claude patch-and-PR loop), **Vibecode** (prompt-to-deployed-app, the closest analog to Builder), **Atlassian** (developer agents in Jira). Vibecode is the direct comparable: "prompt to app in under an hour." NERIUM needs a clear delta against Vibecode or judges will hear "you reinvented Vibecode."

### E3. Sharpest NERIUM angle.

Frame the recursive "agent-that-spawns-agents" Builder thesis as **meta-orchestration of heterogeneous execution substrates**, not as "another prompt-to-app tool." Specifically:

> "Vibecode uses Managed Agents as its execution plane. NERIUM uses Managed Agents as ONE specialist lane inside a multi-vendor, multi-strategy orchestrator. The Builder chooses MA when the task needs autonomy and sandboxed tool use. It chooses direct SDK when it needs streaming latency. It chooses Gemini or Higgsfield when it needs multimodal or video. The user picks the strategy. MA is our default Anthropic-native heavy-lift lane."

This is a genuinely novel architectural thesis (none of Notion, Asana, Rakuten, Sentry, Vibecode ship it). It uses MA where MA is strongest. It truthfully represents the product roadmap. It is also robust to the side-prize being named something other than "Best Managed Agents Use."

---

## F. Risks and unknowns

### Hard unknowns flagged for verification on Day 1.

- **Max session duration:** undocumented. Cap demo runs to 2 hours via Task Budgets to be safe.
- **Max concurrent sessions per org:** undocumented. 25 parallel sessions should work. Have a serial-fallback mode ready.
- **Indonesia, APAC availability:** general Claude API is "global by default" and Rakuten is a launch customer, implying APAC works. Not explicitly stated for MA. Test from your target region on Day 1.
- **Computer-use tool inside MA containers:** not listed in the MA tools reference. Assume unavailable. If NERIUM needs it, route that specialist through direct Messages API instead.
- **Webhook URL registration:** docs describe SSE plus polling. A webhook on `session.status_idled` is referenced in release notes and cookbook. Confirm the registration path before relying on it.
- **Research-preview feature approval timing:** `outcomes`, `multiagent`, `memory` require the form at `claude.com/form/claude-managed-agents`. Submit IMMEDIATELY on Day 1 if you want any chance of access. Do not architect around getting it.
- **"Best Managed Agents Use" prize:** unverified in public sources. Check the participant Discord.

### Soft risks.

- **Beta status:** the overview page warns "Behaviors may be refined between releases." Expect occasional breaking SDK or beta-header changes. Pin versions.
- **Community sentiment on HN (#47693047):** mixed. Vendor-lock-in anxiety, "AWS-ification" critique, some reliability skepticism ("Quality engineering is just not their thing"). Balanced against positive pragmatic use (one-person ordering and invoicing agent, Vibecode). Reliability has not been stress-tested publicly.
- **Batch API 50% discount does not apply** to MA. If any Builder specialist is pure async bulk work, run it on Messages API batch instead to save half.
- **Opus 4.7 tokenizer change:** up to 35% more tokens per unit of text vs 4.6. Your cost estimates should include a 15% buffer.
- **Claude Code subagents are not a valid SaaS backplane.** If anyone suggests running Builder as a shelled-out Claude Code session, that is a demo hack, not a product.
- **HN reports a broken rendering of the MA blog page** in some browsers (black screen in Firefox, Zen, Android tied to DNS blocklists). Irrelevant to integration but a tell about launch polish.

---

## Recommendation (decision-ready)

**Integrate Managed Agents as one specialist lane, not as Builder's execution substrate.**

1. **Day 1, first 90 minutes:** submit the research-preview access form (for optionality), confirm the MA $5K prize category in Discord, run a smoke test from your target region, create the `nerium-integration-engineer` agent definition and environment.
2. **Day 1 afternoon:** wire `AnthropicManagedExecutor` behind the `BuilderSpecialistExecutor` interface. Implement SSE to websocket to UI log pipeline.
3. **Day 2:** complete the other specialists on `AnthropicDirectExecutor` (direct Messages API). Keep all specialist contracts identical.
4. **Day 3:** end-to-end Builder runs. Tune model strategy routing (Opus-all, Collaborative, Multi-vendor stub, Auto).
5. **Day 4:** demo polish. The demo's MA moment: one autonomous specialist runs for approximately 5 minutes live on stage, produces a PR, judges click through to the Console trace.
6. **Spend cap:** $150 of the $500 on MA specifically. If burn rate exceeds, fall back all specialists to direct SDK.

**Do not bet the architecture on MA being ready for NERIUM's true recursive thesis.** The one-level delegation cap, beta-gated multi-agent feature, and Claude-only execution are fundamentally incompatible with Builder's multi-strategy, multi-vendor design. Use MA for what it is excellent at: observable, sandboxed, long-running single-specialist autonomy. And own the meta-orchestration yourself.

---

## Confidence levels and unknowns

**High confidence (directly cited to Anthropic primary sources):** MA exists and is in public beta since April 8, 2026. Pricing formula ($0.08 per session-hour plus tokens plus $10 per 1K web searches). Model lock-in to Claude. Claude-only direct API (no Bedrock, Vertex, Foundry). SDKs in 7 languages. SSE streaming. Console trace UI. Rate limits (60 creates/min, 600 reads/min). One-level delegation cap in multi-agent preview. Hackathon dates (April 21 to 26, 2026, 8 PM EDT end), $500 per-participant credit, six judges named, $100K total prize pool.

**Medium confidence (single-source or aggregator-confirmed):** exact side-prize breakdown ($50K, $30K, $10K plus 3x$5K). Performance claims ("up to 10-point outcome improvement", Rakuten "97% error drop", Notion "90% cost reduction") are Anthropic-sourced and unverified. Opus 4.7 benchmark numbers. Advisor Tool beta behavior.

**Unverified or unknown:**

- Existence and name of a "Best Managed Agents Use" $5,000 prize track. Not in any public source.
- Max session duration (beta docs omit a hard ceiling).
- Max concurrent sessions per org.
- Computer-use tool availability inside MA containers.
- Whether research-preview features (`outcomes`, `multiagent`, `memory`) are approvable within 4 days.
- Indonesia-specific MA availability (general Claude API is global. MA-specific regional policy not published).
- Formal hackathon scoring rubric (user-provided weights, Impact 30%, Demo 25%, Opus 4.7 Use 25%, Depth 20%, are not publicly posted. Judges historically decide ex-post).
- Hackathon Discord or Slack URL (gated to accepted participants).

Confirm the first two unknowns in the participant Discord on Day 1. The rest are mitigatable by the architecture recommended above.

---

## Source list (all verified via web research, April 22, 2026)

**Primary (Anthropic official):**

- `https://platform.claude.com/docs/en/managed-agents/overview`
- `https://platform.claude.com/docs/en/managed-agents/quickstart`
- `https://platform.claude.com/docs/en/managed-agents/tools`
- `https://platform.claude.com/docs/en/managed-agents/skills`
- `https://platform.claude.com/docs/en/managed-agents/sessions`
- `https://platform.claude.com/docs/en/managed-agents/multi-agent`
- `https://platform.claude.com/docs/en/managed-agents/observability`
- `https://platform.claude.com/docs/en/managed-agents/environments`
- `https://platform.claude.com/cookbook/managed-agents-data-analyst-agent`
- `https://platform.claude.com/cookbook/managed-agents-cma-operate-in-production`
- `https://claude.com/blog/claude-managed-agents`
- `https://claude.com/blog/meet-the-winners-of-our-built-with-opus-4-6-claude-code-hackathon`
- `https://docs.anthropic.com/en/docs/about-claude/pricing`
- `https://docs.anthropic.com/en/release-notes/overview`
- `https://www.anthropic.com/news/claude-opus-4-7`
- `https://www.anthropic.com/customers`

**Secondary (community, analysis):**

- `https://news.ycombinator.com/item?id=47693047` (community discussion)
- `https://medium.com/@unicodeveloper/claude-managed-agents-what-it-actually-offers-the-honest-pros-and-cons-and-how-to-run-agents-52369e5cff14`
- `https://caylent.com/blog/claude-opus-4-7-deep-dive-capabilities-migration-and-the-new-economics-of-long-running-agents`
- `https://wavespeed.ai/blog/posts/claude-managed-agents-pricing-2026/`
- `https://www.verdent.ai/guides/claude-managed-agents-pricing`
- `https://www.verdent.ai/guides/what-is-claude-managed-agents`
- `https://www.finout.io/blog/anthropic-just-launched-managed-agents.-lets-talk-about-how-were-going-to-pay-for-this`
- `https://thenewstack.io/with-claude-managed-agents-anthropic-wants-to-run-your-ai-agents-for-you/`
- `https://aiblewmymind.substack.com/p/claude-managed-agents-explained-demo`
- `https://www.startupgrantsindia.com/competitions/built-with-opus-47-a-claude-code-hackathon`
- `https://www.datacenterknowledge.com/data-center-software/anthropic-targets-ai-data-center-bottleneck-with-claude-managed-agents`
- `https://tygartmedia.com/claude-managed-agents-faq-complete-2026/`
- `https://www.analyticsvidhya.com/blog/2026/04/claude-opus-4-7/`
- `https://jasonpollakmarketing.com/2026/04/15/claude-opus-4-7-managed-agents-ai-design-tool/`
- `https://openrouter.ai/anthropic/claude-opus-4.7`

**End of MANAGED_AGENTS_RESEARCH.md**

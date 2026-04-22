# NERIUM

**Infrastructure for the AI agent economy.**

Built with Opus 4.7 for the Cerebral Valley plus Anthropic hackathon, April 2026.

---

## What is NERIUM

NERIUM is a platform for the AI agent economy, composed of five pillars that each stand alone as a product surface and together form an integrated stack. My thesis is simple: the agent economy already exists in fragments, and the missing layer is infrastructure. NERIUM is that infrastructure.

1. **Builder (hero).** Gamified product construction. A non-technical user describes what they want, and a team of AI agents plans, builds, tests, and ships the software for them. You pick the model strategy (all Opus, collaborative across vendors, or let the orchestrator decide). Builder replaces the manual meta-orchestration that sits above every current AI coding tool.
2. **Marketplace.** An open neutral storefront for AI agents, MCP servers, and automation workflows. Creators list once and sell across vendors. Buyers discover and purchase with a single account. Living templates let you buy a niche agent (say, a restaurant automation) and customize it automatically via Builder.
3. **Banking.** Usage-based billing for agents that operate live. Stripe for the agent economy. Charge per execution the way utilities charge per kilowatt-hour.
4. **Registry.** Identity, trust score, and audit trail per agent. The DNS of the AI agent layer. Every agent has a verifiable identity card.
5. **Protocol.** A translation layer across vendors. Claude keeps its XML tags, Gemini speaks native, and the glue layer preserves the uniqueness of each model rather than forcing a single universal dialect.

Positioning: AWS plus Stripe plus DNS plus HTTP for the agent economy.

---

## Demo video

Coming soon. Link will be published here after submission.

---

## Tech stack

Frontend
- Next.js 15 (App Router, React Server Components)
- Tailwind CSS v4 (OKLCH design tokens)
- Three.js r128
- Framer Motion, GSAP
- Howler.js
- Zustand, Pixi.js

Backend
- Python FastAPI
- SQLite
- Anthropic Python SDK (Opus 4.7)
- Managed Agents integration for the Heracles lane

Tooling
- Claude Code CLI (specialist execution)
- Claude Design (UI mockups)
- Claude.ai chat (orchestration)

---

## Getting started

Full setup instructions will land post-submission. For now the scaffold assumes Node 20 plus, Python 3.11 plus, and a recent Claude Code CLI. A typical local run will look like:

```
npm install
npm run dev
```

The backend runner and Managed Agents integration have their own entrypoints that I will document in a follow-up commit.

---

## Meta-narrative

NERIUM built itself by running the manual workflow it automates, one last time, for this hackathon.

I lived a 47-agent 9-phase 106-step pipeline manually for an earlier project. I know every handoff, every dependency, every failure mode. The hackathon is the same pattern, one more time, and then Builder collapses the whole thing into a single conversational interface.

---

## License

MIT. See [LICENSE](./LICENSE) for full text. Open source from day one, per the hackathon mandate and by my own preference.

---

Ghaisan Khoirul Badruzaman (GitHub `Finerium`). Cerebral Valley plus Anthropic hackathon submission, April 2026.

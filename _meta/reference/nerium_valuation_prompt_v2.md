# Nerium Valuation Prompt v2 — for Claude Opus 4.6

> How to use:
> 1. Open a new Claude chat (make sure you're on Opus 4.6)
> 2. Make sure "Create files" feature is enabled in your chat settings
> 3. Attach/upload your NERIUM_PRD.pdf
> 4. Copy everything below the --- line and paste it as your message
> 5. Send
> 6. Claude will generate a downloadable PDF report

---

<context>
You are receiving a Product Requirements Document (PRD) for "Nerium" — a comprehensive infrastructure platform for the global AI agent economy. The document contains the full vision, five-pillar architecture (Builder, Marketplace, Banking, Registry, Protocol), business model, market sizing, competitive landscape, and target audience.

Here is the current industry context as of March 2026 that you must factor into your analysis:

- The global AI agent market is projected to grow from ~USD 5-8 billion (2024-2025) to USD 42-52 billion by 2030, with a CAGR of 41-46%.
- IDC projects agentic AI spending to exceed USD 1.3 trillion by 2029.
- Google has built the most complete protocol stack: A2A (agent-to-agent communication), AP2 (agent payments, backed by 60+ partners including Mastercard, AmEx, PayPal, Coinbase), A2UI (agent-to-user interfaces), and ADK (Agent Development Kit).
- Anthropic owns MCP (Model Context Protocol), now governed by the Linux Foundation and widely adopted as the de facto standard for agent-to-tool connectivity.
- OpenAI + Stripe have ACP (Agent Commerce Protocol) for in-chat transactions.
- Visa launched "Intelligent Commerce" with 100+ partners. Mastercard launched Agent Pay and completed Europe's first live AI agent-executed payment with Banco Santander in March 2026.
- ERC-8004 (Ethereum) and Solana Agent Registry are building decentralized identity/trust layers for AI agents.
- Prove launched a Verified Agent solution with identity-bound tokens and a shared trust registry.
- No single platform currently integrates a gamified builder + open marketplace + agent banking + identity registry + interoperability protocol into one unified ecosystem.
- No platform uses gamification as the primary interface for AI agent orchestration and software development.
</context>

<task>
Perform a comprehensive valuation analysis for Nerium, assuming the platform has been fully realized and is operating at the scale envisioned in the PRD.

Your analysis must cover:

1. Valuation estimates across three scenarios (conservative, base case, optimistic) with specific USD figures and ranges.

2. Methodology — explain which valuation approaches you selected (e.g., comparable company analysis, DCF-like reasoning, revenue multiples, TAM/SAM/SOM capture rate, or a combination). Justify why each methodology is appropriate for this type of company.

3. Revenue breakdown per pillar — estimate revenue contribution from each of the five pillars (Builder, Marketplace, Banking, Registry, Protocol), including underlying assumptions such as user count, transaction volume, take rates, and pricing tiers.

4. Comparable companies — identify 5-10 companies that serve as valuation benchmarks (e.g., Stripe, Shopify, AWS, Unity, Roblox, Visa, or others). For each, explain the relevance and the applicable multiple.

5. Moat and risk assessment — evaluate the strength of Nerium's competitive moat and the key risk factors that could move the valuation up or down.

6. Timeline projection — provide valuation estimates at three time horizons: Year 3 (early traction), Year 5 (growth stage), Year 10 (maturity/dominance).
</task>

<constraints>
- Provide specific numbers, not vague qualifiers like "large" or "significant." Every estimate must include a range (low-high).
- State every assumption explicitly so it can be challenged or adjusted.
- If data is insufficient to make a confident estimate in any area, state the uncertainty explicitly and explain what you assumed instead.
- Think like a critical but fair venture capital analyst — acknowledge genuine strengths of the idea, but also surface weaknesses and risks honestly. Do not over-hype.
- Factor in that big tech (Google, Anthropic, OpenAI, Visa, Mastercard) is already building similar pillars separately. This must be reflected in your risk assessment and valuation discount.
- Ground all projections in current market data (as of March 2026), not speculative forecasts without a basis.
- Think deeply and step by step before arriving at your final numbers.
</constraints>

<output_format>
Create the output as a professionally formatted, downloadable PDF file. Write the entire content in Bahasa Indonesia.

The PDF should be clean, well-structured, and easy to read — like a real VC analyst report. Apply the following formatting:

- Use a clear document title at the top: "Nerium — Laporan Analisis Valuasi" with a subtitle "Maret 2026 | Confidential"
- Use clear section headers with consistent hierarchy
- Use tables for all numerical data (revenue projections, comparables, valuation scenarios, risk ratings)
- Add adequate spacing between sections for readability
- Use a professional, readable font
- Include a table of contents at the beginning
- Add page numbers

The report must contain these sections in order:

1. Daftar Isi
2. Ringkasan Eksekutif — 2-3 paragraphs summarizing the headline valuation and core thesis
3. Metodologi — Explanation of chosen valuation approaches and rationale
4. Market Sizing & Capture Rate — TAM → SAM → SOM analysis per pillar
5. Model Pendapatan & Proyeksi — Revenue table per pillar at Year 3, Year 5, Year 10 with explicit assumptions
6. Analisis Perusahaan Komparabel — Table of comparables: company name, valuation, revenue, multiple, relevance
7. Skenario Valuasi — Table: Conservative / Base Case / Optimistic at Year 3, Year 5, Year 10
8. Penilaian Competitive Moat — Evaluation of moat strength and weaknesses
9. Risiko Utama & Faktor Mitigasi — Top 5-7 risks with severity rating and mitigation strategies
10. Kesimpulan & Rekomendasi — Final take: is this investable? At what stage? Under what conditions?
11. Lampiran Asumsi — All key assumptions compiled in one reference table

Use tables wherever possible for data clarity. Make the PDF look like something you would present to an investor.
</output_format>

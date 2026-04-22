# AGENT_STRUCTURE.md
# Complete Multi-Agent Pipeline for Personal Investment AI Assistant (IDX)
# From Raw Idea to Production Deployment

---

## MASTER AGENT TREE

```
ROOT: Ghaisan (Human Meta-Orchestrator)
|
|== PHASE 0 - GENESIS =========================================================
|
|-- [Orion] Idea Exploration Conversationalist
|   |-- Role: Guide Ghaisan through structured brainstorming to transform a raw,
|   |         unformed idea into a clear product vision with defined scope,
|   |         target user, core features, and technical constraints.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 2
|   |-- Input: Ghaisan's raw thoughts (verbal/typed, no files).
|   |-- Output: BRAINSTORM_NOTES.md (structured conversation export with
|   |           decisions, feature list, constraints, and open questions).
|   |-- Handoff: Theron
|   |
|   |-- [Orion1-A]
|   |   |-- Task: Initial brainstorm -- problem definition, target user persona,
|   |   |         core value proposition, competitive landscape, feature wishlist,
|   |   |         technical constraints (budget, single-user, free-tier only).
|   |   |-- Estimated Context Usage: ~40% context
|   |   |-- Output: BRAINSTORM_NOTES_DRAFT.md (partial)
|   |   |-- Handoff: Continue in Orion1-B if needed.
|   |
|   |-- [Orion1-B]
|       |-- Task: Refinement -- prioritize features, resolve open questions,
|       |         define MVP scope vs future scope, finalize constraints,
|       |         confirm Owner Strategy philosophy and IDX focus.
|       |-- Estimated Context Usage: ~50% context
|       |-- Output: BRAINSTORM_NOTES.md (final)
|       |-- Handoff: Theron receives BRAINSTORM_NOTES.md.
|
|-- [Theron] Comprehensive Idea Document Writer
|   |-- Role: Transform brainstorm notes into a formal, exhaustive idea document
|   |         that captures every aspect of the envisioned product -- features,
|   |         user stories, data sources, UI vision, technical preferences,
|   |         constraints, and success criteria -- in a format suitable for
|   |         architects and designers to consume.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 2
|   |-- Input: BRAINSTORM_NOTES.md (from Orion).
|   |-- Output: COMPREHENSIVE_IDEA.md
|   |-- Handoff: Raphael
|   |
|   |-- [Theron1-A]
|   |   |-- Task: Draft sections 1-5: Executive Vision, Target User Profile,
|   |   |         Core Feature Descriptions (NewsAnalyzer, IPOHunter,
|   |   |         PortfolioManager, LLMChatbot), Data Sources & APIs,
|   |   |         Technical Preferences & Constraints.
|   |   |-- Estimated Context Usage: ~60% context
|   |   |-- Output: COMPREHENSIVE_IDEA_PART1.md
|   |   |-- Handoff: Continue in Theron1-B with Part1 as reference.
|   |
|   |-- [Theron1-B]
|       |-- Task: Draft sections 6-10: UI/UX Vision (dark theme, Linear.app
|       |         aesthetic), Owner Strategy Philosophy, Success Metrics,
|       |         Non-Functional Requirements, Future Expansion Ideas.
|       |         Merge with Part1 into final document.
|       |-- Estimated Context Usage: ~60% context
|       |-- Output: COMPREHENSIVE_IDEA.md (final, merged)
|       |-- Handoff: Raphael receives COMPREHENSIVE_IDEA.md.
|
|
|== PHASE 1 - ARCHITECTURE =====================================================
|
|-- [Raphael] Prompt Architect for Framework Writers
|   |-- Role: Read the COMPREHENSIVE_IDEA.md and produce two highly detailed,
|   |         self-contained prompts -- one for each framework-writing agent.
|   |         Each prompt must instruct the writer on exact sections to cover,
|   |         level of detail required, format conventions, and cross-reference
|   |         points between Part 1 and Part 2.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 2
|   |-- Input: COMPREHENSIVE_IDEA.md (from Theron).
|   |-- Output: PROMPT_FRAMEWORK_PART1.md, PROMPT_FRAMEWORK_PART2.md
|   |-- Handoff: Konstantin receives PROMPT_FRAMEWORK_PART1.md;
|   |            Lysander receives PROMPT_FRAMEWORK_PART2.md.
|   |
|   |-- [Raphael1-A]
|   |   |-- Task: Analyze COMPREHENSIVE_IDEA.md. Design the framework document
|   |   |         structure (what goes in Part 1 vs Part 2). Write
|   |   |         PROMPT_FRAMEWORK_PART1.md covering: Executive Summary,
|   |   |         Glossary, Architecture, Data Layer, API Specs, ML/AI Pipeline,
|   |   |         Feature Specs, Design System (pages), Handoff Notes.
|   |   |-- Estimated Context Usage: ~70% context
|   |   |-- Output: PROMPT_FRAMEWORK_PART1.md
|   |   |-- Handoff: Continue in Raphael1-B.
|   |
|   |-- [Raphael1-B]
|       |-- Task: Write PROMPT_FRAMEWORK_PART2.md covering: Component Specs,
|       |         Component Integration, Notification System, Authentication,
|       |         Coding Standards, File Structure, Development Phases,
|       |         Testing, Deployment, Pseudocode, External Services, Error
|       |         Codes, Appendices. Ensure cross-references to Part 1 are
|       |         explicit.
|       |-- Estimated Context Usage: ~60% context
|       |-- Output: PROMPT_FRAMEWORK_PART2.md
|       |-- Handoff: Konstantin and Lysander.
|
|-- [Konstantin] Framework Writer -- Part 1
|   |-- Role: Execute PROMPT_FRAMEWORK_PART1.md to produce the first half of
|   |         the technical framework/PRD, covering architecture, data layer,
|   |         APIs, ML pipeline, feature specifications, and page-level design.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 3
|   |-- Input: PROMPT_FRAMEWORK_PART1.md (from Raphael),
|   |          COMPREHENSIVE_IDEA.md (from Theron).
|   |-- Output: FRAMEWORK_PART1.md
|   |-- Handoff: Lysander (for cross-reference), Vivienne, Cassander, Aldric
|   |
|   |-- [Konstantin1-A]
|   |   |-- Task: Sections 1-4: Executive Summary, Glossary/Terminology,
|   |   |         System Architecture, Data Layer (all 22 tables with schemas,
|   |   |         indexes, constraints, pgvector config, Knowledge Graph design).
|   |   |-- Estimated Context Usage: Full context window
|   |   |-- Output: FRAMEWORK_PART1_DRAFT_S1-S4.md
|   |   |-- Handoff: HANDOFF_KONSTANTIN_1A.md (completed sections, remaining
|   |   |            sections list, style/format notes for consistency).
|   |
|   |-- [Konstantin1-B]
|   |   |-- Task: Sections 5-6: API Specifications (50+ endpoints with request/
|   |   |         response schemas, error codes, rate limits), ML/AI Pipeline
|   |   |         (NLP preprocessing, IndoBERT NER, IndoBERT Sentiment, embedding
|   |   |         generation, LightGBM scoring, fallback strategies).
|   |   |-- Estimated Context Usage: Full context window
|   |   |-- Output: FRAMEWORK_PART1_DRAFT_S5-S6.md
|   |   |-- Handoff: HANDOFF_KONSTANTIN_1B.md
|   |
|   |-- [Konstantin1-C]
|       |-- Task: Sections 7-8.2: Feature Specifications (NewsAnalyzer,
|       |         IPOHunter, PortfolioManager, LLMChatbot with priority levels),
|       |         Design System (color palette, typography, spacing), Page
|       |         Specifications (12 pages). Merge all drafts into final
|       |         FRAMEWORK_PART1.md.
|       |-- Estimated Context Usage: Full context window
|       |-- Output: FRAMEWORK_PART1.md (final)
|       |-- Handoff: Lysander, Vivienne, Cassander, Aldric.
|
|-- [Lysander] Framework Writer -- Part 2
|   |-- Role: Execute PROMPT_FRAMEWORK_PART2.md to produce the second half of
|   |         the technical framework/PRD, covering component specs, auth,
|   |         coding standards, file structure, development phases, testing,
|   |         deployment, pseudocode, and external service configs.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 3
|   |-- Input: PROMPT_FRAMEWORK_PART2.md (from Raphael),
|   |          COMPREHENSIVE_IDEA.md (from Theron),
|   |          FRAMEWORK_PART1.md (from Konstantin, for cross-reference).
|   |-- Output: FRAMEWORK_PART2.md
|   |-- Handoff: Vivienne, Cassander, Aldric
|   |
|   |-- [Lysander1-A]
|   |   |-- Task: Sections 8.3-8.4: Component Specifications (10 reusable
|   |   |         components with exact CSS, animations, props, TypeScript types,
|   |   |         interaction states), Component Integration Guide.
|   |   |-- Estimated Context Usage: Full context window
|   |   |-- Output: FRAMEWORK_PART2_DRAFT_S8.3-S8.4.md
|   |   |-- Handoff: HANDOFF_LYSANDER_1A.md
|   |
|   |-- [Lysander1-B]
|   |   |-- Task: Sections 9-13: Notification System, Authentication, Coding
|   |   |         Standards (TypeScript + Python), File Structure, Development
|   |   |         Phases (Prototype, MVP, Full Feature, Polish).
|   |   |-- Estimated Context Usage: Full context window
|   |   |-- Output: FRAMEWORK_PART2_DRAFT_S9-S13.md
|   |   |-- Handoff: HANDOFF_LYSANDER_1B.md
|   |
|   |-- [Lysander1-C]
|       |-- Task: Sections 14-19: Testing Requirements, Deployment Config,
|       |         Pseudocode for Critical Algorithms, External Service Configs,
|       |         Error Codes, Appendices. Merge all drafts into final
|       |         FRAMEWORK_PART2.md.
|       |-- Estimated Context Usage: Full context window
|       |-- Output: FRAMEWORK_PART2.md (final)
|       |-- Handoff: Vivienne, Cassander, Aldric.
|
|   NOTE: After Konstantin and Lysander complete, Ghaisan manually merges
|   FRAMEWORK_PART1.md + FRAMEWORK_PART2.md into FRAMEWORK.md (simple
|   concatenation with a divider). All downstream agents receive FRAMEWORK.md
|   unless they specifically need only one part due to context constraints.
|
|
|== PHASE 2 - DESIGN (UI/UX) ==================================================
|
|-- [Vivienne] Design Process Instructor
|   |-- Role: Instruct Ghaisan on how to use external AI design tools (e.g.,
|   |         Stitch by Google, v0.dev, or similar) to generate HTML mockups
|   |         for all 12 pages defined in the framework. Provide tool-specific
|   |         prompts, export settings, file naming conventions, and a checklist
|   |         of design deliverables.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 1
|   |-- Input: FRAMEWORK.md (merged, from Konstantin + Lysander).
|   |-- Output: DESIGN_INSTRUCTIONS.md (step-by-step guide for Ghaisan),
|   |           DESIGN_PROMPTS.md (copy-paste prompts for each page mockup).
|   |-- Handoff: Ghaisan (executes design process), then Maximilian.
|   |
|   |-- [Vivienne1-A]
|       |-- Task: Full session -- read framework design specs (Sections 8.1-8.4),
|       |         produce tool instructions, generate 12+ design prompts (one per
|       |         page), specify export format (HTML), naming convention
|       |         (/design-references/XX-page-name.html), and quality checklist.
|       |-- Estimated Context Usage: ~70% context
|       |-- Output: DESIGN_INSTRUCTIONS.md, DESIGN_PROMPTS.md
|       |-- Handoff: Ghaisan uses these to create mockups externally.
|
|   NOTE: Ghaisan manually creates 22 HTML mockups using external AI tools,
|   guided by Vivienne's instructions. Mockups stored in /design-references/.
|
|-- [Maximilian] Design Review & Validation Agent
|   |-- Role: Review all HTML mockups against the framework's design system
|   |         (colors, typography, spacing, component specs) and page
|   |         specifications. Identify deviations, missing elements, and
|   |         inconsistencies. Produce a validation report and, if needed,
|   |         specific correction instructions.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 2
|   |-- Input: /design-references/*.html (22 mockup files, from Ghaisan),
|   |          FRAMEWORK.md (Sections 8.1-8.4 for reference).
|   |-- Output: DESIGN_REVIEW.md (validation report with pass/fail per page,
|   |           specific corrections needed, screenshots of issues).
|   |-- Handoff: Ghaisan (to fix issues), then downstream pipeline.
|   |
|   |-- [Maximilian1-A]
|   |   |-- Task: Review mockups 01-12 (Dashboard through Settings). Validate
|   |   |         color palette (#09090B base, #5E6AD2 accent), typography
|   |   |         (Inter font family), spacing (4px grid), component presence,
|   |   |         layout structure, responsive considerations (1920x1080,
|   |   |         2560x1440).
|   |   |-- Estimated Context Usage: Full context window (many HTML files)
|   |   |-- Output: DESIGN_REVIEW_BATCH1.md
|   |   |-- Handoff: Continue in Maximilian1-B.
|   |
|   |-- [Maximilian1-B]
|       |-- Task: Review mockups 13-22 (remaining pages/variants). Cross-check
|       |         component consistency across pages. Produce final merged
|       |         review. Flag any design-framework misalignment that would
|       |         impact implementation.
|       |-- Estimated Context Usage: Full context window
|       |-- Output: DESIGN_REVIEW.md (final, merged)
|       |-- Handoff: Ghaisan applies corrections, then confirms design freeze.
|
|
|== PHASE 3 - PIPELINE DESIGN =================================================
|
|-- [Cassander] Prompt Architect for Pipeline Designer
|   |-- Role: Create a comprehensive prompt for the agent pipeline designer.
|   |         The prompt must instruct the designer to produce a complete,
|   |         self-referential agent structure covering all phases from idea
|   |         genesis to production deployment.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 1
|   |-- Input: FRAMEWORK.md (from Konstantin + Lysander),
|   |          COMPREHENSIVE_IDEA.md (from Theron).
|   |-- Output: PROMPT_PIPELINE_DESIGN.md
|   |-- Handoff: Nikolai
|   |
|   |-- [Cassander1-A]
|       |-- Task: Full session -- analyze framework scope, estimate total
|       |         implementation effort, design the meta-prompt that instructs
|       |         Nikolai to produce the agent structure with all required
|       |         metadata, naming conventions, handoff protocols, and
|       |         estimation requirements.
|       |-- Estimated Context Usage: ~70% context
|       |-- Output: PROMPT_PIPELINE_DESIGN.md
|       |-- Handoff: Nikolai receives PROMPT_PIPELINE_DESIGN.md.
|
|-- [Nikolai] Agent Pipeline Structure Designer
|   |-- Role: Execute PROMPT_PIPELINE_DESIGN.md to produce the complete
|   |         AGENT_STRUCTURE.md file -- the master blueprint for the entire
|   |         multi-agent pipeline. This is the self-referential agent:
|   |         Nikolai designs the structure that includes Nikolai himself.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 2
|   |-- Input: PROMPT_PIPELINE_DESIGN.md (from Cassander),
|   |          FRAMEWORK.md (from Konstantin + Lysander).
|   |-- Output: AGENT_STRUCTURE.md
|   |-- Handoff: Aldric, Jareth, and all downstream agents.
|   |
|   |-- [Nikolai1-A]
|   |   |-- Task: Produce AGENT_STRUCTURE.md Phases 0-6 (Genesis through
|   |   |         Implementation agent definitions).
|   |   |-- Estimated Context Usage: Full context window
|   |   |-- Output: AGENT_STRUCTURE_DRAFT.md (Phases 0-6)
|   |   |-- Handoff: HANDOFF_NIKOLAI_1A.md (resume at Phase 7).
|   |
|   |-- [Nikolai1-B]
|       |-- Task: Complete Phases 7-9, summary table, and execution protocol.
|       |         Merge with draft into final document.
|       |-- Estimated Context Usage: ~70% context
|       |-- Output: AGENT_STRUCTURE.md (final)
|       |-- Handoff: Aldric, Jareth, and all downstream phases.
|
|
|== PHASE 4 - CONTRACTS (Modular Specifications) ==============================
|
|-- [Aldric] Prompt Architect for Contract Writers
|   |-- Role: Read the FRAMEWORK.md and AGENT_STRUCTURE.md. Produce tailored
|   |         prompts for each contract-writing agent and for the phase-division
|   |         agent. Each prompt must specify the exact module scope, all
|   |         relevant framework sections to reference, interface boundaries
|   |         with other modules, and the required contract format.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 3
|   |-- Input: FRAMEWORK.md (from Konstantin + Lysander),
|   |          AGENT_STRUCTURE.md (from Nikolai).
|   |-- Output: PROMPT_CONTRACT_NEWSANALYZER.md,
|   |           PROMPT_CONTRACT_IPOHUNTER.md,
|   |           PROMPT_CONTRACT_PORTFOLIOMANAGER.md,
|   |           PROMPT_CONTRACT_LLMCHATBOT.md,
|   |           PROMPT_CONTRACT_CORE.md,
|   |           PROMPT_CONTRACT_DATACOLLECTOR.md,
|   |           PROMPT_CONTRACT_KNOWLEDGEGRAPH.md,
|   |           PROMPT_PHASE_DIVISION.md
|   |-- Handoff: Each contract writer receives its respective prompt.
|   |
|   |-- [Aldric1-A]
|   |   |-- Task: Analyze framework module boundaries. Write prompts for
|   |   |         NewsAnalyzer, IPOHunter, and PortfolioManager contracts.
|   |   |         Define shared contract format template.
|   |   |-- Estimated Context Usage: Full context window
|   |   |-- Output: PROMPT_CONTRACT_NEWSANALYZER.md,
|   |   |           PROMPT_CONTRACT_IPOHUNTER.md,
|   |   |           PROMPT_CONTRACT_PORTFOLIOMANAGER.md,
|   |   |           CONTRACT_FORMAT_TEMPLATE.md
|   |   |-- Handoff: Continue in Aldric1-B.
|   |
|   |-- [Aldric1-B]
|   |   |-- Task: Write prompts for LLMChatbot, Core (Auth/Settings/Alerts/
|   |   |         Notifications), DataCollector, and KnowledgeGraph contracts.
|   |   |-- Estimated Context Usage: ~80% context
|   |   |-- Output: PROMPT_CONTRACT_LLMCHATBOT.md,
|   |   |           PROMPT_CONTRACT_CORE.md,
|   |   |           PROMPT_CONTRACT_DATACOLLECTOR.md,
|   |   |           PROMPT_CONTRACT_KNOWLEDGEGRAPH.md
|   |   |-- Handoff: Continue in Aldric1-C.
|   |
|   |-- [Aldric1-C]
|       |-- Task: Write PROMPT_PHASE_DIVISION.md -- the prompt for Isidore to
|       |         produce the implementation phase breakdown. Review all 8
|       |         prompts for internal consistency (shared types, interface
|       |         contracts between modules, naming alignment).
|       |-- Estimated Context Usage: ~60% context
|       |-- Output: PROMPT_PHASE_DIVISION.md
|       |-- Handoff: All contract writers and Isidore.
|
|-- [Beatrix] Contract Writer -- NewsAnalyzer Module
|   |-- Role: Produce a comprehensive modular contract for the NewsAnalyzer
|   |         module covering all backend services, API endpoints, frontend
|   |         pages, data models, NLP integration points, and test specs.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 2
|   |-- Input: PROMPT_CONTRACT_NEWSANALYZER.md (from Aldric),
|   |          FRAMEWORK.md (Sections 4, 5, 6, 7.1, 8.2 pages 1-3).
|   |-- Output: CONTRACT_NEWSANALYZER.md
|   |-- Handoff: Jareth, Kieran
|   |
|   |-- [Beatrix1-A]
|   |   |-- Task: Backend contract -- data models, service interfaces, API
|   |   |         endpoints (news CRUD, sentiment analysis triggers, entity
|   |   |         extraction, impact scoring), NLP pipeline integration,
|   |   |         deduplication algorithm, caching strategy.
|   |   |-- Estimated Context Usage: Full context window
|   |   |-- Output: CONTRACT_NEWSANALYZER_DRAFT.md (backend sections)
|   |   |-- Handoff: Continue in Beatrix1-B.
|   |
|   |-- [Beatrix1-B]
|       |-- Task: Frontend contract -- page components (NewsFeed, NewsDetail,
|       |         Dashboard news widgets), state management, API consumption,
|       |         real-time updates (SSE), filtering/sorting logic. Test
|       |         specifications. Merge into final contract.
|       |-- Estimated Context Usage: ~70% context
|       |-- Output: CONTRACT_NEWSANALYZER.md (final)
|       |-- Handoff: Jareth, Kieran.
|
|-- [Cedric] Contract Writer -- IPOHunter Module
|   |-- Role: Produce the modular contract for the IPOHunter module.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 1
|   |-- Input: PROMPT_CONTRACT_IPOHUNTER.md (from Aldric),
|   |          FRAMEWORK.md (Sections 4, 5, 7.2, 8.2 pages 5-6).
|   |-- Output: CONTRACT_IPOHUNTER.md
|   |-- Handoff: Jareth, Kieran
|   |
|   |-- [Cedric1-A]
|       |-- Task: Full contract -- IPO data models, scraping targets (IDX, OJK,
|       |         e-IPO), scoring algorithm (8 criteria), red/green flag system,
|       |         API endpoints, frontend pages (IPO List, IPO Detail), calendar
|       |         integration, alert triggers, test specs.
|       |-- Estimated Context Usage: ~80% context
|       |-- Output: CONTRACT_IPOHUNTER.md (final)
|       |-- Handoff: Jareth, Kieran.
|
|-- [Dominique] Contract Writer -- PortfolioManager Module
|   |-- Role: Produce the modular contract for the PortfolioManager module.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 2
|   |-- Input: PROMPT_CONTRACT_PORTFOLIOMANAGER.md (from Aldric),
|   |          FRAMEWORK.md (Sections 4, 5, 7.3, 8.2 pages 7-8).
|   |-- Output: CONTRACT_PORTFOLIOMANAGER.md
|   |-- Handoff: Jareth, Kieran
|   |
|   |-- [Dominique1-A]
|   |   |-- Task: Backend contract -- portfolio data models, transaction
|   |   |         processing (buy/sell/dividend/stock split), tax calculations
|   |   |         (PPh Final 0.1%), performance metrics (Sharpe, Sortino, max
|   |   |         drawdown, beta, tracking error), risk analysis, rebalancing
|   |   |         suggestions, API endpoints.
|   |   |-- Estimated Context Usage: Full context window
|   |   |-- Output: CONTRACT_PORTFOLIOMANAGER_DRAFT.md
|   |   |-- Handoff: Continue in Dominique1-B.
|   |
|   |-- [Dominique1-B]
|       |-- Task: Frontend contract -- Portfolio Overview page, Portfolio
|       |         Analytics page, transaction forms, chart specifications
|       |         (allocation donut, performance area, sector bar), state
|       |         management, test specs. Merge into final.
|       |-- Estimated Context Usage: ~70% context
|       |-- Output: CONTRACT_PORTFOLIOMANAGER.md (final)
|       |-- Handoff: Jareth, Kieran.
|
|-- [Evangeline] Contract Writer -- LLMChatbot Module
|   |-- Role: Produce the modular contract for the LLM Chatbot module.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 1
|   |-- Input: PROMPT_CONTRACT_LLMCHATBOT.md (from Aldric),
|   |          FRAMEWORK.md (Sections 4, 5, 7.4, 8.2 page 11, 17).
|   |-- Output: CONTRACT_LLMCHATBOT.md
|   |-- Handoff: Jareth, Kieran
|   |
|   |-- [Evangeline1-A]
|       |-- Task: Full contract -- Groq API integration (Llama 3.1 8B + Llama
|       |         3.3 70B), model routing logic, RAG pipeline (sentence-
|       |         transformers embeddings, pgvector similarity search), chat
|       |         session management, system prompts, context window management,
|       |         rate limit handling (14,400/day 8B, 1,000/day 70B), frontend
|       |         chat interface (ChatBubble, typing indicator, code blocks),
|       |         conversation history, test specs.
|       |-- Estimated Context Usage: ~80% context
|       |-- Output: CONTRACT_LLMCHATBOT.md (final)
|       |-- Handoff: Jareth, Kieran.
|
|-- [Florian] Contract Writer -- Core Module (Auth, Settings, Alerts, Notifications)
|   |-- Role: Produce the modular contract for the Core module covering
|   |         authentication, user settings, alert system, notification system,
|   |         email delivery, and SSE streaming.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 2
|   |-- Input: PROMPT_CONTRACT_CORE.md (from Aldric),
|   |          FRAMEWORK.md (Sections 4, 5, 9, 10, 8.2 pages 10, 12).
|   |-- Output: CONTRACT_CORE.md
|   |-- Handoff: Jareth, Kieran
|   |
|   |-- [Florian1-A]
|   |   |-- Task: Auth contract -- single-user model (ghaisan.khoirul.b@gmail.com),
|   |   |         bcrypt hashing (cost 12), JWT tokens, persistent sessions
|   |   |         (1 year), middleware, login/logout flows. Settings contract --
|   |   |         user preferences, notification preferences, quiet hours,
|   |   |         risk tolerance config. Alert system -- CRUD, trigger conditions,
|   |   |         evaluation engine, cooldown logic.
|   |   |-- Estimated Context Usage: Full context window
|   |   |-- Output: CONTRACT_CORE_DRAFT.md
|   |   |-- Handoff: Continue in Florian1-B.
|   |
|   |-- [Florian1-B]
|       |-- Task: Notification system -- in-app notifications, email via Resend
|       |         (3,000/month), SSE delivery, quiet hours enforcement, batch
|       |         digest mode. Watchlist contract. Frontend pages (Alerts,
|       |         Settings, Watchlist). Test specs. Merge into final.
|       |-- Estimated Context Usage: ~70% context
|       |-- Output: CONTRACT_CORE.md (final)
|       |-- Handoff: Jareth, Kieran.
|
|-- [Gideon] Contract Writer -- DataCollector Module
|   |-- Role: Produce the modular contract for all data collection services
|   |         (news scraping, stock price fetching, IPO data gathering).
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 1
|   |-- Input: PROMPT_CONTRACT_DATACOLLECTOR.md (from Aldric),
|   |          FRAMEWORK.md (Sections 4, 5, 6, 17).
|   |-- Output: CONTRACT_DATACOLLECTOR.md
|   |-- Handoff: Jareth, Kieran
|   |
|   |-- [Gideon1-A]
|       |-- Task: Full contract -- news scrapers (Indonesian financial news
|       |         sources), yfinance integration (360 req/hour rate limiting),
|       |         IDX stock data fetching, IPO data scrapers (IDX, OJK, e-IPO),
|       |         scheduling system (cron jobs, intervals), data normalization,
|       |         deduplication, error handling and retry logic, Supabase
|       |         keepalive ping (every 6 days), test specs.
|       |-- Estimated Context Usage: ~80% context
|       |-- Output: CONTRACT_DATACOLLECTOR.md (final)
|       |-- Handoff: Jareth, Kieran.
|
|-- [Helena] Contract Writer -- KnowledgeGraph Module
|   |-- Role: Produce the modular contract for the Knowledge Graph engine.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 1
|   |-- Input: PROMPT_CONTRACT_KNOWLEDGEGRAPH.md (from Aldric),
|   |          FRAMEWORK.md (Sections 4, 6, 7.1, 16).
|   |-- Output: CONTRACT_KNOWLEDGEGRAPH.md
|   |-- Handoff: Jareth, Kieran
|   |
|   |-- [Helena1-A]
|       |-- Task: Full contract -- NetworkX graph structure, entity nodes
|       |         (companies, people, sectors, events), relationship edges
|       |         (ownership, supply chain, competition, regulation), impact
|       |         propagation algorithm (max depth 2, decay 0.5^distance),
|       |         graph update triggers, query interfaces, serialization/
|       |         persistence, visualization data export, test specs.
|       |-- Estimated Context Usage: ~75% context
|       |-- Output: CONTRACT_KNOWLEDGEGRAPH.md (final)
|       |-- Handoff: Jareth, Kieran.
|
|-- [Isidore] Phase Division Architect
|   |-- Role: Produce the implementation phase division document that breaks
|   |         the entire codebase into ordered implementation sub-phases,
|   |         accounting for dependencies between modules.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 1
|   |-- Input: PROMPT_PHASE_DIVISION.md (from Aldric),
|   |          All 7 CONTRACT_*.md files (from Beatrix through Helena),
|   |          FRAMEWORK.md (Section 13 Development Phases).
|   |-- Output: PHASE_DIVISION.md
|   |-- Handoff: Jareth
|   |
|   |-- [Isidore1-A]
|       |-- Task: Full session -- map all modules into ordered implementation
|       |         sub-phases with dependency graph. Define: Phase 6A (Foundation),
|       |         6B (Data Layer), 6C (NLP/ML), 6D (Knowledge Graph), 6E (News
|       |         Analyzer), 6F (Portfolio Manager), 6G (IPO Hunter), 6H (LLM
|       |         Chatbot), 6I (Core Features), 6J (Design System & UI), 6K
|       |         (Dashboard & Integration). For each sub-phase: scope, files to
|       |         create, dependencies, estimated Claude Code sessions, acceptance
|       |         criteria.
|       |-- Estimated Context Usage: Full context window
|       |-- Output: PHASE_DIVISION.md (final)
|       |-- Handoff: Jareth.
|
|
|== PHASE 5 - PROMPT ENGINEERING (Implementation Prompts) ======================
|
|-- [Jareth] Prompt Architect for Prompt Engineers & CLAUDE.md Author
|   |-- Role: Create prompts for Kieran (CLAUDE.md and coding contracts) and
|   |         for all implementation prompt engineers (Leander, Marcellus,
|   |         Nathaniel). Define the meta-format that every implementation
|   |         prompt must follow.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 2
|   |-- Input: FRAMEWORK.md, AGENT_STRUCTURE.md (from Nikolai),
|   |          PHASE_DIVISION.md (from Isidore),
|   |          All 7 CONTRACT_*.md files.
|   |-- Output: PROMPT_CLAUDE_MD.md,
|   |           PROMPT_CODING_CONTRACTS.md,
|   |           PROMPT_IMPL_ENGINEER_FOUNDATION.md,
|   |           PROMPT_IMPL_ENGINEER_FEATURES.md,
|   |           PROMPT_IMPL_ENGINEER_FRONTEND.md,
|   |           IMPL_PROMPT_FORMAT_SPEC.md
|   |-- Handoff: Kieran, Leander, Marcellus, Nathaniel
|   |
|   |-- [Jareth1-A]
|   |   |-- Task: Design the implementation prompt meta-format
|   |   |         (IMPL_PROMPT_FORMAT_SPEC.md). Write PROMPT_CLAUDE_MD.md and
|   |   |         PROMPT_CODING_CONTRACTS.md. Write
|   |   |         PROMPT_IMPL_ENGINEER_FOUNDATION.md (for Leander).
|   |   |-- Estimated Context Usage: Full context window
|   |   |-- Output: IMPL_PROMPT_FORMAT_SPEC.md, PROMPT_CLAUDE_MD.md,
|   |   |           PROMPT_CODING_CONTRACTS.md,
|   |   |           PROMPT_IMPL_ENGINEER_FOUNDATION.md
|   |   |-- Handoff: Continue in Jareth1-B.
|   |
|   |-- [Jareth1-B]
|       |-- Task: Write PROMPT_IMPL_ENGINEER_FEATURES.md (for Marcellus) and
|       |         PROMPT_IMPL_ENGINEER_FRONTEND.md (for Nathaniel). Review all
|       |         prompts for consistency.
|       |-- Estimated Context Usage: ~70% context
|       |-- Output: PROMPT_IMPL_ENGINEER_FEATURES.md,
|       |           PROMPT_IMPL_ENGINEER_FRONTEND.md
|       |-- Handoff: Marcellus, Nathaniel.
|
|-- [Kieran] CLAUDE.md & Coding Contracts Author
|   |-- Role: Produce the project-root CLAUDE.md file (general coding contract
|   |         for all Claude Code sessions) and per-module coding contract files
|   |         that supplement CLAUDE.md with module-specific rules.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 2
|   |-- Input: PROMPT_CLAUDE_MD.md (from Jareth),
|   |          PROMPT_CODING_CONTRACTS.md (from Jareth),
|   |          FRAMEWORK.md (Sections 11, 12, 14),
|   |          All 7 CONTRACT_*.md files.
|   |-- Output: CLAUDE.md,
|   |           contracts/coding/news-analyzer.coding.md,
|   |           contracts/coding/ipo-hunter.coding.md,
|   |           contracts/coding/portfolio-manager.coding.md,
|   |           contracts/coding/llm-chatbot.coding.md,
|   |           contracts/coding/core.coding.md,
|   |           contracts/coding/data-collector.coding.md,
|   |           contracts/coding/knowledge-graph.coding.md
|   |-- Handoff: All Claude Code implementation agents (Phase 6+).
|   |
|   |-- [Kieran1-A]
|   |   |-- Task: Write CLAUDE.md: project-wide coding standards, tech stack
|   |   |         with exact versions (Next.js 14+, FastAPI 0.100+, Python
|   |   |         3.11+, Node 18+), file/folder structure, TypeScript config,
|   |   |         Python config, testing patterns (pytest + vitest + Playwright),
|   |   |         git commit format, error handling patterns, auto-debug protocol
|   |   |         (typecheck -> lint -> test -> fix cycle), import organization,
|   |   |         environment variable handling, logging standards.
|   |   |-- Estimated Context Usage: ~80% context
|   |   |-- Output: CLAUDE.md
|   |   |-- Handoff: Continue in Kieran1-B.
|   |
|   |-- [Kieran1-B]
|       |-- Task: Write all 7 modular coding contracts. Each contains:
|       |         module-specific types/interfaces, internal file structure,
|       |         naming conventions for that module, integration points with
|       |         other modules, module-specific test patterns, permitted
|       |         dependencies, forbidden patterns.
|       |-- Estimated Context Usage: Full context window
|       |-- Output: All 7 contracts/coding/*.coding.md files
|       |-- Handoff: All Phase 6 Claude Code agents.
|
|-- [Leander] Implementation Prompt Engineer -- Foundation & Backend Core
|   |-- Role: Produce self-contained implementation prompts for Claude Code
|   |         sessions covering: project scaffolding, database setup, auth
|   |         system, data collection services, NLP pipeline, and Knowledge
|   |         Graph engine.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 3
|   |-- Input: PROMPT_IMPL_ENGINEER_FOUNDATION.md (from Jareth),
|   |          IMPL_PROMPT_FORMAT_SPEC.md (from Jareth),
|   |          PHASE_DIVISION.md (from Isidore),
|   |          CONTRACT_DATACOLLECTOR.md (from Gideon),
|   |          CONTRACT_KNOWLEDGEGRAPH.md (from Helena),
|   |          CONTRACT_CORE.md (from Florian),
|   |          CLAUDE.md (from Kieran),
|   |          Relevant contracts/coding/*.coding.md files.
|   |-- Output: IMPL_PROMPT_6A_FOUNDATION.md,
|   |           IMPL_PROMPT_6B_DATABASE_AUTH.md,
|   |           IMPL_PROMPT_6C_DATACOLLECTOR.md,
|   |           IMPL_PROMPT_6D_NLP_PIPELINE.md,
|   |           IMPL_PROMPT_6E_KNOWLEDGE_GRAPH.md
|   |-- Handoff: Octavian, Perseus, Quintus, Roland, Stellan
|   |
|   |-- [Leander1-A]
|   |   |-- Task: Write IMPL_PROMPT_6A_FOUNDATION.md (project scaffolding:
|   |   |         Next.js + FastAPI setup, Docker config, env vars, Supabase
|   |   |         connection, folder structure, base configs, health endpoints)
|   |   |         and IMPL_PROMPT_6B_DATABASE_AUTH.md (all 22 table migrations,
|   |   |         pgvector extension, auth system implementation).
|   |   |-- Estimated Context Usage: Full context window
|   |   |-- Output: IMPL_PROMPT_6A_FOUNDATION.md, IMPL_PROMPT_6B_DATABASE_AUTH.md
|   |   |-- Handoff: Continue in Leander1-B.
|   |
|   |-- [Leander1-B]
|   |   |-- Task: Write IMPL_PROMPT_6C_DATACOLLECTOR.md (all scrapers, yfinance
|   |   |         integration, scheduling, rate limiting, keepalive) and
|   |   |         IMPL_PROMPT_6D_NLP_PIPELINE.md (IndoBERT NER, IndoBERT
|   |   |         Sentiment, embedding generation, preprocessing, fallbacks).
|   |   |-- Estimated Context Usage: Full context window
|   |   |-- Output: IMPL_PROMPT_6C_DATACOLLECTOR.md, IMPL_PROMPT_6D_NLP_PIPELINE.md
|   |   |-- Handoff: Continue in Leander1-C.
|   |
|   |-- [Leander1-C]
|       |-- Task: Write IMPL_PROMPT_6E_KNOWLEDGE_GRAPH.md (NetworkX graph,
|       |         entity management, impact propagation, persistence, query
|       |         interfaces). Review all 5 prompts for dependency ordering
|       |         and interface consistency.
|       |-- Estimated Context Usage: ~70% context
|       |-- Output: IMPL_PROMPT_6E_KNOWLEDGE_GRAPH.md
|       |-- Handoff: Octavian, Perseus, Quintus, Roland, Stellan.
|
|-- [Marcellus] Implementation Prompt Engineer -- Feature Modules Backend
|   |-- Role: Produce self-contained implementation prompts for Claude Code
|   |         sessions covering the backend of all four feature modules:
|   |         NewsAnalyzer, PortfolioManager, IPOHunter, LLMChatbot.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 2
|   |-- Input: PROMPT_IMPL_ENGINEER_FEATURES.md (from Jareth),
|   |          IMPL_PROMPT_FORMAT_SPEC.md (from Jareth),
|   |          PHASE_DIVISION.md (from Isidore),
|   |          CONTRACT_NEWSANALYZER.md (from Beatrix),
|   |          CONTRACT_PORTFOLIOMANAGER.md (from Dominique),
|   |          CONTRACT_IPOHUNTER.md (from Cedric),
|   |          CONTRACT_LLMCHATBOT.md (from Evangeline),
|   |          CLAUDE.md (from Kieran),
|   |          Relevant contracts/coding/*.coding.md files.
|   |-- Output: IMPL_PROMPT_6F_NEWS_BACKEND.md,
|   |           IMPL_PROMPT_6G_PORTFOLIO_BACKEND.md,
|   |           IMPL_PROMPT_6H_IPO_BACKEND.md,
|   |           IMPL_PROMPT_6I_CHATBOT_BACKEND.md
|   |-- Handoff: Tiberius, Valentin, Xander, Zenon
|   |
|   |-- [Marcellus1-A]
|   |   |-- Task: Write IMPL_PROMPT_6F_NEWS_BACKEND.md (news service layer,
|   |   |         API endpoints, sentiment integration, entity linking, impact
|   |   |         scoring, SSE news stream, deduplication) and
|   |   |         IMPL_PROMPT_6G_PORTFOLIO_BACKEND.md (portfolio CRUD,
|   |   |         transactions, tax calc, performance metrics, rebalancing,
|   |   |         sector analysis).
|   |   |-- Estimated Context Usage: Full context window
|   |   |-- Output: IMPL_PROMPT_6F_NEWS_BACKEND.md,
|   |   |           IMPL_PROMPT_6G_PORTFOLIO_BACKEND.md
|   |   |-- Handoff: Continue in Marcellus1-B.
|   |
|   |-- [Marcellus1-B]
|       |-- Task: Write IMPL_PROMPT_6H_IPO_BACKEND.md (IPO CRUD, scoring
|       |         algorithm, red/green flags, calendar, alerts) and
|       |         IMPL_PROMPT_6I_CHATBOT_BACKEND.md (Groq integration, RAG,
|       |         model routing, chat sessions, context management).
|       |-- Estimated Context Usage: ~80% context
|       |-- Output: IMPL_PROMPT_6H_IPO_BACKEND.md,
|       |           IMPL_PROMPT_6I_CHATBOT_BACKEND.md
|       |-- Handoff: Xander, Zenon.
|
|-- [Nathaniel] Implementation Prompt Engineer -- Frontend & UI
|   |-- Role: Produce self-contained implementation prompts for Claude Code
|   |         sessions covering all frontend work: design system, shared
|   |         components, all feature module frontends, dashboard, and layout.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 3
|   |-- Input: PROMPT_IMPL_ENGINEER_FRONTEND.md (from Jareth),
|   |          IMPL_PROMPT_FORMAT_SPEC.md (from Jareth),
|   |          PHASE_DIVISION.md (from Isidore),
|   |          All 7 CONTRACT_*.md files,
|   |          CLAUDE.md (from Kieran),
|   |          /design-references/*.html (mockups from Phase 2),
|   |          Relevant contracts/coding/*.coding.md files.
|   |-- Output: IMPL_PROMPT_6J_DESIGN_SYSTEM.md,
|   |           IMPL_PROMPT_6K_NEWS_FRONTEND.md,
|   |           IMPL_PROMPT_6L_PORTFOLIO_FRONTEND.md,
|   |           IMPL_PROMPT_6M_IPO_FRONTEND.md,
|   |           IMPL_PROMPT_6N_CHATBOT_FRONTEND.md,
|   |           IMPL_PROMPT_6O_CORE_FRONTEND.md,
|   |           IMPL_PROMPT_6P_DASHBOARD_LAYOUT.md
|   |-- Handoff: Alaric, Bramwell, Calloway, Demetrius, Edmund,
|   |            Fenwick, Gareth
|   |
|   |-- [Nathaniel1-A]
|   |   |-- Task: Write IMPL_PROMPT_6J_DESIGN_SYSTEM.md (Tailwind config,
|   |   |         CSS custom properties, all 10 reusable components: Sidebar,
|   |   |         Topbar, StockCard, NewsCard, MetricCard, DataTable, Charts,
|   |   |         FormComponents, Modal, ChatBubble) and
|   |   |         IMPL_PROMPT_6K_NEWS_FRONTEND.md (NewsFeed page, NewsDetail
|   |   |         page, news dashboard widgets).
|   |   |-- Estimated Context Usage: Full context window
|   |   |-- Output: IMPL_PROMPT_6J_DESIGN_SYSTEM.md,
|   |   |           IMPL_PROMPT_6K_NEWS_FRONTEND.md
|   |   |-- Handoff: Continue in Nathaniel1-B.
|   |
|   |-- [Nathaniel1-B]
|   |   |-- Task: Write IMPL_PROMPT_6L_PORTFOLIO_FRONTEND.md (Portfolio
|   |   |         Overview, Analytics pages, transaction forms, charts) and
|   |   |         IMPL_PROMPT_6M_IPO_FRONTEND.md (IPO List, IPO Detail) and
|   |   |         IMPL_PROMPT_6N_CHATBOT_FRONTEND.md (AI Chat page).
|   |   |-- Estimated Context Usage: Full context window
|   |   |-- Output: IMPL_PROMPT_6L_PORTFOLIO_FRONTEND.md,
|   |   |           IMPL_PROMPT_6M_IPO_FRONTEND.md,
|   |   |           IMPL_PROMPT_6N_CHATBOT_FRONTEND.md
|   |   |-- Handoff: Continue in Nathaniel1-C.
|   |
|   |-- [Nathaniel1-C]
|       |-- Task: Write IMPL_PROMPT_6O_CORE_FRONTEND.md (Watchlist, Alerts,
|       |         Settings pages, notification center) and
|       |         IMPL_PROMPT_6P_DASHBOARD_LAYOUT.md (Dashboard page, app
|       |         layout/shell, Sidebar + Topbar integration, SSE connection
|       |         management). Review all 7 frontend prompts for component
|       |         reuse consistency.
|       |-- Estimated Context Usage: ~80% context
|       |-- Output: IMPL_PROMPT_6O_CORE_FRONTEND.md,
|       |           IMPL_PROMPT_6P_DASHBOARD_LAYOUT.md
|       |-- Handoff: All Phase 6 frontend Claude Code agents.
|
|
|== PHASE 6 - IMPLEMENTATION (Code Writing) ====================================
|
|   NOTE: All Phase 6 agents are Claude Code Opus. Every agent receives CLAUDE.md
|   plus its specific implementation prompt and relevant coding contract. Every
|   agent must run the auto-debug cycle (typecheck -> lint -> test -> fix) before
|   completing. Handoffs include git commit hash, files modified, test status.
|
|-- [Octavian] Implementation -- Project Foundation
|   |-- Role: Set up the monorepo, install dependencies, configure build tools,
|   |         establish folder structure, create base configurations, health
|   |         check endpoints, and development environment.
|   |-- Platform: Claude Code Opus
|   |-- Estimated Sessions: 2
|   |-- Input: IMPL_PROMPT_6A_FOUNDATION.md (from Leander),
|   |          CLAUDE.md (from Kieran).
|   |-- Output: Initialized monorepo with /frontend (Next.js) and /backend
|   |           (FastAPI), all config files, Docker setup, CI skeleton.
|   |-- Handoff: Perseus
|   |
|   |-- [Octavian1-A]
|   |   |-- Task: Initialize git repo. Set up Next.js 14 app with TypeScript,
|   |   |         Tailwind CSS, ESLint, Prettier. Set up FastAPI project with
|   |   |         Poetry/pip, pytest, ruff. Create folder structure per
|   |   |         CLAUDE.md. Configure environment variables (.env.example).
|   |   |         Create Docker Compose for local dev.
|   |   |-- Estimated Context Usage: ~60% context
|   |   |-- Output: Project skeleton with passing linter checks.
|   |   |-- Handoff: Continue in Octavian1-B if needed.
|   |
|   |-- [Octavian1-B]
|       |-- Task: Health check endpoints (GET /health for backend, /api/health
|       |         for frontend). Base middleware setup. CORS configuration.
|       |         Logging setup. Base test configuration (conftest.py,
|       |         vitest.config.ts). Verify full dev environment boots.
|       |-- Estimated Context Usage: ~50% context
|       |-- Output: Bootable dev environment, all checks green.
|       |-- Handoff: HANDOFF_OCTAVIAN.md (commit hash, project state).
|
|-- [Perseus] Implementation -- Database & Authentication
|   |-- Role: Create all database migrations, set up Supabase connection,
|   |         implement pgvector extension, build the authentication system.
|   |-- Platform: Claude Code Opus
|   |-- Estimated Sessions: 3
|   |-- Input: IMPL_PROMPT_6B_DATABASE_AUTH.md (from Leander),
|   |          CLAUDE.md (from Kieran),
|   |          contracts/coding/core.coding.md (from Kieran),
|   |          HANDOFF_OCTAVIAN.md.
|   |-- Output: All 22 database tables, migration files, auth system, session
|   |           management, middleware protection.
|   |-- Handoff: Quintus
|   |
|   |-- [Perseus1-A]
|   |   |-- Task: Supabase connection setup. Create migration files for core
|   |   |         tables: users, stocks, news_articles, news_entities,
|   |   |         news_sentiment, news_impact, ipo_listings. Enable pgvector
|   |   |         extension. Create database utility layer (connection pool,
|   |   |         query helpers, transaction management).
|   |   |-- Estimated Context Usage: ~70% context
|   |   |-- Output: Core table migrations, DB utility layer.
|   |   |-- Handoff: HANDOFF_PERSEUS_1A.md
|   |
|   |-- [Perseus1-B]
|   |   |-- Task: Create remaining tables: portfolio_holdings, portfolio_
|   |   |         transactions, watchlist, alerts, chat_sessions, notifications,
|   |   |         email_queue, system_logs, and remaining tables. Create seed
|   |   |         data script. Create index definitions.
|   |   |-- Estimated Context Usage: ~70% context
|   |   |-- Output: All remaining migrations, seed data, indexes.
|   |   |-- Handoff: HANDOFF_PERSEUS_1B.md
|   |
|   |-- [Perseus1-C]
|       |-- Task: Implement auth system: bcrypt password hashing (cost 12),
|       |         JWT token generation/validation, persistent sessions (1 year),
|       |         login/logout endpoints, auth middleware, single-user guard
|       |         (ghaisan.khoirul.b@gmail.com). Write auth tests.
|       |-- Estimated Context Usage: ~60% context
|       |-- Output: Complete auth system with passing tests.
|       |-- Handoff: HANDOFF_PERSEUS.md (commit hash, all tables created,
|       |            auth endpoints tested).
|
|-- [Quintus] Implementation -- Data Collection Services
|   |-- Role: Build all data scrapers, yfinance integration, scheduling system,
|   |         rate limiting, and the Supabase keepalive mechanism.
|   |-- Platform: Claude Code Opus
|   |-- Estimated Sessions: 3
|   |-- Input: IMPL_PROMPT_6C_DATACOLLECTOR.md (from Leander),
|   |          CLAUDE.md (from Kieran),
|   |          contracts/coding/data-collector.coding.md (from Kieran),
|   |          HANDOFF_PERSEUS.md.
|   |-- Output: All scraper services, stock price fetcher, scheduler, rate limiter.
|   |-- Handoff: Roland
|   |
|   |-- [Quintus1-A]
|   |   |-- Task: News scrapers for Indonesian financial news sources. Implement
|   |   |         base scraper class with retry logic, error handling,
|   |   |         rate limiting. Implement 2-3 specific source scrapers.
|   |   |         News deduplication service.
|   |   |-- Estimated Context Usage: ~70% context
|   |   |-- Output: News scraper services with tests.
|   |   |-- Handoff: HANDOFF_QUINTUS_1A.md
|   |
|   |-- [Quintus1-B]
|   |   |-- Task: yfinance integration service (stock prices, historical data,
|   |   |         company info). Rate limiter (360 req/hour). IDX stock list
|   |   |         fetcher. IPO data scrapers (IDX, OJK, e-IPO sources).
|   |   |-- Estimated Context Usage: ~70% context
|   |   |-- Output: Stock and IPO data services with tests.
|   |   |-- Handoff: HANDOFF_QUINTUS_1B.md
|   |
|   |-- [Quintus1-C]
|       |-- Task: Scheduling system (APScheduler or equivalent): cron-based
|       |         news scraping, periodic stock price updates, IPO data refresh.
|       |         Supabase keepalive ping (every 6 days). Data normalization
|       |         utilities. Integration tests for all collectors.
|       |-- Estimated Context Usage: ~60% context
|       |-- Output: Complete data collection layer with scheduler.
|       |-- Handoff: HANDOFF_QUINTUS.md
|
|-- [Roland] Implementation -- NLP & ML Pipeline
|   |-- Role: Build the NLP processing pipeline: text preprocessing, IndoBERT
|   |         NER, IndoBERT sentiment analysis, embedding generation, and
|   |         graceful fallback mechanisms.
|   |-- Platform: Claude Code Opus
|   |-- Estimated Sessions: 3
|   |-- Input: IMPL_PROMPT_6D_NLP_PIPELINE.md (from Leander),
|   |          CLAUDE.md (from Kieran),
|   |          contracts/coding/news-analyzer.coding.md (from Kieran),
|   |          HANDOFF_QUINTUS.md.
|   |-- Output: Complete NLP pipeline with fallbacks and tests.
|   |-- Handoff: Stellan
|   |
|   |-- [Roland1-A]
|   |   |-- Task: Text preprocessing service: Indonesian text normalization,
|   |   |         slang normalization, tokenization, stopword removal.
|   |   |         IndoBERT NER integration: entity extraction (company names,
|   |   |         person names, ticker symbols, financial terms).
|   |   |-- Estimated Context Usage: ~70% context
|   |   |-- Output: Preprocessing and NER services with tests.
|   |   |-- Handoff: HANDOFF_ROLAND_1A.md
|   |
|   |-- [Roland1-B]
|   |   |-- Task: IndoBERT sentiment analysis: article-level and entity-level
|   |   |         sentiment scoring, confidence calibration, bullish/bearish
|   |   |         signal generation (bullish = sentiment >= 0.6 AND confidence
|   |   |         >= 0.7). Embedding generation with sentence-transformers
|   |   |         for pgvector storage.
|   |   |-- Estimated Context Usage: ~70% context
|   |   |-- Output: Sentiment and embedding services with tests.
|   |   |-- Handoff: HANDOFF_ROLAND_1B.md
|   |
|   |-- [Roland1-C]
|       |-- Task: NLP pipeline orchestrator (chains preprocessing -> NER ->
|       |         sentiment -> embeddings). Graceful fallback mechanisms
|       |         (rule-based NER fallback, keyword-based sentiment fallback
|       |         if model fails). Batch processing support. Pipeline
|       |         integration tests.
|       |-- Estimated Context Usage: ~60% context
|       |-- Output: Complete NLP pipeline, all tests passing.
|       |-- Handoff: HANDOFF_ROLAND.md
|
|-- [Stellan] Implementation -- Knowledge Graph Engine
|   |-- Role: Build the NetworkX-based Knowledge Graph with entity management,
|   |         relationship mapping, impact propagation, and persistence.
|   |-- Platform: Claude Code Opus
|   |-- Estimated Sessions: 2
|   |-- Input: IMPL_PROMPT_6E_KNOWLEDGE_GRAPH.md (from Leander),
|   |          CLAUDE.md (from Kieran),
|   |          contracts/coding/knowledge-graph.coding.md (from Kieran),
|   |          HANDOFF_ROLAND.md.
|   |-- Output: Complete Knowledge Graph engine with tests.
|   |-- Handoff: Tiberius
|   |
|   |-- [Stellan1-A]
|   |   |-- Task: NetworkX graph initialization. Entity node management
|   |   |         (companies, people, sectors, events). Relationship edge
|   |   |         management (ownership, supply chain, competition, regulation).
|   |   |         Graph serialization/persistence to database.
|   |   |-- Estimated Context Usage: ~70% context
|   |   |-- Output: Graph structure and persistence with tests.
|   |   |-- Handoff: HANDOFF_STELLAN_1A.md
|   |
|   |-- [Stellan1-B]
|       |-- Task: Impact propagation algorithm (max depth 2, decay 0.5^distance).
|       |         Graph update triggers (new news -> update graph -> propagate
|       |         impact). Query interfaces (affected entities, impact chains,
|       |         relationship paths). Visualization data export. Integration
|       |         tests with NLP pipeline output.
|       |-- Estimated Context Usage: ~70% context
|       |-- Output: Complete Knowledge Graph engine, all tests passing.
|       |-- Handoff: HANDOFF_STELLAN.md
|
|-- [Tiberius] Implementation -- NewsAnalyzer Backend
|   |-- Role: Build the NewsAnalyzer backend service layer, API endpoints,
|   |         and integration with NLP pipeline and Knowledge Graph.
|   |-- Platform: Claude Code Opus
|   |-- Estimated Sessions: 2
|   |-- Input: IMPL_PROMPT_6F_NEWS_BACKEND.md (from Marcellus),
|   |          CLAUDE.md (from Kieran),
|   |          contracts/coding/news-analyzer.coding.md (from Kieran),
|   |          HANDOFF_STELLAN.md.
|   |-- Output: NewsAnalyzer backend with all endpoints and tests.
|   |-- Handoff: Valentin
|   |
|   |-- [Tiberius1-A]
|   |   |-- Task: News service layer: CRUD operations, article processing
|   |   |         workflow (scrape -> preprocess -> NER -> sentiment -> KG
|   |   |         update -> store), deduplication integration, caching layer.
|   |   |         SSE news stream endpoint.
|   |   |-- Estimated Context Usage: ~70% context
|   |   |-- Output: News service layer with tests.
|   |   |-- Handoff: HANDOFF_TIBERIUS_1A.md
|   |
|   |-- [Tiberius1-B]
|       |-- Task: News API endpoints: list/filter/search articles, get article
|       |         detail with entities and sentiment, get affected stocks by
|       |         news, get news timeline for stock, news statistics/dashboard
|       |         data endpoints. Integration tests with mock NLP output.
|       |-- Estimated Context Usage: ~60% context
|       |-- Output: Complete NewsAnalyzer backend, all tests passing.
|       |-- Handoff: HANDOFF_TIBERIUS.md
|
|-- [Valentin] Implementation -- PortfolioManager Backend
|   |-- Role: Build the PortfolioManager backend: portfolio CRUD, transaction
|   |         processing, tax calculations, performance analytics.
|   |-- Platform: Claude Code Opus
|   |-- Estimated Sessions: 2
|   |-- Input: IMPL_PROMPT_6G_PORTFOLIO_BACKEND.md (from Marcellus),
|   |          CLAUDE.md (from Kieran),
|   |          contracts/coding/portfolio-manager.coding.md (from Kieran),
|   |          HANDOFF_TIBERIUS.md.
|   |-- Output: PortfolioManager backend with all endpoints and tests.
|   |-- Handoff: Xander
|   |
|   |-- [Valentin1-A]
|   |   |-- Task: Portfolio service layer: holdings CRUD, transaction processing
|   |   |         (buy/sell/dividend/stock split), cost basis calculation
|   |   |         (weighted average), tax calculation (PPh Final 0.1% on sales),
|   |   |         realized/unrealized P&L computation.
|   |   |-- Estimated Context Usage: ~70% context
|   |   |-- Output: Portfolio service with transaction tests.
|   |   |-- Handoff: HANDOFF_VALENTIN_1A.md
|   |
|   |-- [Valentin1-B]
|       |-- Task: Performance analytics: Sharpe ratio, Sortino ratio, max
|       |         drawdown, beta vs IHSG, tracking error, sector allocation.
|       |         Rebalancing suggestion engine. Risk analysis (position limits,
|       |         sector concentration per risk tolerance). All API endpoints.
|       |         Integration tests.
|       |-- Estimated Context Usage: ~70% context
|       |-- Output: Complete PortfolioManager backend, all tests passing.
|       |-- Handoff: HANDOFF_VALENTIN.md
|
|-- [Xander] Implementation -- IPOHunter Backend
|   |-- Role: Build the IPOHunter backend: IPO CRUD, scoring algorithm,
|   |         red/green flag system, alert integration.
|   |-- Platform: Claude Code Opus
|   |-- Estimated Sessions: 2
|   |-- Input: IMPL_PROMPT_6H_IPO_BACKEND.md (from Marcellus),
|   |          CLAUDE.md (from Kieran),
|   |          contracts/coding/ipo-hunter.coding.md (from Kieran),
|   |          HANDOFF_VALENTIN.md.
|   |-- Output: IPOHunter backend with all endpoints and tests.
|   |-- Handoff: Zenon
|   |
|   |-- [Xander1-A]
|   |   |-- Task: IPO service layer: IPO CRUD, data ingestion from scrapers,
|   |   |         8-criteria scoring algorithm, red/green flag system, IPO
|   |   |         calendar management, subscription tracking.
|   |   |-- Estimated Context Usage: ~65% context
|   |   |-- Output: IPO service with scoring tests.
|   |   |-- Handoff: HANDOFF_XANDER_1A.md
|   |
|   |-- [Xander1-B]
|       |-- Task: IPO alert triggers (new IPO listed, score threshold reached,
|       |         subscription period opening/closing). API endpoints for IPO
|       |         list, detail, scoring breakdown, calendar. Integration tests.
|       |-- Estimated Context Usage: ~55% context
|       |-- Output: Complete IPOHunter backend, all tests passing.
|       |-- Handoff: HANDOFF_XANDER.md
|
|-- [Zenon] Implementation -- LLM Chatbot Backend
|   |-- Role: Build the LLM Chatbot backend: Groq API integration, RAG
|   |         pipeline, model routing, chat session management.
|   |-- Platform: Claude Code Opus
|   |-- Estimated Sessions: 2
|   |-- Input: IMPL_PROMPT_6I_CHATBOT_BACKEND.md (from Marcellus),
|   |          CLAUDE.md (from Kieran),
|   |          contracts/coding/llm-chatbot.coding.md (from Kieran),
|   |          HANDOFF_XANDER.md.
|   |-- Output: LLM Chatbot backend with all endpoints and tests.
|   |-- Handoff: Alaric
|   |
|   |-- [Zenon1-A]
|   |   |-- Task: Groq API client service (Llama 3.1 8B + Llama 3.3 70B).
|   |   |         Model routing logic (8B for simple queries, 70B for complex
|   |   |         analysis). Rate limit management (14,400/day 8B, 1,000/day
|   |   |         70B). RAG pipeline: query embedding, pgvector similarity
|   |   |         search, context assembly, prompt construction.
|   |   |-- Estimated Context Usage: ~70% context
|   |   |-- Output: Groq client and RAG pipeline with tests.
|   |   |-- Handoff: HANDOFF_ZENON_1A.md
|   |
|   |-- [Zenon1-B]
|       |-- Task: Chat session management: create/list/delete sessions,
|       |         conversation history, context window management, system
|       |         prompts (investment-focused, Owner Strategy aware). Chat
|       |         API endpoints. Streaming response support. Integration tests
|       |         with mock Groq responses.
|       |-- Estimated Context Usage: ~60% context
|       |-- Output: Complete LLM Chatbot backend, all tests passing.
|       |-- Handoff: HANDOFF_ZENON.md
|
|-- [Alaric] Implementation -- Design System & Shared Components
|   |-- Role: Build the frontend design system, Tailwind configuration, CSS
|   |         custom properties, and all 10 reusable UI components.
|   |-- Platform: Claude Code Opus
|   |-- Estimated Sessions: 3
|   |-- Input: IMPL_PROMPT_6J_DESIGN_SYSTEM.md (from Nathaniel),
|   |          CLAUDE.md (from Kieran),
|   |          /design-references/*.html (mockups),
|   |          HANDOFF_ZENON.md.
|   |-- Output: Complete design system and shared component library.
|   |-- Handoff: Bramwell
|   |
|   |-- [Alaric1-A]
|   |   |-- Task: Tailwind config (dark theme: #09090B base, #5E6AD2 accent,
|   |   |         full color palette). CSS custom properties. Global styles.
|   |   |         Inter font setup. Animation utilities. Build Sidebar
|   |   |         component (240px/72px, keyboard shortcuts) and Topbar
|   |   |         component (glassmorphism, search, notifications, user menu).
|   |   |-- Estimated Context Usage: ~70% context
|   |   |-- Output: Design system foundation + Sidebar + Topbar.
|   |   |-- Handoff: HANDOFF_ALARIC_1A.md
|   |
|   |-- [Alaric1-B]
|   |   |-- Task: Build StockCard, NewsCard, MetricCard, DataTable components
|   |   |         with all variants, states, and animations per framework spec.
|   |   |-- Estimated Context Usage: ~70% context
|   |   |-- Output: 4 additional components with Storybook/test coverage.
|   |   |-- Handoff: HANDOFF_ALARIC_1B.md
|   |
|   |-- [Alaric1-C]
|       |-- Task: Build Charts (Area, Bar, Donut, Candlestick using Lightweight
|       |         Charts), FormComponents (Input, Select, Checkbox, Radio,
|       |         Toggle, Slider, Button), Modal (all variants), ChatBubble
|       |         (user/AI messages, code blocks, typing indicator). Component
|       |         tests for all 10 components.
|       |-- Estimated Context Usage: ~70% context
|       |-- Output: Complete component library, all tests passing.
|       |-- Handoff: HANDOFF_ALARIC.md
|
|-- [Bramwell] Implementation -- News Analyzer Frontend
|   |-- Role: Build the NewsFeed page, NewsDetail page, and news-related
|   |         dashboard widgets.
|   |-- Platform: Claude Code Opus
|   |-- Estimated Sessions: 2
|   |-- Input: IMPL_PROMPT_6K_NEWS_FRONTEND.md (from Nathaniel),
|   |          CLAUDE.md (from Kieran),
|   |          contracts/coding/news-analyzer.coding.md (from Kieran),
|   |          /design-references/ (news page mockups),
|   |          HANDOFF_ALARIC.md.
|   |-- Output: News frontend pages with API integration and tests.
|   |-- Handoff: Calloway
|   |
|   |-- [Bramwell1-A]
|   |   |-- Task: NewsFeed page: article list with NewsCard components,
|   |   |         filtering (by sentiment, source, ticker, date), sorting,
|   |   |         infinite scroll/pagination, search, SSE real-time updates.
|   |   |-- Estimated Context Usage: ~70% context
|   |   |-- Output: NewsFeed page with API hooks.
|   |   |-- Handoff: HANDOFF_BRAMWELL_1A.md
|   |
|   |-- [Bramwell1-B]
|       |-- Task: NewsDetail page: full article view, entity highlights,
|       |         sentiment visualization, affected stocks list, Knowledge
|       |         Graph impact visualization, related articles. News dashboard
|       |         widgets (sentiment overview, trending tickers, recent alerts).
|       |         Component and integration tests.
|       |-- Estimated Context Usage: ~70% context
|       |-- Output: Complete News frontend, all tests passing.
|       |-- Handoff: HANDOFF_BRAMWELL.md
|
|-- [Calloway] Implementation -- Portfolio Manager Frontend
|   |-- Role: Build the Portfolio Overview page, Portfolio Analytics page,
|   |         and transaction management UI.
|   |-- Platform: Claude Code Opus
|   |-- Estimated Sessions: 2
|   |-- Input: IMPL_PROMPT_6L_PORTFOLIO_FRONTEND.md (from Nathaniel),
|   |          CLAUDE.md (from Kieran),
|   |          contracts/coding/portfolio-manager.coding.md (from Kieran),
|   |          /design-references/ (portfolio page mockups),
|   |          HANDOFF_BRAMWELL.md.
|   |-- Output: Portfolio frontend pages with API integration and tests.
|   |-- Handoff: Demetrius
|   |
|   |-- [Calloway1-A]
|   |   |-- Task: Portfolio Overview page: holdings table with StockCard
|   |   |         integration, allocation donut chart, total value/P&L
|   |   |         display, transaction history table, add transaction modal.
|   |   |-- Estimated Context Usage: ~70% context
|   |   |-- Output: Portfolio Overview page with API hooks.
|   |   |-- Handoff: HANDOFF_CALLOWAY_1A.md
|   |
|   |-- [Calloway1-B]
|       |-- Task: Portfolio Analytics page: performance area chart (vs IHSG
|       |         benchmark), sector bar chart, risk metrics display (Sharpe,
|       |         Sortino, max drawdown, beta), rebalancing suggestions UI,
|       |         tax summary view. Component and integration tests.
|       |-- Estimated Context Usage: ~70% context
|       |-- Output: Complete Portfolio frontend, all tests passing.
|       |-- Handoff: HANDOFF_CALLOWAY.md
|
|-- [Demetrius] Implementation -- IPO Hunter Frontend
|   |-- Role: Build the IPO List page and IPO Detail page.
|   |-- Platform: Claude Code Opus
|   |-- Estimated Sessions: 2
|   |-- Input: IMPL_PROMPT_6M_IPO_FRONTEND.md (from Nathaniel),
|   |          CLAUDE.md (from Kieran),
|   |          contracts/coding/ipo-hunter.coding.md (from Kieran),
|   |          /design-references/ (IPO page mockups),
|   |          HANDOFF_CALLOWAY.md.
|   |-- Output: IPO frontend pages with API integration and tests.
|   |-- Handoff: Edmund
|   |
|   |-- [Demetrius1-A]
|   |   |-- Task: IPO List page: IPO cards with score badges, filtering
|   |   |         (by status, score range, sector), sorting, calendar view
|   |   |         toggle, upcoming IPO countdown timers.
|   |   |-- Estimated Context Usage: ~65% context
|   |   |-- Output: IPO List page with API hooks.
|   |   |-- Handoff: HANDOFF_DEMETRIUS_1A.md
|   |
|   |-- [Demetrius1-B]
|       |-- Task: IPO Detail page: company overview, scoring breakdown
|       |         (8 criteria visualization), red/green flags display,
|       |         financial data tables, subscription details, related news.
|       |         Component and integration tests.
|       |-- Estimated Context Usage: ~65% context
|       |-- Output: Complete IPO frontend, all tests passing.
|       |-- Handoff: HANDOFF_DEMETRIUS.md
|
|-- [Edmund] Implementation -- LLM Chatbot Frontend
|   |-- Role: Build the AI Chat page with conversation management.
|   |-- Platform: Claude Code Opus
|   |-- Estimated Sessions: 2
|   |-- Input: IMPL_PROMPT_6N_CHATBOT_FRONTEND.md (from Nathaniel),
|   |          CLAUDE.md (from Kieran),
|   |          contracts/coding/llm-chatbot.coding.md (from Kieran),
|   |          /design-references/ (chat page mockup),
|   |          HANDOFF_DEMETRIUS.md.
|   |-- Output: Chat frontend with API integration and tests.
|   |-- Handoff: Fenwick
|   |
|   |-- [Edmund1-A]
|   |   |-- Task: AI Chat page: conversation list sidebar, message display
|   |   |         with ChatBubble components, message input with send button,
|   |   |         streaming response display, typing indicator, code block
|   |   |         rendering, new conversation creation.
|   |   |-- Estimated Context Usage: ~70% context
|   |   |-- Output: Chat page with API hooks and streaming.
|   |   |-- Handoff: HANDOFF_EDMUND_1A.md
|   |
|   |-- [Edmund1-B]
|       |-- Task: Conversation management: session switching, history search,
|       |         session deletion, context indicators, suggested prompts.
|       |         Mobile-width chat optimizations (desktop-only but responsive
|       |         within 1920-2560px). Component and integration tests.
|       |-- Estimated Context Usage: ~60% context
|       |-- Output: Complete Chat frontend, all tests passing.
|       |-- Handoff: HANDOFF_EDMUND.md
|
|-- [Fenwick] Implementation -- Core Features Frontend
|   |-- Role: Build the Watchlist page, Alerts page, Settings page, and
|   |         notification center component.
|   |-- Platform: Claude Code Opus
|   |-- Estimated Sessions: 2
|   |-- Input: IMPL_PROMPT_6O_CORE_FRONTEND.md (from Nathaniel),
|   |          CLAUDE.md (from Kieran),
|   |          contracts/coding/core.coding.md (from Kieran),
|   |          /design-references/ (watchlist, alerts, settings mockups),
|   |          HANDOFF_EDMUND.md.
|   |-- Output: Core feature frontend pages with tests.
|   |-- Handoff: Gareth
|   |
|   |-- [Fenwick1-A]
|   |   |-- Task: Watchlist page: stock table with real-time price updates,
|   |   |         add/remove stocks, quick view with sparklines. Alerts page:
|   |   |         alert list, create/edit alert modal, alert history, toggle
|   |   |         active/inactive. Notification center: dropdown from Topbar,
|   |   |         notification list, mark read/unread, SSE connection.
|   |   |-- Estimated Context Usage: ~75% context
|   |   |-- Output: Watchlist, Alerts, Notifications with API hooks.
|   |   |-- Handoff: HANDOFF_FENWICK_1A.md
|   |
|   |-- [Fenwick1-B]
|       |-- Task: Settings page: profile settings, notification preferences
|       |         (quiet hours, channels, frequency), risk tolerance selector,
|       |         data management (export, clear cache), display preferences.
|       |         Email notification integration (Resend). Component and
|       |         integration tests.
|       |-- Estimated Context Usage: ~65% context
|       |-- Output: Complete Core frontend, all tests passing.
|       |-- Handoff: HANDOFF_FENWICK.md
|
|-- [Gareth] Implementation -- Dashboard & App Layout
|   |-- Role: Build the main Dashboard page, app shell layout (Sidebar +
|   |         Topbar + content area), routing, and SSE connection management.
|   |-- Platform: Claude Code Opus
|   |-- Estimated Sessions: 2
|   |-- Input: IMPL_PROMPT_6P_DASHBOARD_LAYOUT.md (from Nathaniel),
|   |          CLAUDE.md (from Kieran),
|   |          /design-references/ (dashboard mockup),
|   |          HANDOFF_FENWICK.md.
|   |-- Output: Dashboard page, app layout, routing, global state.
|   |-- Handoff: Hadrian
|   |
|   |-- [Gareth1-A]
|   |   |-- Task: App shell layout: Sidebar integration (route-aware active
|   |   |         states, collapse/expand), Topbar integration (search,
|   |   |         notifications, user menu), content area with proper scrolling.
|   |   |         Next.js routing setup for all pages. Global SSE connection
|   |   |         manager. Global state management (Zustand or similar).
|   |   |-- Estimated Context Usage: ~70% context
|   |   |-- Output: App shell with routing and SSE.
|   |   |-- Handoff: HANDOFF_GARETH_1A.md
|   |
|   |-- [Gareth1-B]
|       |-- Task: Dashboard page: market overview MetricCards (IHSG, top
|       |         movers), portfolio summary widget, recent news widget
|       |         (latest 5 articles with sentiment), active alerts widget,
|       |         watchlist quick view, IPO calendar widget. Data fetching
|       |         and refresh logic. Component and integration tests.
|       |-- Estimated Context Usage: ~70% context
|       |-- Output: Complete Dashboard, all tests passing.
|       |-- Handoff: HANDOFF_GARETH.md
|
|
|== PHASE 7 - INTEGRATION & QA ================================================
|
|-- [Hadrian] Prompt Architect for Integration & QA
|   |-- Role: Create prompts for integration testing, E2E QA, security audit,
|   |         and bug-fixing agents based on the current codebase state.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 1
|   |-- Input: FRAMEWORK.md (Sections 14, 15),
|   |          CLAUDE.md (from Kieran),
|   |          HANDOFF_GARETH.md (final implementation state),
|   |          PHASE_DIVISION.md (from Isidore).
|   |-- Output: PROMPT_INTEGRATION_TEST.md,
|   |           PROMPT_E2E_QA.md,
|   |           PROMPT_SECURITY_AUDIT.md,
|   |           PROMPT_BUGFIX.md
|   |-- Handoff: Ignatius, Julian, Klaus, Leopold
|   |
|   |-- [Hadrian1-A]
|       |-- Task: Full session -- read final implementation state, design
|       |         integration test plan, E2E test scenarios, security audit
|       |         checklist, and bug-fix protocol. Write all 4 prompts.
|       |-- Estimated Context Usage: ~80% context
|       |-- Output: All 4 QA phase prompts.
|       |-- Handoff: Ignatius, Julian, Klaus, Leopold.
|
|-- [Ignatius] Cross-Module Integration Testing
|   |-- Role: Write and run integration tests that verify all modules work
|   |         together: data flows correctly from scrapers through NLP to
|   |         Knowledge Graph to API to frontend.
|   |-- Platform: Claude Code Opus
|   |-- Estimated Sessions: 3
|   |-- Input: PROMPT_INTEGRATION_TEST.md (from Hadrian),
|   |          CLAUDE.md (from Kieran),
|   |          HANDOFF_GARETH.md,
|   |          Full codebase (git clone).
|   |-- Output: Integration test suite, INTEGRATION_REPORT.md
|   |-- Handoff: Julian
|   |
|   |-- [Ignatius1-A]
|   |   |-- Task: Backend integration tests: scraper -> NLP pipeline ->
|   |   |         Knowledge Graph -> database flow. News processing end-to-end.
|   |   |         Portfolio transaction -> analytics calculation flow. IPO
|   |   |         data ingestion -> scoring flow.
|   |   |-- Estimated Context Usage: ~75% context
|   |   |-- Output: Backend integration tests.
|   |   |-- Handoff: HANDOFF_IGNATIUS_1A.md
|   |
|   |-- [Ignatius1-B]
|   |   |-- Task: API integration tests: all endpoint chains, auth flow,
|   |   |         SSE streaming, error handling across modules. Frontend-backend
|   |   |         integration: API hooks return correct data, state management
|   |   |         updates properly, real-time features work.
|   |   |-- Estimated Context Usage: ~75% context
|   |   |-- Output: API and frontend-backend integration tests.
|   |   |-- Handoff: HANDOFF_IGNATIUS_1B.md
|   |
|   |-- [Ignatius1-C]
|       |-- Task: Fix all integration test failures. Resolve cross-module
|       |         interface mismatches. Produce INTEGRATION_REPORT.md with
|       |         test results, issues found, fixes applied.
|       |-- Estimated Context Usage: ~70% context
|       |-- Output: All integration tests passing, INTEGRATION_REPORT.md.
|       |-- Handoff: HANDOFF_IGNATIUS.md
|
|-- [Julian] End-to-End QA & Performance Testing
|   |-- Role: Write and run E2E tests (Playwright), performance benchmarks,
|   |         and user flow verification across the entire application.
|   |-- Platform: Claude Code Opus
|   |-- Estimated Sessions: 3
|   |-- Input: PROMPT_E2E_QA.md (from Hadrian),
|   |          CLAUDE.md (from Kieran),
|   |          HANDOFF_IGNATIUS.md,
|   |          Full codebase.
|   |-- Output: E2E test suite, QA_REPORT.md
|   |-- Handoff: Klaus
|   |
|   |-- [Julian1-A]
|   |   |-- Task: Playwright setup. E2E tests for critical user flows: login,
|   |   |         view dashboard, browse news feed, read article detail, manage
|   |   |         portfolio (add transaction, view analytics).
|   |   |-- Estimated Context Usage: ~70% context
|   |   |-- Output: E2E tests for core flows.
|   |   |-- Handoff: HANDOFF_JULIAN_1A.md
|   |
|   |-- [Julian1-B]
|   |   |-- Task: E2E tests for: IPO browsing, chatbot conversation, watchlist
|   |   |         management, alert creation/triggering, settings changes,
|   |   |         notification receipt. Performance testing: page load times
|   |   |         (target < 3s), API response times (target < 500ms), SSE
|   |   |         latency, memory usage.
|   |   |-- Estimated Context Usage: ~70% context
|   |   |-- Output: Complete E2E suite + performance benchmarks.
|   |   |-- Handoff: HANDOFF_JULIAN_1B.md
|   |
|   |-- [Julian1-C]
|       |-- Task: Fix all E2E failures. Visual regression check against
|       |         design references. Produce QA_REPORT.md with pass/fail
|       |         matrix, performance results, screenshots.
|       |-- Estimated Context Usage: ~65% context
|       |-- Output: All E2E tests passing, QA_REPORT.md.
|       |-- Handoff: HANDOFF_JULIAN.md
|
|-- [Klaus] Security Audit
|   |-- Role: Perform a security audit of the entire application covering
|   |         authentication, data exposure, input validation, dependency
|   |         vulnerabilities, and deployment configuration.
|   |-- Platform: Claude Code Opus
|   |-- Estimated Sessions: 2
|   |-- Input: PROMPT_SECURITY_AUDIT.md (from Hadrian),
|   |          CLAUDE.md (from Kieran),
|   |          HANDOFF_JULIAN.md,
|   |          Full codebase.
|   |-- Output: SECURITY_AUDIT.md, security fixes applied to codebase.
|   |-- Handoff: Leopold
|   |
|   |-- [Klaus1-A]
|   |   |-- Task: Auth audit (JWT security, session handling, password hashing,
|   |   |         single-user enforcement). Input validation audit (SQL injection,
|   |   |         XSS, CSRF). API security (rate limiting, CORS, error message
|   |   |         information leakage). Dependency vulnerability scan.
|   |   |-- Estimated Context Usage: ~75% context
|   |   |-- Output: Security findings with severity ratings.
|   |   |-- Handoff: HANDOFF_KLAUS_1A.md
|   |
|   |-- [Klaus1-B]
|       |-- Task: Fix all critical and high severity findings. Environment
|       |         variable security check. Supabase RLS (Row Level Security)
|       |         verification. API key exposure check. Produce final
|       |         SECURITY_AUDIT.md.
|       |-- Estimated Context Usage: ~65% context
|       |-- Output: Security fixes applied, SECURITY_AUDIT.md.
|       |-- Handoff: HANDOFF_KLAUS.md
|
|-- [Leopold] Bug Fixing & Polish
|   |-- Role: Address all remaining bugs, UI inconsistencies, and polish
|   |         items identified across integration, QA, and security phases.
|   |-- Platform: Claude Code Opus
|   |-- Estimated Sessions: 3
|   |-- Input: PROMPT_BUGFIX.md (from Hadrian),
|   |          CLAUDE.md (from Kieran),
|   |          INTEGRATION_REPORT.md (from Ignatius),
|   |          QA_REPORT.md (from Julian),
|   |          SECURITY_AUDIT.md (from Klaus),
|   |          HANDOFF_KLAUS.md,
|   |          Full codebase.
|   |-- Output: Polished codebase, all known issues resolved.
|   |-- Handoff: Montgomery
|   |
|   |-- [Leopold1-A]
|   |   |-- Task: Fix critical bugs from QA and integration reports. Address
|   |   |         any remaining security findings. UI alignment fixes against
|   |   |         design references.
|   |   |-- Estimated Context Usage: ~75% context
|   |   |-- Output: Critical fixes applied.
|   |   |-- Handoff: HANDOFF_LEOPOLD_1A.md
|   |
|   |-- [Leopold1-B]
|   |   |-- Task: Fix medium/low priority bugs. Performance optimizations
|   |   |         (lazy loading, code splitting, query optimization). Animation
|   |   |         polish. Loading states and error states for all pages.
|   |   |-- Estimated Context Usage: ~75% context
|   |   |-- Output: Medium/low fixes and optimizations.
|   |   |-- Handoff: HANDOFF_LEOPOLD_1B.md
|   |
|   |-- [Leopold1-C]
|       |-- Task: Final regression test run. Verify all previously failing
|       |         tests now pass. Code cleanup (remove dead code, TODOs,
|       |         console.logs). Final lint and typecheck pass.
|       |-- Estimated Context Usage: ~60% context
|       |-- Output: Clean codebase, all tests green.
|       |-- Handoff: HANDOFF_LEOPOLD.md
|
|
|== PHASE 8 - DEPLOYMENT & DOCUMENTATION ======================================
|
|-- [Montgomery] Prompt Architect for Deployment & Docs
|   |-- Role: Create prompts for the deployment agent and the documentation
|   |         agent based on the framework deployment specs and the current
|   |         codebase state.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 1
|   |-- Input: FRAMEWORK.md (Section 15 Deployment, Section 17 External Services),
|   |          HANDOFF_LEOPOLD.md,
|   |          CLAUDE.md (from Kieran).
|   |-- Output: PROMPT_DEPLOYMENT.md, PROMPT_DOCUMENTATION.md
|   |-- Handoff: Percival, Reginald
|   |
|   |-- [Montgomery1-A]
|       |-- Task: Full session -- write deployment prompt (Vercel frontend,
|       |         Railway backend, Supabase production config, environment
|       |         variables, CI/CD pipeline, health checks, monitoring) and
|       |         documentation prompt (README, API docs, architecture guide,
|       |         developer setup guide, user manual).
|       |-- Estimated Context Usage: ~70% context
|       |-- Output: PROMPT_DEPLOYMENT.md, PROMPT_DOCUMENTATION.md
|       |-- Handoff: Percival, Reginald.
|
|-- [Percival] Deployment Setup & Execution
|   |-- Role: Configure and execute the full deployment pipeline: Vercel
|   |         frontend, Railway backend, Supabase production database,
|   |         CI/CD, monitoring, and health checks.
|   |-- Platform: Claude Code Opus
|   |-- Estimated Sessions: 2
|   |-- Input: PROMPT_DEPLOYMENT.md (from Montgomery),
|   |          CLAUDE.md (from Kieran),
|   |          HANDOFF_LEOPOLD.md,
|   |          Full codebase.
|   |-- Output: Deployed application, DEPLOYMENT_GUIDE.md
|   |-- Handoff: Reginald
|   |
|   |-- [Percival1-A]
|   |   |-- Task: Vercel deployment config (vercel.json, environment variables,
|   |   |         build settings). Railway deployment config (Procfile,
|   |   |         railway.toml, environment variables). Supabase production
|   |   |         setup (migrations, RLS policies, connection pooling).
|   |   |         CI/CD pipeline (GitHub Actions: lint, typecheck, test, deploy).
|   |   |-- Estimated Context Usage: ~70% context
|   |   |-- Output: Deployment configurations.
|   |   |-- Handoff: HANDOFF_PERCIVAL_1A.md
|   |
|   |-- [Percival1-B]
|       |-- Task: Execute deployment. Verify health checks. Set up Supabase
|       |         keepalive cron (external or Railway cron). Production smoke
|       |         tests. Produce DEPLOYMENT_GUIDE.md (runbook for future
|       |         deployments, rollback procedures, monitoring endpoints).
|       |-- Estimated Context Usage: ~60% context
|       |-- Output: Live application, DEPLOYMENT_GUIDE.md.
|       |-- Handoff: HANDOFF_PERCIVAL.md
|
|-- [Reginald] Documentation Author
|   |-- Role: Produce all project documentation: README, API documentation,
|   |         architecture guide, developer setup guide, and user manual.
|   |-- Platform: Claude Code Opus
|   |-- Estimated Sessions: 2
|   |-- Input: PROMPT_DOCUMENTATION.md (from Montgomery),
|   |          CLAUDE.md (from Kieran),
|   |          HANDOFF_PERCIVAL.md,
|   |          Full codebase,
|   |          FRAMEWORK.md (for reference).
|   |-- Output: README.md, docs/API.md, docs/ARCHITECTURE.md,
|   |           docs/DEVELOPER_GUIDE.md, docs/USER_MANUAL.md
|   |-- Handoff: Siegfried
|   |
|   |-- [Reginald1-A]
|   |   |-- Task: Write README.md (project overview, tech stack, quick start,
|   |   |         features, screenshots placeholder). Write docs/API.md
|   |   |         (auto-generated from FastAPI + manual supplementation).
|   |   |         Write docs/ARCHITECTURE.md (system diagram, data flow,
|   |   |         module boundaries, deployment topology).
|   |   |-- Estimated Context Usage: ~75% context
|   |   |-- Output: README.md, docs/API.md, docs/ARCHITECTURE.md
|   |   |-- Handoff: HANDOFF_REGINALD_1A.md
|   |
|   |-- [Reginald1-B]
|       |-- Task: Write docs/DEVELOPER_GUIDE.md (local setup, environment
|       |         variables, testing, contributing, code standards). Write
|       |         docs/USER_MANUAL.md (feature walkthrough, settings guide,
|       |         FAQ, troubleshooting).
|       |-- Estimated Context Usage: ~65% context
|       |-- Output: docs/DEVELOPER_GUIDE.md, docs/USER_MANUAL.md
|       |-- Handoff: HANDOFF_REGINALD.md
|
|
|== PHASE 9 - VALIDATION & HANDOVER ===========================================
|
|-- [Siegfried] Prompt Architect for Final Validation
|   |-- Role: Create the prompt for the final validation agent that will
|   |         verify the complete application against the original framework.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 1
|   |-- Input: FRAMEWORK.md,
|   |          AGENT_STRUCTURE.md (from Nikolai),
|   |          HANDOFF_REGINALD.md.
|   |-- Output: PROMPT_FINAL_VALIDATION.md
|   |-- Handoff: Theodosius
|   |
|   |-- [Siegfried1-A]
|       |-- Task: Full session -- design validation checklist covering every
|       |         framework requirement: all 22 tables exist, all 50+ endpoints
|       |         work, all 12 pages render, all ML pipeline stages functional,
|       |         Knowledge Graph operational, all 10 components built,
|       |         auth works, email works, SSE works, free-tier constraints
|       |         respected. Write PROMPT_FINAL_VALIDATION.md.
|       |-- Estimated Context Usage: ~75% context
|       |-- Output: PROMPT_FINAL_VALIDATION.md
|       |-- Handoff: Theodosius.
|
|-- [Theodosius] Final Validation & Acceptance Testing
|   |-- Role: Execute the final validation prompt against the deployed
|   |         application. Verify every framework requirement. Produce the
|   |         acceptance report.
|   |-- Platform: Claude Code Opus
|   |-- Estimated Sessions: 2
|   |-- Input: PROMPT_FINAL_VALIDATION.md (from Siegfried),
|   |          FRAMEWORK.md,
|   |          Full codebase,
|   |          DEPLOYMENT_GUIDE.md (from Percival).
|   |-- Output: VALIDATION_REPORT.md
|   |-- Handoff: Ulysses
|   |
|   |-- [Theodosius1-A]
|   |   |-- Task: Backend validation: verify all database tables, run all
|   |   |         API endpoints, verify NLP pipeline processes articles,
|   |   |         verify Knowledge Graph builds and propagates, verify
|   |   |         data collectors run on schedule, verify auth system,
|   |   |         verify email sending, verify Supabase keepalive.
|   |   |-- Estimated Context Usage: ~75% context
|   |   |-- Output: Backend validation results.
|   |   |-- Handoff: HANDOFF_THEODOSIUS_1A.md
|   |
|   |-- [Theodosius1-B]
|       |-- Task: Frontend validation: verify all 12 pages render correctly,
|       |         verify all 10 components function, verify SSE real-time
|       |         updates, verify design system (colors, fonts, spacing match
|       |         framework), verify responsive behavior (1920x1080 and
|       |         2560x1440). Produce VALIDATION_REPORT.md with pass/fail
|       |         per requirement, overall compliance score.
|       |-- Estimated Context Usage: ~75% context
|       |-- Output: VALIDATION_REPORT.md
|       |-- Handoff: Ulysses receives VALIDATION_REPORT.md.
|
|-- [Ulysses] Final Project Report
|   |-- Role: Produce the final project report summarizing the entire build
|   |         process, consolidating all phase outputs, and providing the
|   |         definitive handover document.
|   |-- Platform: Claude Chat Opus
|   |-- Estimated Sessions: 1
|   |-- Input: VALIDATION_REPORT.md (from Theodosius),
|   |          INTEGRATION_REPORT.md (from Ignatius),
|   |          QA_REPORT.md (from Julian),
|   |          SECURITY_AUDIT.md (from Klaus),
|   |          DEPLOYMENT_GUIDE.md (from Percival),
|   |          AGENT_STRUCTURE.md (from Nikolai).
|   |-- Output: FINAL_PROJECT_REPORT.md
|   |-- Handoff: Ghaisan (project complete).
|   |
|   |-- [Ulysses1-A]
|       |-- Task: Full session -- compile executive summary, build statistics
|       |         (total LOC, test coverage, endpoints, pages), list all
|       |         known limitations, document maintenance procedures,
|       |         provide future enhancement roadmap, list all credentials
|       |         and services used (with links), produce the definitive
|       |         project handover document.
|       |-- Estimated Context Usage: ~70% context
|       |-- Output: FINAL_PROJECT_REPORT.md
|       |-- Handoff: Ghaisan. Pipeline complete.
```

---

## REVISITATION PROTOCOL

The following agents may need to be revisited if downstream agents discover gaps:

```
Revisitation Trigger                          | Reopen Agent   | Session Format
----------------------------------------------|----------------|------------------
Contract missing interface definition         | Aldric         | Aldric2-A
Framework ambiguity blocking implementation   | Konstantin or  | Konstantin2-A or
                                              | Lysander       | Lysander2-A
Design mockup missing page variant            | Vivienne       | Vivienne2-A
CLAUDE.md needs additional pattern            | Kieran         | Kieran2-A
Implementation prompt lacks critical detail   | Leander,       | [Name]2-A
                                              | Marcellus, or  |
                                              | Nathaniel      |
Integration test reveals architecture flaw    | Aldric or      | [Name]2-A
                                              | Isidore        |
```

Revisitation sessions follow the same naming convention: [Name][NewMajorNumber]-[Letter].
Ghaisan determines when revisitation is needed based on feedback from the active agent.

---

## SUMMARY TABLE

### Agent Count by Phase

```
Phase | Phase Name               | Unique Agents | Total Sub-Sessions | Chat Opus | Code Opus
------|--------------------------|---------------|--------------------|-----------|-----------
  0   | Genesis                  |       2       |         4          |     4     |     0
  1   | Architecture             |       3       |         8          |     8     |     0
  2   | Design                   |       2       |         3          |     3     |     0
  3   | Pipeline Design          |       2       |         3          |     3     |     0
  4   | Contracts                |       9       |        12          |    12     |     0
  5   | Prompt Engineering       |       5       |        12          |    12     |     0
  6   | Implementation           |      13       |        31          |     0     |    31
  7   | Integration & QA         |       5       |        12          |     1     |    11
  8   | Deployment & Docs        |       3       |         5          |     1     |     4
  9   | Validation & Handover    |       3       |         4          |     2     |     2
------|--------------------------|---------------|--------------------|-----------|-----------
TOTAL |                          |      47       |        94          |    46     |    48
```

### Platform Breakdown

```
Platform            | Total Sub-Sessions | Percentage
--------------------|--------------------|-----------
Claude Chat Opus    |        46          |    49%
Claude Code Opus    |        48          |    51%
--------------------|--------------------|-----------
TOTAL               |        94          |   100%
```

### Estimated Revisitation Budget

```
Anticipated revisitation sessions:  6-12 additional sub-sessions
Adjusted total range:               100-106 sub-sessions
```

### Key Artifact Count

```
Artifact Category                | Count
---------------------------------|------
Prompt documents                 |   22
Contract documents               |    7
Coding contract documents        |    7
Implementation prompt documents  |   16
Report documents                 |    6
Configuration files (CLAUDE.md)  |    1
Design reference files           |   22
Handoff documents                |  ~45
---------------------------------|------
Total unique artifacts           | ~126
```

---

## EXECUTION PROTOCOL

Ordered checklist for Ghaisan to execute the complete pipeline.

### Phase 0 - Genesis

```
Step  | Action
------|-----------------------------------------------------------------------
  1   | Open Claude Chat Opus session. Name: "Orion1-A".
      | Upload: nothing (start from blank conversation).
      | Task: Brainstorm product idea. Export conversation decisions.
      | Collect: BRAINSTORM_NOTES_DRAFT.md

  2   | Open Claude Chat Opus session. Name: "Orion1-B".
      | Upload: BRAINSTORM_NOTES_DRAFT.md
      | Task: Refine and finalize brainstorm.
      | Collect: BRAINSTORM_NOTES.md

  3   | Open Claude Chat Opus session. Name: "Theron1-A".
      | Upload: BRAINSTORM_NOTES.md
      | Task: Write sections 1-5 of comprehensive idea document.
      | Collect: COMPREHENSIVE_IDEA_PART1.md

  4   | Open Claude Chat Opus session. Name: "Theron1-B".
      | Upload: BRAINSTORM_NOTES.md, COMPREHENSIVE_IDEA_PART1.md
      | Task: Write sections 6-10 and merge into final document.
      | Collect: COMPREHENSIVE_IDEA.md
```

### Phase 1 - Architecture

```
Step  | Action
------|-----------------------------------------------------------------------
  5   | Open Claude Chat Opus session. Name: "Raphael1-A".
      | Upload: COMPREHENSIVE_IDEA.md
      | Task: Write PROMPT_FRAMEWORK_PART1.md.
      | Collect: PROMPT_FRAMEWORK_PART1.md

  6   | Open Claude Chat Opus session. Name: "Raphael1-B".
      | Upload: COMPREHENSIVE_IDEA.md
      | Task: Write PROMPT_FRAMEWORK_PART2.md.
      | Collect: PROMPT_FRAMEWORK_PART2.md

  7   | Open Claude Chat Opus session. Name: "Konstantin1-A".
      | Upload: PROMPT_FRAMEWORK_PART1.md, COMPREHENSIVE_IDEA.md
      | Task: Write framework sections 1-4.
      | Collect: FRAMEWORK_PART1_DRAFT_S1-S4.md, HANDOFF_KONSTANTIN_1A.md

  8   | Open Claude Chat Opus session. Name: "Konstantin1-B".
      | Upload: PROMPT_FRAMEWORK_PART1.md, COMPREHENSIVE_IDEA.md,
      |         HANDOFF_KONSTANTIN_1A.md
      | Task: Write framework sections 5-6.
      | Collect: FRAMEWORK_PART1_DRAFT_S5-S6.md, HANDOFF_KONSTANTIN_1B.md

  9   | Open Claude Chat Opus session. Name: "Konstantin1-C".
      | Upload: PROMPT_FRAMEWORK_PART1.md, COMPREHENSIVE_IDEA.md,
      |         HANDOFF_KONSTANTIN_1B.md, FRAMEWORK_PART1_DRAFT_S1-S4.md,
      |         FRAMEWORK_PART1_DRAFT_S5-S6.md
      | Task: Write sections 7-8.2 and merge all into final.
      | Collect: FRAMEWORK_PART1.md

 10   | Open Claude Chat Opus session. Name: "Lysander1-A".
      | Upload: PROMPT_FRAMEWORK_PART2.md, COMPREHENSIVE_IDEA.md,
      |         FRAMEWORK_PART1.md
      | Task: Write framework sections 8.3-8.4.
      | Collect: FRAMEWORK_PART2_DRAFT_S8.3-S8.4.md, HANDOFF_LYSANDER_1A.md

 11   | Open Claude Chat Opus session. Name: "Lysander1-B".
      | Upload: PROMPT_FRAMEWORK_PART2.md, COMPREHENSIVE_IDEA.md,
      |         HANDOFF_LYSANDER_1A.md
      | Task: Write framework sections 9-13.
      | Collect: FRAMEWORK_PART2_DRAFT_S9-S13.md, HANDOFF_LYSANDER_1B.md

 12   | Open Claude Chat Opus session. Name: "Lysander1-C".
      | Upload: PROMPT_FRAMEWORK_PART2.md, HANDOFF_LYSANDER_1B.md,
      |         FRAMEWORK_PART2_DRAFT_S8.3-S8.4.md,
      |         FRAMEWORK_PART2_DRAFT_S9-S13.md
      | Task: Write sections 14-19 and merge all into final.
      | Collect: FRAMEWORK_PART2.md

 13   | MANUAL: Merge FRAMEWORK_PART1.md + FRAMEWORK_PART2.md into FRAMEWORK.md
```

### Phase 2 - Design

```
Step  | Action
------|-----------------------------------------------------------------------
 14   | Open Claude Chat Opus session. Name: "Vivienne1-A".
      | Upload: FRAMEWORK.md
      | Task: Produce design tool instructions and mockup prompts.
      | Collect: DESIGN_INSTRUCTIONS.md, DESIGN_PROMPTS.md

 15   | MANUAL: Use external AI tools (Stitch/v0.dev) to create 22 HTML mockups.
      | Follow DESIGN_INSTRUCTIONS.md. Store in /design-references/.

 16   | Open Claude Chat Opus session. Name: "Maximilian1-A".
      | Upload: FRAMEWORK.md, /design-references/ (batch 01-12)
      | Task: Review first batch of mockups.
      | Collect: DESIGN_REVIEW_BATCH1.md

 17   | Open Claude Chat Opus session. Name: "Maximilian1-B".
      | Upload: FRAMEWORK.md, /design-references/ (batch 13-22),
      |         DESIGN_REVIEW_BATCH1.md
      | Task: Review second batch, produce final review.
      | Collect: DESIGN_REVIEW.md

 18   | MANUAL: Apply corrections from DESIGN_REVIEW.md to mockups.
      | Confirm design freeze.
```

### Phase 3 - Pipeline Design

```
Step  | Action
------|-----------------------------------------------------------------------
 19   | Open Claude Chat Opus session. Name: "Cassander1-A".
      | Upload: FRAMEWORK.md, COMPREHENSIVE_IDEA.md
      | Task: Write prompt for pipeline designer.
      | Collect: PROMPT_PIPELINE_DESIGN.md

 20   | Open Claude Chat Opus session. Name: "Nikolai1-A".
      | Upload: PROMPT_PIPELINE_DESIGN.md, FRAMEWORK.md
      | Task: Design agent structure Phases 0-6.
      | Collect: AGENT_STRUCTURE_DRAFT.md, HANDOFF_NIKOLAI_1A.md

 21   | Open Claude Chat Opus session. Name: "Nikolai1-B".
      | Upload: PROMPT_PIPELINE_DESIGN.md, AGENT_STRUCTURE_DRAFT.md,
      |         HANDOFF_NIKOLAI_1A.md
      | Task: Complete Phases 7-9, summary table, execution protocol.
      | Collect: AGENT_STRUCTURE.md
```

### Phase 4 - Contracts

```
Step  | Action
------|-----------------------------------------------------------------------
 22   | Open Claude Chat Opus session. Name: "Aldric1-A".
      | Upload: FRAMEWORK.md, AGENT_STRUCTURE.md
      | Task: Write prompts for NewsAnalyzer, IPOHunter, PortfolioManager contracts.
      | Collect: PROMPT_CONTRACT_NEWSANALYZER.md,
      |          PROMPT_CONTRACT_IPOHUNTER.md,
      |          PROMPT_CONTRACT_PORTFOLIOMANAGER.md,
      |          CONTRACT_FORMAT_TEMPLATE.md

 23   | Open Claude Chat Opus session. Name: "Aldric1-B".
      | Upload: FRAMEWORK.md, CONTRACT_FORMAT_TEMPLATE.md
      | Task: Write prompts for LLMChatbot, Core, DataCollector, KnowledgeGraph.
      | Collect: PROMPT_CONTRACT_LLMCHATBOT.md,
      |          PROMPT_CONTRACT_CORE.md,
      |          PROMPT_CONTRACT_DATACOLLECTOR.md,
      |          PROMPT_CONTRACT_KNOWLEDGEGRAPH.md

 24   | Open Claude Chat Opus session. Name: "Aldric1-C".
      | Upload: FRAMEWORK.md, CONTRACT_FORMAT_TEMPLATE.md
      | Task: Write PROMPT_PHASE_DIVISION.md, review all prompts.
      | Collect: PROMPT_PHASE_DIVISION.md

 25   | Open Claude Chat Opus session. Name: "Beatrix1-A".
      | Upload: PROMPT_CONTRACT_NEWSANALYZER.md, FRAMEWORK.md
      | Task: NewsAnalyzer backend contract.
      | Collect: CONTRACT_NEWSANALYZER_DRAFT.md

 26   | Open Claude Chat Opus session. Name: "Beatrix1-B".
      | Upload: PROMPT_CONTRACT_NEWSANALYZER.md, CONTRACT_NEWSANALYZER_DRAFT.md
      | Task: NewsAnalyzer frontend contract, merge final.
      | Collect: CONTRACT_NEWSANALYZER.md

 27   | Open Claude Chat Opus session. Name: "Cedric1-A".
      | Upload: PROMPT_CONTRACT_IPOHUNTER.md, FRAMEWORK.md
      | Task: Full IPOHunter contract.
      | Collect: CONTRACT_IPOHUNTER.md

 28   | Open Claude Chat Opus session. Name: "Dominique1-A".
      | Upload: PROMPT_CONTRACT_PORTFOLIOMANAGER.md, FRAMEWORK.md
      | Task: PortfolioManager backend contract.
      | Collect: CONTRACT_PORTFOLIOMANAGER_DRAFT.md

 29   | Open Claude Chat Opus session. Name: "Dominique1-B".
      | Upload: PROMPT_CONTRACT_PORTFOLIOMANAGER.md,
      |         CONTRACT_PORTFOLIOMANAGER_DRAFT.md
      | Task: PortfolioManager frontend contract, merge final.
      | Collect: CONTRACT_PORTFOLIOMANAGER.md

 30   | Open Claude Chat Opus session. Name: "Evangeline1-A".
      | Upload: PROMPT_CONTRACT_LLMCHATBOT.md, FRAMEWORK.md
      | Task: Full LLMChatbot contract.
      | Collect: CONTRACT_LLMCHATBOT.md

 31   | Open Claude Chat Opus session. Name: "Florian1-A".
      | Upload: PROMPT_CONTRACT_CORE.md, FRAMEWORK.md
      | Task: Core backend contract (Auth, Settings, Alerts).
      | Collect: CONTRACT_CORE_DRAFT.md

 32   | Open Claude Chat Opus session. Name: "Florian1-B".
      | Upload: PROMPT_CONTRACT_CORE.md, CONTRACT_CORE_DRAFT.md
      | Task: Notifications, Watchlist, frontend, merge final.
      | Collect: CONTRACT_CORE.md

 33   | Open Claude Chat Opus session. Name: "Gideon1-A".
      | Upload: PROMPT_CONTRACT_DATACOLLECTOR.md, FRAMEWORK.md
      | Task: Full DataCollector contract.
      | Collect: CONTRACT_DATACOLLECTOR.md

 34   | Open Claude Chat Opus session. Name: "Helena1-A".
      | Upload: PROMPT_CONTRACT_KNOWLEDGEGRAPH.md, FRAMEWORK.md
      | Task: Full KnowledgeGraph contract.
      | Collect: CONTRACT_KNOWLEDGEGRAPH.md

 35   | Open Claude Chat Opus session. Name: "Isidore1-A".
      | Upload: PROMPT_PHASE_DIVISION.md, FRAMEWORK.md,
      |         All 7 CONTRACT_*.md files
      | Task: Produce implementation phase division.
      | Collect: PHASE_DIVISION.md
```

### Phase 5 - Prompt Engineering

```
Step  | Action
------|-----------------------------------------------------------------------
 36   | Open Claude Chat Opus session. Name: "Jareth1-A".
      | Upload: FRAMEWORK.md, AGENT_STRUCTURE.md, PHASE_DIVISION.md,
      |         All 7 CONTRACT_*.md files
      | Task: Write meta-format, CLAUDE.md prompt, coding contracts prompt,
      |       Leander's prompt.
      | Collect: IMPL_PROMPT_FORMAT_SPEC.md, PROMPT_CLAUDE_MD.md,
      |          PROMPT_CODING_CONTRACTS.md,
      |          PROMPT_IMPL_ENGINEER_FOUNDATION.md

 37   | Open Claude Chat Opus session. Name: "Jareth1-B".
      | Upload: IMPL_PROMPT_FORMAT_SPEC.md, PHASE_DIVISION.md,
      |         Relevant CONTRACT_*.md files
      | Task: Write Marcellus's and Nathaniel's prompts.
      | Collect: PROMPT_IMPL_ENGINEER_FEATURES.md,
      |          PROMPT_IMPL_ENGINEER_FRONTEND.md

 38   | Open Claude Chat Opus session. Name: "Kieran1-A".
      | Upload: PROMPT_CLAUDE_MD.md, FRAMEWORK.md
      | Task: Write CLAUDE.md.
      | Collect: CLAUDE.md

 39   | Open Claude Chat Opus session. Name: "Kieran1-B".
      | Upload: PROMPT_CODING_CONTRACTS.md, CLAUDE.md,
      |         All 7 CONTRACT_*.md files
      | Task: Write all 7 coding contract files.
      | Collect: contracts/coding/*.coding.md (7 files)

 40   | Open Claude Chat Opus session. Name: "Leander1-A".
      | Upload: PROMPT_IMPL_ENGINEER_FOUNDATION.md,
      |         IMPL_PROMPT_FORMAT_SPEC.md, PHASE_DIVISION.md,
      |         CONTRACT_CORE.md, CONTRACT_DATACOLLECTOR.md, CLAUDE.md
      | Task: Write foundation and database implementation prompts.
      | Collect: IMPL_PROMPT_6A_FOUNDATION.md,
      |          IMPL_PROMPT_6B_DATABASE_AUTH.md

 41   | Open Claude Chat Opus session. Name: "Leander1-B".
      | Upload: IMPL_PROMPT_FORMAT_SPEC.md, PHASE_DIVISION.md,
      |         CONTRACT_DATACOLLECTOR.md, CONTRACT_KNOWLEDGEGRAPH.md,
      |         CLAUDE.md, contracts/coding/data-collector.coding.md
      | Task: Write data collector and NLP implementation prompts.
      | Collect: IMPL_PROMPT_6C_DATACOLLECTOR.md,
      |          IMPL_PROMPT_6D_NLP_PIPELINE.md

 42   | Open Claude Chat Opus session. Name: "Leander1-C".
      | Upload: IMPL_PROMPT_FORMAT_SPEC.md, CONTRACT_KNOWLEDGEGRAPH.md,
      |         CLAUDE.md, contracts/coding/knowledge-graph.coding.md
      | Task: Write Knowledge Graph implementation prompt. Final review.
      | Collect: IMPL_PROMPT_6E_KNOWLEDGE_GRAPH.md

 43   | Open Claude Chat Opus session. Name: "Marcellus1-A".
      | Upload: PROMPT_IMPL_ENGINEER_FEATURES.md,
      |         IMPL_PROMPT_FORMAT_SPEC.md, PHASE_DIVISION.md,
      |         CONTRACT_NEWSANALYZER.md, CONTRACT_PORTFOLIOMANAGER.md,
      |         CLAUDE.md
      | Task: Write News and Portfolio backend implementation prompts.
      | Collect: IMPL_PROMPT_6F_NEWS_BACKEND.md,
      |          IMPL_PROMPT_6G_PORTFOLIO_BACKEND.md

 44   | Open Claude Chat Opus session. Name: "Marcellus1-B".
      | Upload: IMPL_PROMPT_FORMAT_SPEC.md,
      |         CONTRACT_IPOHUNTER.md, CONTRACT_LLMCHATBOT.md, CLAUDE.md
      | Task: Write IPO and Chatbot backend implementation prompts.
      | Collect: IMPL_PROMPT_6H_IPO_BACKEND.md,
      |          IMPL_PROMPT_6I_CHATBOT_BACKEND.md

 45   | Open Claude Chat Opus session. Name: "Nathaniel1-A".
      | Upload: PROMPT_IMPL_ENGINEER_FRONTEND.md,
      |         IMPL_PROMPT_FORMAT_SPEC.md, PHASE_DIVISION.md,
      |         CONTRACT_NEWSANALYZER.md, CLAUDE.md,
      |         /design-references/ (relevant mockups)
      | Task: Write design system and news frontend implementation prompts.
      | Collect: IMPL_PROMPT_6J_DESIGN_SYSTEM.md,
      |          IMPL_PROMPT_6K_NEWS_FRONTEND.md

 46   | Open Claude Chat Opus session. Name: "Nathaniel1-B".
      | Upload: IMPL_PROMPT_FORMAT_SPEC.md,
      |         CONTRACT_PORTFOLIOMANAGER.md, CONTRACT_IPOHUNTER.md,
      |         CONTRACT_LLMCHATBOT.md, CLAUDE.md,
      |         /design-references/ (relevant mockups)
      | Task: Write portfolio, IPO, chatbot frontend implementation prompts.
      | Collect: IMPL_PROMPT_6L_PORTFOLIO_FRONTEND.md,
      |          IMPL_PROMPT_6M_IPO_FRONTEND.md,
      |          IMPL_PROMPT_6N_CHATBOT_FRONTEND.md

 47   | Open Claude Chat Opus session. Name: "Nathaniel1-C".
      | Upload: IMPL_PROMPT_FORMAT_SPEC.md,
      |         CONTRACT_CORE.md, CLAUDE.md,
      |         /design-references/ (relevant mockups)
      | Task: Write core frontend and dashboard implementation prompts.
      | Collect: IMPL_PROMPT_6O_CORE_FRONTEND.md,
      |          IMPL_PROMPT_6P_DASHBOARD_LAYOUT.md
```

### Phase 6 - Implementation

```
Step  | Action
------|-----------------------------------------------------------------------
 48   | MANUAL: Initialize git repository. Place CLAUDE.md in project root.
      | Place contracts/coding/*.coding.md files in project.

 49-50| Open Claude Code Opus sessions. Name: "Octavian1-A", "Octavian1-B".
      | Upload: IMPL_PROMPT_6A_FOUNDATION.md, CLAUDE.md
      | Task: Project scaffolding, configs, health checks.
      | Collect: HANDOFF_OCTAVIAN.md

 51-53| Open Claude Code Opus sessions. Name: "Perseus1-A/B/C".
      | Upload: IMPL_PROMPT_6B_DATABASE_AUTH.md, CLAUDE.md,
      |         contracts/coding/core.coding.md, HANDOFF_OCTAVIAN.md
      | Task: Database migrations, auth system.
      | Collect: HANDOFF_PERSEUS.md

 54-56| Open Claude Code Opus sessions. Name: "Quintus1-A/B/C".
      | Upload: IMPL_PROMPT_6C_DATACOLLECTOR.md, CLAUDE.md,
      |         contracts/coding/data-collector.coding.md, HANDOFF_PERSEUS.md
      | Task: All data collection services.
      | Collect: HANDOFF_QUINTUS.md

 57-59| Open Claude Code Opus sessions. Name: "Roland1-A/B/C".
      | Upload: IMPL_PROMPT_6D_NLP_PIPELINE.md, CLAUDE.md,
      |         contracts/coding/news-analyzer.coding.md, HANDOFF_QUINTUS.md
      | Task: NLP pipeline (preprocessing, NER, sentiment, embeddings).
      | Collect: HANDOFF_ROLAND.md

 60-61| Open Claude Code Opus sessions. Name: "Stellan1-A/B".
      | Upload: IMPL_PROMPT_6E_KNOWLEDGE_GRAPH.md, CLAUDE.md,
      |         contracts/coding/knowledge-graph.coding.md, HANDOFF_ROLAND.md
      | Task: Knowledge Graph engine.
      | Collect: HANDOFF_STELLAN.md

 62-63| Open Claude Code Opus sessions. Name: "Tiberius1-A/B".
      | Upload: IMPL_PROMPT_6F_NEWS_BACKEND.md, CLAUDE.md,
      |         contracts/coding/news-analyzer.coding.md, HANDOFF_STELLAN.md
      | Task: NewsAnalyzer backend.
      | Collect: HANDOFF_TIBERIUS.md

 64-65| Open Claude Code Opus sessions. Name: "Valentin1-A/B".
      | Upload: IMPL_PROMPT_6G_PORTFOLIO_BACKEND.md, CLAUDE.md,
      |         contracts/coding/portfolio-manager.coding.md,
      |         HANDOFF_TIBERIUS.md
      | Task: PortfolioManager backend.
      | Collect: HANDOFF_VALENTIN.md

 66-67| Open Claude Code Opus sessions. Name: "Xander1-A/B".
      | Upload: IMPL_PROMPT_6H_IPO_BACKEND.md, CLAUDE.md,
      |         contracts/coding/ipo-hunter.coding.md, HANDOFF_VALENTIN.md
      | Task: IPOHunter backend.
      | Collect: HANDOFF_XANDER.md

 68-69| Open Claude Code Opus sessions. Name: "Zenon1-A/B".
      | Upload: IMPL_PROMPT_6I_CHATBOT_BACKEND.md, CLAUDE.md,
      |         contracts/coding/llm-chatbot.coding.md, HANDOFF_XANDER.md
      | Task: LLM Chatbot backend.
      | Collect: HANDOFF_ZENON.md

 70-72| Open Claude Code Opus sessions. Name: "Alaric1-A/B/C".
      | Upload: IMPL_PROMPT_6J_DESIGN_SYSTEM.md, CLAUDE.md,
      |         /design-references/*.html, HANDOFF_ZENON.md
      | Task: Design system and all 10 shared components.
      | Collect: HANDOFF_ALARIC.md

 73-74| Open Claude Code Opus sessions. Name: "Bramwell1-A/B".
      | Upload: IMPL_PROMPT_6K_NEWS_FRONTEND.md, CLAUDE.md,
      |         contracts/coding/news-analyzer.coding.md,
      |         /design-references/ (news mockups), HANDOFF_ALARIC.md
      | Task: News frontend pages.
      | Collect: HANDOFF_BRAMWELL.md

 75-76| Open Claude Code Opus sessions. Name: "Calloway1-A/B".
      | Upload: IMPL_PROMPT_6L_PORTFOLIO_FRONTEND.md, CLAUDE.md,
      |         contracts/coding/portfolio-manager.coding.md,
      |         /design-references/ (portfolio mockups), HANDOFF_BRAMWELL.md
      | Task: Portfolio frontend pages.
      | Collect: HANDOFF_CALLOWAY.md

 77-78| Open Claude Code Opus sessions. Name: "Demetrius1-A/B".
      | Upload: IMPL_PROMPT_6M_IPO_FRONTEND.md, CLAUDE.md,
      |         contracts/coding/ipo-hunter.coding.md,
      |         /design-references/ (IPO mockups), HANDOFF_CALLOWAY.md
      | Task: IPO frontend pages.
      | Collect: HANDOFF_DEMETRIUS.md

 79-80| Open Claude Code Opus sessions. Name: "Edmund1-A/B".
      | Upload: IMPL_PROMPT_6N_CHATBOT_FRONTEND.md, CLAUDE.md,
      |         contracts/coding/llm-chatbot.coding.md,
      |         /design-references/ (chat mockup), HANDOFF_DEMETRIUS.md
      | Task: Chat frontend.
      | Collect: HANDOFF_EDMUND.md

 81-82| Open Claude Code Opus sessions. Name: "Fenwick1-A/B".
      | Upload: IMPL_PROMPT_6O_CORE_FRONTEND.md, CLAUDE.md,
      |         contracts/coding/core.coding.md,
      |         /design-references/ (core mockups), HANDOFF_EDMUND.md
      | Task: Watchlist, Alerts, Settings, Notifications frontend.
      | Collect: HANDOFF_FENWICK.md

 83-84| Open Claude Code Opus sessions. Name: "Gareth1-A/B".
      | Upload: IMPL_PROMPT_6P_DASHBOARD_LAYOUT.md, CLAUDE.md,
      |         /design-references/ (dashboard mockup), HANDOFF_FENWICK.md
      | Task: Dashboard page, app layout, routing, SSE manager.
      | Collect: HANDOFF_GARETH.md
```

### Phase 7 - Integration & QA

```
Step  | Action
------|-----------------------------------------------------------------------
 85   | Open Claude Chat Opus session. Name: "Hadrian1-A".
      | Upload: FRAMEWORK.md, CLAUDE.md, HANDOFF_GARETH.md, PHASE_DIVISION.md
      | Task: Write all 4 QA phase prompts.
      | Collect: PROMPT_INTEGRATION_TEST.md, PROMPT_E2E_QA.md,
      |          PROMPT_SECURITY_AUDIT.md, PROMPT_BUGFIX.md

 86-88| Open Claude Code Opus sessions. Name: "Ignatius1-A/B/C".
      | Upload: PROMPT_INTEGRATION_TEST.md, CLAUDE.md, HANDOFF_GARETH.md
      | Task: Cross-module integration tests, fix failures.
      | Collect: INTEGRATION_REPORT.md, HANDOFF_IGNATIUS.md

 89-91| Open Claude Code Opus sessions. Name: "Julian1-A/B/C".
      | Upload: PROMPT_E2E_QA.md, CLAUDE.md, HANDOFF_IGNATIUS.md
      | Task: E2E tests (Playwright), performance tests.
      | Collect: QA_REPORT.md, HANDOFF_JULIAN.md

 92-93| Open Claude Code Opus sessions. Name: "Klaus1-A/B".
      | Upload: PROMPT_SECURITY_AUDIT.md, CLAUDE.md, HANDOFF_JULIAN.md
      | Task: Security audit and fixes.
      | Collect: SECURITY_AUDIT.md, HANDOFF_KLAUS.md

 94-96| Open Claude Code Opus sessions. Name: "Leopold1-A/B/C".
      | Upload: PROMPT_BUGFIX.md, CLAUDE.md, INTEGRATION_REPORT.md,
      |         QA_REPORT.md, SECURITY_AUDIT.md, HANDOFF_KLAUS.md
      | Task: Bug fixes, polish, final regression.
      | Collect: HANDOFF_LEOPOLD.md
```

### Phase 8 - Deployment & Documentation

```
Step  | Action
------|-----------------------------------------------------------------------
 97   | Open Claude Chat Opus session. Name: "Montgomery1-A".
      | Upload: FRAMEWORK.md, HANDOFF_LEOPOLD.md, CLAUDE.md
      | Task: Write deployment and documentation prompts.
      | Collect: PROMPT_DEPLOYMENT.md, PROMPT_DOCUMENTATION.md

 98-99| Open Claude Code Opus sessions. Name: "Percival1-A/B".
      | Upload: PROMPT_DEPLOYMENT.md, CLAUDE.md, HANDOFF_LEOPOLD.md
      | Task: Deploy to Vercel + Railway + Supabase. CI/CD setup.
      | Collect: DEPLOYMENT_GUIDE.md, HANDOFF_PERCIVAL.md

100-  | Open Claude Code Opus sessions. Name: "Reginald1-A/B".
 101  | Upload: PROMPT_DOCUMENTATION.md, CLAUDE.md, HANDOFF_PERCIVAL.md,
      |         FRAMEWORK.md
      | Task: Write all project documentation.
      | Collect: README.md, docs/API.md, docs/ARCHITECTURE.md,
      |          docs/DEVELOPER_GUIDE.md, docs/USER_MANUAL.md,
      |          HANDOFF_REGINALD.md
```

### Phase 9 - Validation & Handover

```
Step  | Action
------|-----------------------------------------------------------------------
 102  | Open Claude Chat Opus session. Name: "Siegfried1-A".
      | Upload: FRAMEWORK.md, AGENT_STRUCTURE.md, HANDOFF_REGINALD.md
      | Task: Write final validation prompt.
      | Collect: PROMPT_FINAL_VALIDATION.md

103-  | Open Claude Code Opus sessions. Name: "Theodosius1-A/B".
 104  | Upload: PROMPT_FINAL_VALIDATION.md, FRAMEWORK.md,
      |         DEPLOYMENT_GUIDE.md
      | Task: Execute validation against all framework requirements.
      | Collect: VALIDATION_REPORT.md

 105  | Open Claude Chat Opus session. Name: "Ulysses1-A".
      | Upload: VALIDATION_REPORT.md, INTEGRATION_REPORT.md, QA_REPORT.md,
      |         SECURITY_AUDIT.md, DEPLOYMENT_GUIDE.md, AGENT_STRUCTURE.md
      | Task: Compile final project report.
      | Collect: FINAL_PROJECT_REPORT.md

 106  | PIPELINE COMPLETE. All artifacts collected. Application deployed.
```

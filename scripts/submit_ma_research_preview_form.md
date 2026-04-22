# Managed Agents research-preview form: Day-1 submission reminder

**Status:** reminder-doc only. This file does NOT auto-submit. A human (Ghaisan) submits the form.
**Authoritative source:** `docs/phase_0/MANAGED_AGENTS_RESEARCH.md` Section F.
**Owner agent:** Heracles (Builder Worker, MA Integration Engineer, P2).
**Do by:** Day 1 of the hackathon (Rabu 22 April 2026). Approval typically lands within days and is not guaranteed before the 27 April submission; submit early for optionality, not critical-path blocking.

---

## 1. Why submit

The Managed Agents research preview gates the following features behind an access form. All of them are optional for the NERIUM hackathon build because Heracles uses only GA surface area (POST /v1/sessions, SSE event stream, Files API, Console trace). Submitting early keeps the door open for post-approval upgrades, especially if any of the below become judging differentiators:

| Feature | Useful for NERIUM if approved | Heracles ADR cross-ref |
|---|---|---|
| `callable_agents` (multi-agent) | Would let `nerium-integration-engineer` sub-delegate tasks inside a single MA session, more directly mirroring NERIUM Builder's recursive thesis. | ADR-005 keeps strict one-level for hackathon reliability. |
| `outcomes` | Defines success criteria the harness iterates against; aligns with judge narrative framing ("outcome-driven agent"). | Not used in P2 implementation; available to add if approved in time and demo rehearsal confirms stable. |
| `memory` | Cross-session 8 stores at 100 KB each. Useful for Builder pipelines that resume across days. | Out of scope for single-session demo; post-hackathon only. |
| Additional advisor-tool paths | Relevant if Heracles ever layers an Opus advisor on a Sonnet executor inside MA; currently not in hackathon scope. | N/A. |

Non-approval does not block the hackathon build: see `docs/heracles.decisions.md` ADR-005 for the strict-one-level fallback plan.

## 2. Where to submit

- **Form URL:** `https://claude.com/form/claude-managed-agents`
- **Alternate entry:** Anthropic Console, Managed Agents section, "Request research-preview access" banner link (same form).
- **Expected response path:** email confirmation to the Anthropic account email, then follow-up with per-feature approval status.

## 3. Prepared answers for the likely fields

Fields below are based on public MA research-preview references circa 2026-04-22. Adjust as the live form changes.

- **Organization name:** `NERIUM (Ghaisan, solo hackathon participant)`.
- **Organization stage:** `Prototype / Hackathon submission`.
- **Anthropic Org ID:** copy from Console settings.
- **Primary use case (2 to 4 sentences):**
  > "NERIUM is a meta-orchestrator that spawns agents that spawn agents. We use Managed Agents as the Anthropic-native heavy-lift execution lane for one specialist role ('integration engineer') inside our Builder pipeline. We are requesting research-preview access to evaluate callable_agents for multi-level delegation aligned with our recursive Builder thesis, and outcomes for outcome-driven autonomous runs on stage during our demo."
- **Which research-preview features do you need? (checkboxes):**
  - `callable_agents` (multi-agent): YES
  - `outcomes`: YES (optional, evaluate if stable)
  - `memory`: NO for hackathon (post-hackathon follow-up)
- **Expected concurrent sessions during preview:** `up to 5` (one live demo MA session plus four development sessions).
- **Expected monthly spend:** `below $150 for hackathon window, below $1000 post-hackathon if features are production-useful`.
- **Target launch date:** `Built-with-Opus-4.7 Hackathon demo 2026-04-26`.
- **Region of operation:** `Southeast Asia (Indonesia)`.
- **Contact email:** Ghaisan's Anthropic-registered email.
- **GitHub link (optional):** `https://github.com/Finerium/nerium`.

## 4. Pre-submit checklist

- [ ] Ghaisan logged into the Anthropic Console and Org ID is readable.
- [ ] `_meta/NarasiGhaisan.md` Section 2 recursive thesis re-read; the "meta-orchestration of heterogeneous execution substrates" framing anchors the primary use case answer above.
- [ ] `docs/phase_0/MANAGED_AGENTS_RESEARCH.md` Section E3 "Sharpest NERIUM angle" ready as the 2-4 sentence elevator.
- [ ] GitHub repo Finerium/nerium visibility is public by submission time (MIT license surface per CLAUDE.md Submission section).
- [ ] Decision on whether to request `memory` in this submission; default is NO for hackathon scope.
- [ ] Confirmed the hard-lock: Heracles does not architect around approval. Submission is for optionality only.

## 5. After submit

- Capture the confirmation email subject plus timestamp.
- Log the outcome to `_meta/orchestration_log/day_{N}.md` Ananke daily log (Ananke spawns nightly).
- If approved before Day 4: notify V3 orchestrator; V3 decides whether Heracles adopts `callable_agents` or `outcomes` in the remaining polish window. Default: keep current strict one-level implementation stable for demo reliability per ADR-005.
- If denied or no response by Day 5: no action; current GA-only implementation ships unchanged.

## 6. Anti-scope reminders

- This file is a REMINDER. Do NOT add curl commands, auto-submit scripts, or credentials handling code. The Heracles prompt hard-constraint mandates reminder-doc only.
- No em dash, no emoji anywhere in this file per CLAUDE.md anti-patterns.
- If the form fields shift, update this file rather than scripting around the change. The reminder needs to stay accurate for the human submitter.

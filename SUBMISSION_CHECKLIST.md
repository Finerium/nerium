# NERIUM Submission Checklist

Hard deadline: Senin 27 April 2026 07:00 WIB (April 26 8:00 PM EDT).

Target submission window: Senin 27 April 2026 06:00 WIB, one hour safety buffer.

Last automated agent ship: Kalypso W4 final, see SHA in `git log -1`.

This checklist enumerates every manual task remaining for Ghaisan. The repository state is submission-ready as of the Kalypso W4 final commit. Three manual tasks separate that state from the submitted form.

---

## 1. Demo video

| Item | Status | Notes |
|---|---|---|
| YouTube unlisted upload | DONE | URL: https://youtu.be/DJQXitRa1VE |
| Embed in landing page hero | DONE | Kalypso Phase 1 injected iframe at `src/components/landing/HeroSection.tsx`, served via Vercel auto-rebuild post Phase 5 commit |
| README demo section | DONE | Section "Demo" links direct to YouTube + embedded above the fold |
| Duration verified under 3:00 | PENDING Ghaisan | Stitched via Remotion at `~/Documents/cerebralDemo-Video/`. Target ~124 sec per V7 brief 2-segment Remotion stitch |
| Voiceover and music attribution | DONE | Voiceover via Gemini 2.5 with bundled cyberpunk synthwave background music. Acceptable per hackathon multi-vendor media rules |

---

## 2. Pre-submission manual tasks for Ghaisan

### Task A. Termly legal template paste (10 minutes)

Three legal page placeholders need final Termly template paste:

- [ ] `app/legal/terms/page.tsx` (Terms of Service template)
- [ ] `app/legal/privacy/page.tsx` (Privacy Policy template)
- [ ] `app/legal/credits/page.tsx` (Credits/Attribution template)

Each currently shows an honest "Draft, pending Termly template paste" banner per honest-claim discipline. The banner is intentional and protects the submission integrity until real legal text lands. Replace the body content within the existing `<section className="nl-legal-section">` blocks; preserve the wrapper structure and the back-to-landing link.

### Task B. Cerebral Valley submission form fill (5 to 7 minutes)

Form copy is staged at [`_meta/submission/cerebral_valley_submission_form_fill.md`](./_meta/submission/cerebral_valley_submission_form_fill.md). Each field is a copy-paste block.

Fields:

| Field | Source |
|---|---|
| 1. Team Name | static "Finerium" |
| 2. Team Members | already populated, skip |
| 3. Project Name | static "NERIUM" |
| 4. Hackathon Problem Statement | "Build for what next" |
| 5. Project Description | full block (~370 words) |
| 6. Public GitHub Repository | https://github.com/Finerium/nerium |
| 7. Demo Video | https://youtu.be/DJQXitRa1VE |
| 8. Thoughts on Opus 4.7 | full block |
| 9. Claude Managed Agents | full block (mirrors README Section "Managed Agents discipline") |

Total wallclock to fill: 5 to 7 min including paste plus verify plus submit.

Click "Submit Project" button at bottom.

### Task C. Confirm GitHub repo is public

- [ ] Verify [github.com/Finerium/nerium](https://github.com/Finerium/nerium) returns 200 in incognito browser
- [ ] Verify LICENSE renders MIT text
- [ ] Verify README renders cleanly (Github markdown parser tolerates the structure)
- [ ] Verify default branch is `main` and reflects the latest Kalypso W4 final SHA

---

## 3. Pre-submission verification (already DONE by Kalypso Phase 0 + parallel terminals)

| Item | Verifier | Evidence |
|---|---|---|
| Production deploy 200 OK at /, /play, /marketplace, /builder, /pricing | T-NEMEA Phase 4 re-shoot | `docs/qa/nemea_w4_phase4_visual.md` Section 7.2 |
| Lighthouse PASS / 94, /play 72 | T-NEMEA Phase 2 | `docs/qa/nemea_w4_phase2_lighthouse.md` |
| Backend pytest 1246/1254 GREEN | T-NEMEA Phase 3 | `docs/qa/nemea_w4_phase3_e2e.md` Section 1 |
| Visual regressions 3 fixed | T-REGR | `docs/qa/regression_fix_smoke.md` |
| Asset rescue 96 served via /assets/ai/ | T-ASSET | `docs/qa/asset_diagnostic_report.md` Option A3 |
| World transitions 13 scenes wired | T-WORLD | `docs/qa/world_transition_audit.md` |
| Bug hunt sweep zero critical zero high | Kalypso Phase 0 | `docs/qa/kalypso_bug_hunt_report.md` |
| Em dash zero across submission surfaces | Kalypso Phase 0 | python3 grep verified |
| Emoji zero across submission surfaces | Kalypso Phase 0 | python3 grep verified |
| YouTube embed injected at landing hero | Kalypso Phase 1 | `src/components/landing/HeroSection.tsx` updated |
| README harmonized with form copy | Kalypso Phase 2 | README sections mirror Field 5 + Field 9 |
| 100-200 word summary final 193 words | Kalypso Phase 2 | `docs/submission/100_to_200_word_summary.md` |
| MIT LICENSE present at repo root | Phase 0 | `LICENSE` Copyright 2026 Ghaisan Khoirul Badruzaman |

---

## 4. Post-submission monitoring

After clicking Submit Project on the Cerebral Valley form:

- [ ] Verify confirmation email received at submission email address
- [ ] Take screenshot of submission confirmation page (backup evidence)
- [ ] Do NOT push more commits to `origin/main` until judge clone window passes (April 28 12:00 PM ET / April 29 ~02:00 WIB)
- [ ] Discord post in `nerium0leander` channel announcing submission link
- [ ] Optional sleep + recovery

If a judge surface defect surfaces during the clone window, ferry to V7 with severity classification rather than auto-push.

---

## 5. Repository state at submission

Working tree at Kalypso Phase 5 atomic commit:

- 4 untracked artifacts staged and committed:
  - `_meta/orchestration_log/v6_helios_to_submission.md`
  - `_meta/orchestration_log/v7_parallel_terminal_ship.md` (V7 era authored Kalypso Phase 6)
  - `_meta/orchestration_log/INDEX.md` (V7 era authored Kalypso Phase 6)
  - `_meta/submission/cerebral_valley_submission_form_fill.md`
- 5 orchestration log files translated from Indonesian to English (V1 through V5) per Kalypso Phase 6
- `tests/__screenshots__/apollo_marketplace_bazaar_s5.png` and `apollo_oasis_s5.png` deltas committed
- Untracked `apollo_village_local_smoke.png` and `apollo_village_local_smoke_t5sec.png` either added to `.gitignore` or moved to `tests/__screenshots__/`

Final atomic commit message:

```
feat(submission): Kalypso W4 final landing + README + submission checklist + YouTube URL inject + orchestration log English translation + V6 + V7 action log + INDEX + form copy staged
```

---

## 6. Manual task summary

Three manual tasks remain for Ghaisan after Kalypso W4 ship:

1. Termly paste 3 legal pages (10 min)
2. Cerebral Valley form submit using staged form copy (5 to 7 min)
3. Optional post-submit screenshot + Discord announcement

NERIUM hackathon project finalized as of Kalypso W4 final commit.

End of SUBMISSION_CHECKLIST.md.

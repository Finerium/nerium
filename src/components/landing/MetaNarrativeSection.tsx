'use client';

//
// src/components/landing/MetaNarrativeSection.tsx
//
// Three-in-one narrative section, aesthetic-fidelity port of Claude Design
// mockup _skills_staging/claude_design_landing.html. Contains three scroll
// anchors required by the scene-swap system:
//
//   1. #nl-what  - section_02 "what is it, actually" three-cell grid
//   2. #nl-pain  - section_02.5 dual-column orchestrator exhaustion
//   3. #nl-manifesto - section_04 manifesto quote + origin log + counter
//                       rollup + "what this replaces" list
//
// The single file hosts three landing section ids because the Kalypso spec
// enumerates four section components (Hero, MetaNarrative, Pillars, CTA) and
// the mockup has six logical sections. The narrative trio lives together
// here because they all carry the same voice thread (pain acknowledgement
// leading to meta-narrative). Pillars live in a sibling component. Nav
// anchors in LandingNav link here.
//
// Client Component because of IntersectionObserver scroll-reveal and counter
// rollup rAF loop. prefers-reduced-motion snaps every reveal to final state
// and jumps counters to their target value without animation.
//
// Voice copy. Every string below is ported verbatim from the mockup after
// a review against NarasiGhaisan anti-patterns (no em dash, no emoji,
// honest-claim, casual dignified). The manifesto quote is locked verbatim
// per CLAUDE.md Meta-narrative section.
//

import { useEffect, useRef } from 'react';

interface CounterSpec {
  target: number;
  pad: number;
  label: string;
}

const COUNTERS: CounterSpec[] = [
  { target: 47, pad: 2, label: 'agents' },
  { target: 9, pad: 2, label: 'phases' },
  { target: 1, pad: 2, label: 'hackathon' },
  { target: 0, pad: 2, label: 'times again' },
];

const REPLACES: Array<{ n: string; striked: string; rest: string; emphasized?: string }> = [
  {
    n: '01',
    striked: 'The 40 page handoff document',
    rest:
      ' you rewrite every time the orchestrator session compacts and a new agent has to relearn the codebase from first principles.',
  },
  {
    n: '02',
    striked: 'The spreadsheet',
    rest:
      ' tracking which agent session produced which file, which you maintain by hand, which is always one commit out of date.',
  },
  {
    n: '03',
    striked: 'The prayer',
    rest: ' before every ',
    emphasized: 'git merge',
  },
  {
    n: '04',
    striked: 'The 1am moment',
    rest:
      ' when the orchestrator asks, genuinely, "wait, what codebase was I working in," and you close your laptop and walk outside.',
  },
  {
    n: '05',
    striked: 'The 47 item self-check checklist',
    rest:
      ' you copy-paste into every agent prompt because you have learned, through pain, that none of them read the one you pasted last time.',
  },
];

export function MetaNarrativeSection() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ----- reveal observer -----
    const reveals = Array.from(root.querySelectorAll<HTMLElement>('.nl-reveal'));
    const manifestoQuote = root.querySelector<HTMLElement>('.nl-mani-quote');
    const counters = Array.from(root.querySelectorAll<HTMLElement>('.nl-count .nl-n'));

    if (reduced) {
      reveals.forEach((el) => el.classList.add('in'));
      if (manifestoQuote) manifestoQuote.classList.add('in');
      counters.forEach((el) => {
        const target = parseInt(el.dataset.count ?? '0', 10);
        const pad = (el.dataset.count ?? '0').length;
        el.textContent = String(target).padStart(pad, '0');
      });
      return;
    }

    const revealIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            revealIO.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    reveals.forEach((el) => revealIO.observe(el));

    let manifestoIO: IntersectionObserver | null = null;
    if (manifestoQuote) {
      manifestoIO = new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              manifestoQuote.classList.add('in');
              obs.disconnect();
            }
          });
        },
        { threshold: 0.35 }
      );
      manifestoIO.observe(manifestoQuote);
    }

    // ----- counter rollup -----
    const rollCounter = (el: HTMLElement) => {
      const target = parseInt(el.dataset.count ?? '0', 10);
      const pad = (el.dataset.count ?? '0').length;
      if (target === 0) {
        el.textContent = String(target).padStart(pad, '0');
        return;
      }
      const duration = 1100 + target * 8;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const easeOut = 1 - Math.pow(1 - t, 3);
        const val = Math.round(easeOut * target);
        el.textContent = String(val).padStart(pad, '0');
        if (t < 1) requestAnimationFrame(step);
        else el.textContent = String(target).padStart(pad, '0');
      };
      requestAnimationFrame(step);
    };

    let counterIO: IntersectionObserver | null = null;
    const counterRow = root.querySelector<HTMLElement>('.nl-count');
    if (counterRow) {
      counterIO = new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              counterRow.querySelectorAll<HTMLElement>('.nl-n').forEach((n, i) => {
                setTimeout(() => rollCounter(n), i * 140);
              });
              obs.disconnect();
            }
          });
        },
        { threshold: 0.4 }
      );
      counterIO.observe(counterRow);
    }

    return () => {
      revealIO.disconnect();
      if (manifestoIO) manifestoIO.disconnect();
      if (counterIO) counterIO.disconnect();
    };
  }, []);

  return (
    <div ref={rootRef}>
      {/* ==================== WHAT IS ==================== */}
      <section className="nl-section" id="nl-what" aria-label="What NERIUM actually is">
        <div className="nl-what nl-reveal">
          <div className="nl-eyebrow">section_02 // what is it, actually</div>
          <h2 className="nl-section-title">
            Prompts as quests. Agents as NPCs. Builds as cinematics.
          </h2>

          <div className="nl-what-grid">
            <div className="nl-what-cell">
              <span className="nl-tag">what_you_see</span>
              <span className="nl-kicker">A game.</span>
              <h3>A pixel art RPG in your browser</h3>
              <p>
                You wander a tiled overworld. You accept quests from oddly
                articulate NPCs. Fanfare plays when something ships.
              </p>
            </div>
            <div className="nl-what-cell heat">
              <span className="nl-tag">what_it_is</span>
              <span className="nl-kicker">A builder.</span>
              <h3>A 47-agent orchestrator, disguised</h3>
              <p>
                Every quest is a real pipeline step. Every NPC is a specialist
                agent. Every cinematic is a production artifact shipping to
                main.
              </p>
            </div>
            <div className="nl-what-cell">
              <span className="nl-tag">what_it_replaces</span>
              <span className="nl-kicker">A spreadsheet.</span>
              <h3>The manual AI workflow you hate</h3>
              <p>
                The one with the compacting incidents, the handoff docs, the
                2am context loss. Collapsed into something you would actually
                do on a Saturday.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== PAIN ==================== */}
      <section className="nl-section" id="nl-pain" aria-label="Why NERIUM has to exist">
        <div className="nl-pain">
          <div className="nl-head nl-reveal">
            <div className="nl-eyebrow">section_02.5 // why this has to exist</div>
            <h2 className="nl-title-mono">
              The meta-orchestrator is a person right now.{' '}
              <em>That person is exhausted.</em>
            </h2>
          </div>

          <div className="nl-cols nl-reveal">
            <div className="nl-col">
              <span className="nl-lbl">if you have never done this</span>
              <h3>
                Here is what "orchestrating AI agents manually" actually looks
                like.
              </h3>
              <p>
                You do not write one prompt. You run <b>forty-seven</b> of
                them, in sequence, across nine phases. Each one has its own
                handoff document. Each one produces files another agent has to
                read, then summarize, then forget.
              </p>
              <p>
                Every few hours the session runs out of memory, "compacts,"
                and your agent wakes up with a fresh brain and a polite
                apology. You re-explain the entire project. You watch it
                rediscover the codebase.
              </p>
              <p>
                It is 2am. You are the only person who knows which agent
                produced which file. That knowledge lives nowhere but in your
                head, and your head is starting to compact too.
              </p>
            </div>

            <div className="nl-col">
              <span className="nl-lbl">if you have done this</span>
              <h3>A note, from one orchestrator to another.</h3>
              <p>
                You know the feeling. The <em>compacting incident</em> at
                phase six. The Google Doc of prompts that grew to forty pages
                because every agent needed the same preamble and you were too
                tired to refactor.
              </p>
              <p>
                The dread before every handoff. The prayer before{' '}
                <strong>git merge</strong>. The moment an agent asks, kindly,
                "which codebase am I working in again," and you realize the
                last four hours are salvage work.
              </p>
              <p>
                We built this for you. Not because we read about the pain.
                Because we lived it, logged it, and we are tired of it too.
              </p>
            </div>
          </div>

          <div className="nl-resolve nl-reveal">
            <div className="nl-bigline">
              NERIUM is the game <em>that eats that workflow.</em>
            </div>
            <div className="nl-mark">&gt;&gt;&gt;</div>
          </div>
        </div>
      </section>

      {/* ==================== MANIFESTO ==================== */}
      <section className="nl-section" id="nl-manifesto" aria-label="NERIUM manifesto">
        <div className="nl-manifesto">
          <div className="nl-reveal">
            <div className="nl-eyebrow">section_04 // the thesis</div>
          </div>
          <blockquote className="nl-mani-quote">
            <span className="nl-hl">NERIUM built itself</span> by running the
            manual workflow it automates, one last time, for this hackathon.
          </blockquote>

          <div className="nl-story nl-reveal">
            <div className="nl-label">
              origin /<br />log
            </div>
            <div>
              <p>
                Once, on another project, a person ran a{' '}
                <b>47 agent, 9 phase pipeline</b> by hand. They lived every
                handoff. Every compacting incident. Every 3am context swap
                where an agent politely asked what codebase it was working in.
              </p>
              <p>
                This landing page, the Builder, the Marketplace, the whole
                stack, was produced by running that exact pipeline one more
                time, on purpose, so the record would be honest.
              </p>
              <p>
                After this, the pipeline collapses into a quest. You will
                never have to orchestrate it yourself. That is the whole
                pitch. <b>The meta-orchestrator is a game.</b>
              </p>
            </div>
          </div>

          <div className="nl-count nl-reveal">
            {COUNTERS.map((c) => (
              <div key={c.label}>
                <span
                  className="nl-n"
                  data-count={String(c.target).padStart(c.pad, '0')}
                >
                  {String(0).padStart(c.pad, '0')}
                </span>
                <div className="nl-l">{c.label}</div>
              </div>
            ))}
          </div>

          <div className="nl-replaces nl-reveal">
            <div className="nl-eyebrow">section_04.1 // what this replaces, specifically</div>
            <h3 className="nl-rep-title">
              Each of these is a real artifact. Each of these goes away.
            </h3>
            <ul className="nl-replist">
              {REPLACES.map((r) => (
                <li key={r.n} data-n={r.n}>
                  <span className="nl-strike">{r.striked}</span>
                  {r.rest}
                  {r.emphasized ? (
                    <>
                      <em>{r.emphasized}</em>{' '}
                      when six parallel agents committed to the same worktree
                      and you have no idea which one understood the contract.
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="nl-closer">
              All of that collapses into{' '}
              <em>a quest you finish in an afternoon.</em>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

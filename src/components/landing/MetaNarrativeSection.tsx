'use client';

//
// src/components/landing/MetaNarrativeSection.tsx
//
// Verbatim meta-narrative section per CLAUDE.md "Meta-narrative" section and
// RV_PLAN.md Section 0 enhancement. The exact frame string is preserved as a
// top-level heading element. Expand in 2 short paragraphs reference the
// 47-agent 9-phase 106-step Investment AI IDX blueprint that Ghaisan manually
// lived (per NarasiGhaisan Section 20 origin credential pattern), then tie
// the hackathon submission itself to that same pattern one more time.
//
// Voice register: NarasiGhaisan Section 13 brevity, Section 23 confident but
// not arrogant. Founder voice, first person acceptable in README but landing
// page stays third person for public surface.
//
// Scroll-reveal via Framer Motion whileInView per RV.5 "3 scroll-reveal
// section" direction. No 3D, no WebGL, no em dash, no emoji.
//

import { motion, useReducedMotion } from 'framer-motion';

export function MetaNarrativeSection() {
  const reduceMotion = useReducedMotion();

  const revealProps = reduceMotion
    ? { initial: {}, whileInView: {}, viewport: {}, transition: {} }
    : {
        initial: { opacity: 0, y: 30 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.3 },
        transition: { duration: 0.7, ease: 'easeOut' as const },
      };

  return (
    <section
      id="meta-narrative"
      aria-label="NERIUM meta-narrative"
      className="relative w-full bg-[oklch(0.08_0.02_270)] px-6 py-24 text-foreground sm:py-32"
    >
      <div className="mx-auto max-w-4xl">
        <motion.p
          {...revealProps}
          className="mb-4 font-mono text-sm uppercase tracking-[0.3em] text-primary"
        >
          Meta-narrative
        </motion.p>

        <motion.h2
          {...revealProps}
          className="font-serif text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl md:text-5xl"
        >
          NERIUM built itself by running the manual workflow it automates, one
          last time.
        </motion.h2>

        <motion.div
          {...revealProps}
          className="mt-10 space-y-6 text-lg leading-relaxed text-muted"
        >
          <p>
            For an earlier project, Investment AI IDX, Ghaisan manually lived a
            47-agent, 9-phase, 106-step orchestration pipeline. Every handoff,
            every dependency, every failure mode. One human in the middle of
            the loop, hand-ferrying messages between specialists.
          </p>

          <p>
            This hackathon submission is the same pattern, one more time. An
            orchestrator in chat. A contract authority. A prompt author. A
            dozen Workers running in parallel with dangerously-skip-permissions
            on. The whole stack that NERIUM Builder is designed to replace.
          </p>

          <p className="text-foreground">
            The product&apos;s origin story is the product&apos;s pitch.
            Builder collapses the manual meta-orchestration into a single
            conversational interface. The workflow that built NERIUM is
            literally what NERIUM replaces.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

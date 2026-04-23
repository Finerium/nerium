'use client';

//
// src/components/landing/CTASection.tsx
//
// Final CTA block per M2 Section 4.8 Kalypso output spec. Primary "Play the
// demo" to /play, secondary "View source" to GitHub, Discord handle
// nerium0leander anchored in NarasiGhaisan Section 14 (V1 handoff Section
// 3.12 confirmed).
//
// No em dash, no emoji. MIT license reference per V2 lock, OSS mandate per
// CLAUDE.md submission section.
//

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';

export function CTASection() {
  const reduceMotion = useReducedMotion();

  const revealProps = reduceMotion
    ? { initial: {}, whileInView: {}, viewport: {}, transition: {} }
    : {
        initial: { opacity: 0, y: 24 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.3 },
        transition: { duration: 0.6, ease: 'easeOut' as const },
      };

  return (
    <section
      id="cta"
      aria-label="NERIUM calls to action"
      className="w-full bg-[oklch(0.09_0.02_270)] px-6 py-24 text-foreground sm:py-32"
    >
      <div className="mx-auto max-w-4xl text-center">
        <motion.p
          {...revealProps}
          className="mb-4 font-mono text-sm uppercase tracking-[0.3em] text-primary"
        >
          Try it
        </motion.p>

        <motion.h2
          {...revealProps}
          className="font-serif text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl md:text-5xl"
        >
          Play the vertical slice in your browser.
        </motion.h2>

        <motion.p
          {...revealProps}
          className="mt-6 text-lg leading-relaxed text-muted"
        >
          Open source from day one. MIT licensed. The repo is the demo; the
          demo is the repo.
        </motion.p>

        <motion.div
          {...revealProps}
          className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <Link
            href="/play"
            prefetch={false}
            className="inline-flex items-center justify-center rounded-pill bg-primary px-8 py-3 font-semibold text-background transition-all duration-150 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background motion-reduce:transition-none"
          >
            Play the demo
          </Link>
          <a
            href="https://github.com/Finerium/nerium"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-pill border border-border bg-transparent px-8 py-3 font-semibold text-foreground transition-colors duration-150 hover:border-primary hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background motion-reduce:transition-none"
          >
            View source
          </a>
        </motion.div>

        <motion.dl
          {...revealProps}
          className="mt-16 grid grid-cols-1 gap-8 text-left sm:grid-cols-3"
        >
          <div className="rounded-lg border border-border bg-[oklch(0.11_0.02_270)] p-5">
            <dt className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">
              Repo
            </dt>
            <dd className="font-mono text-sm text-foreground">
              <a
                href="https://github.com/Finerium/nerium"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-muted underline-offset-4 transition-colors duration-150 hover:decoration-primary hover:text-primary motion-reduce:transition-none"
              >
                github.com/Finerium/nerium
              </a>
            </dd>
          </div>

          <div className="rounded-lg border border-border bg-[oklch(0.11_0.02_270)] p-5">
            <dt className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">
              Discord
            </dt>
            <dd className="font-mono text-sm text-foreground">
              nerium0leander
            </dd>
          </div>

          <div className="rounded-lg border border-border bg-[oklch(0.11_0.02_270)] p-5">
            <dt className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">
              License
            </dt>
            <dd className="font-mono text-sm text-foreground">
              MIT, open source from day one
            </dd>
          </div>
        </motion.dl>

        <motion.p
          {...revealProps}
          className="mt-16 text-sm leading-relaxed text-muted"
        >
          Ghaisan Khoirul Badruzaman (GitHub Finerium). Built with Opus 4.7
          for the Cerebral Valley plus Anthropic hackathon, April 2026.
        </motion.p>
      </div>
    </section>
  );
}

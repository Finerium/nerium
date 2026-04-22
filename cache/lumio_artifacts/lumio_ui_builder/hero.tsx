import Link from 'next/link';
import { Metric } from '@/components/metric';

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 dot-grid gradient-mask opacity-60" aria-hidden="true" />
      <div className="relative max-w-6xl mx-auto px-6 pt-16 pb-24 grid md:grid-cols-12 gap-10 items-center">
        <div className="md:col-span-7">
          <div className="inline-flex items-center gap-2 pill px-3 py-1.5 rounded-full text-xs ink-soft mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            New, Reading Atlas crosses sources automatically
          </div>
          <h1 className="font-display text-5xl md:text-6xl leading-[1.05] tracking-tight font-semibold">
            Read smarter.<br />
            <span className="glyph-underline">Remember longer.</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl ink-soft max-w-xl">
            Lumio is the smart reading companion that captures highlights, auto-summarizes long articles, and quietly ties it all together with spaced recall, so the best parts of what you read actually stick.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/signup" className="cta-btn inline-flex items-center gap-2 px-5 py-3 rounded-xl font-medium">
              Start free, no card
            </Link>
            <Link href="#how" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl ghost-btn ink-soft text-sm font-medium border border-line">
              See a 90 second tour
            </Link>
          </div>
          <dl className="mt-10 grid grid-cols-3 gap-6 max-w-lg">
            <Metric value="84" suffix="/mo" label="Avg articles saved" />
            <Metric value="3.4x" label="Recall lift" />
            <Metric value="5h" suffix="/wk" label="Time saved" />
          </dl>
        </div>
        <div className="md:col-span-5">
          {/* HeroCardStack is declared in component_tree.md id hero-card-stack. */}
          {/* Copy and visuals match cache/lumio_final/index.html hero stack. */}
        </div>
      </div>
    </section>
  );
}

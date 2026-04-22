import { FeatureCard } from '@/components/feature_card';

const features = [
  {
    id: 'summary',
    icon: 'bookmark',
    title: 'Auto summaries that respect the text.',
    body:
      'Paste a link or forward an email, Lumio returns a three-paragraph summary keyed to the author’s own phrasing, with the passages worth re-reading kept intact.',
    bullets: [
      'Long reads, PDFs, newsletters, Substacks',
      'Preserves quotations, no paraphrase drift',
      'Tone aware, Essay vs Paper vs Brief modes',
    ],
  },
  {
    id: 'atlas',
    icon: 'graph',
    title: 'Reading Atlas, ideas that know each other.',
    body:
      'Every highlight joins a quiet graph of concepts. When a new article touches an old one, Lumio surfaces the link in context, no tagging chore required.',
    bullets: [
      'Cross-source concept linking',
      'Side-by-side quote comparison',
      'Export to Obsidian, Notion, or plain Markdown',
    ],
  },
  {
    id: 'recall',
    icon: 'calendar',
    title: 'Spaced recall, without the flashcard guilt.',
    body:
      'Lumio picks two or three short prompts a day from what you actually underlined. No cards to make, no backlog to tame, just five quiet minutes that keep ideas alive.',
    bullets: [
      'Adaptive interval, Ebbinghaus plus your pace',
      'Morning commute mode, audio only',
      'Skip without penalty, Lumio learns your tempo',
    ],
  },
  {
    id: 'focus',
    icon: 'stack',
    title: 'Focus sessions that don’t moralize.',
    body:
      'Start a session, Lumio hides the noise, tracks your reading pace, and hands back a gentle recap. Stats if you want them, silence if you don’t.',
    bullets: [
      'Per-source pace, not just words per minute',
      'Distraction-free web reader overlay',
      'Weekly reading letter, sent to your inbox',
    ],
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="max-w-6xl mx-auto px-6 py-24">
      <div className="max-w-2xl">
        <p className="text-xs uppercase tracking-wider text-accent font-semibold">Features</p>
        <h2 className="font-display text-4xl md:text-5xl font-semibold mt-3 tracking-tight">
          Built for the way you actually read.
        </h2>
        <p className="mt-4 ink-soft text-lg">
          No more highlights that die in a scrapbook. Lumio quietly turns every reading session into a growing atlas of ideas you can lean on.
        </p>
      </div>
      <div className="mt-14 grid md:grid-cols-2 gap-6">
        {features.map((feature) => (
          <FeatureCard key={feature.id} {...feature} />
        ))}
      </div>
    </section>
  );
}

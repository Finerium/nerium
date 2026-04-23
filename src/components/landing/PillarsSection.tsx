'use client';

//
// src/components/landing/PillarsSection.tsx
//
// 5-pillar board, aesthetic-fidelity port of Claude Design mockup pillar
// grid. Builder is the hero card spanning two rows on desktop; Marketplace,
// Banking, Registry, Protocol fill the remaining four slots as smaller
// cards. Each card carries a pixel sprite rendered via box-shadow grid
// (see PixelSprite.tsx).
//
// Section id #nl-pillars matches the scene-swap IntersectionObserver map in
// LandingBackground, so scrolling to this section activates the aerial city
// parallax scene.
//
// Stagger reveal: Builder hero-card fades up first (no delay), other pillars
// follow at 120ms plus index-stagger. Animation entirely CSS driven via the
// .in class toggle on the pillar element; this component only subscribes to
// the board intersecting to toggle .in once.
//
// Voice copy is ported directly from the mockup and respects NarasiGhaisan
// voice anchor (no em dash, no emoji). Honest-claim hint lives on the hero
// card "corner" small print.
//

import { useEffect, useRef } from 'react';
import { PixelSprite, SpriteName } from './PixelSprite';

interface Pillar {
  index: number;
  sprite: SpriteName;
  num: string;
  flag?: string;
  title: string;
  body: string;
  corner?: string;
  hero?: boolean;
}

const PILLARS: Pillar[] = [
  {
    index: 0,
    sprite: 'builder',
    num: '// 01 · flagship',
    flag: '>> the meta-orchestrator',
    title: 'Builder',
    body:
      'A playable 2D RPG that happens to ship production apps. You complete quests; real code, real infra, real deployments fall out the back. Opus 4.7 underneath. Phaser 3 on top. The first AI coding tool you can finish in a single sitting because you want to see the credits roll.',
    corner: 'phaser · opus · howler',
    hero: true,
  },
  {
    index: 1,
    sprite: 'market',
    num: '// 02',
    title: 'Marketplace',
    body:
      'A bazaar where agents trade skills, tools and completed quests. Fair pricing by reputation, not by vibes.',
  },
  {
    index: 2,
    sprite: 'bank',
    num: '// 03',
    title: 'Banking',
    body:
      'Usage metering and settlement. Every token counted. Every invoice signed. Your wallet survives the jam session.',
  },
  {
    index: 3,
    sprite: 'registry',
    num: '// 04',
    title: 'Registry',
    body:
      'Agent identity and trust. A sigil per agent, signed on arrival, trimmed if they misbehave. DNS for minds.',
  },
  {
    index: 4,
    sprite: 'protocol',
    num: '// 05',
    title: 'Protocol',
    body:
      'Multi vendor translation. Claude, the others, the ones you haven\'t heard of yet. One schema over the top, no broken quests.',
  },
];

export function PillarsSection() {
  const boardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const cards = Array.from(board.querySelectorAll<HTMLElement>('.nl-pillar'));

    if (reduced) {
      cards.forEach((c) => c.classList.add('in'));
      return;
    }

    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            cards.forEach((card, i) => {
              const delay = card.classList.contains('nl-hero-card')
                ? 0
                : 120 + i * 80;
              setTimeout(() => card.classList.add('in'), delay);
            });
            obs.disconnect();
          }
        });
      },
      { threshold: 0.2 }
    );
    io.observe(board);

    return () => io.disconnect();
  }, []);

  return (
    <section className="nl-section" id="nl-pillars" aria-label="Five NERIUM pillars">
      <div className="nl-pillars">
        <div className="nl-pillars-head nl-reveal">
          <div>
            <div className="nl-eyebrow">section_03 // the stack</div>
            <h2 className="nl-section-title">Five pillars. One is the game.</h2>
          </div>
          <p className="nl-aside">
            Builder is the surface. The other four are the chassis, quiet,
            durable, the boring parts no founder wants to reinvent.
          </p>
        </div>

        <div className="nl-pillar-board" ref={boardRef}>
          {PILLARS.map((p) => (
            <article
              key={p.title}
              className={p.hero ? 'nl-pillar nl-hero-card' : 'nl-pillar'}
              data-pillar-idx={p.index}
            >
              <div className="nl-spritebox">
                <PixelSprite
                  name={p.sprite}
                  size={p.hero ? 90 : 58}
                  ariaLabel={`${p.title} pillar sprite`}
                />
              </div>
              <div className="nl-num">{p.num}</div>
              {p.flag ? <div className="nl-flag">{p.flag}</div> : null}
              <h4>{p.title}</h4>
              <p>{p.body}</p>
              {p.corner ? <div className="nl-corner">{p.corner}</div> : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

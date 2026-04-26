'use client';

//
// src/components/landing/HeroSection.tsx
//
// Landing page hero, aesthetic-fidelity port of Claude Design mockup at
// _skills_staging/claude_design_landing.html. Boot choreography sequence:
// 1. Terminal boot lines fade in sequentially (6 lines, ~210ms stagger)
// 2. NERIUM logotype chars fade up staggered (55ms per char)
// 3. Underbar grows from 0 to min(60vw, 720px)
// 4. Walker sprite strides across the underbar width (steps animation)
// 5. Tagline fades in
// 6. Meta-narrative hook fades in (verbatim from CLAUDE.md + mockup)
// 7. Two CTAs fade up (primary to /play, secondary download-game soon)
// 8. Hero video slot fades in at the bottom (demo-preview.mp4 placeholder)
//
// Link target /play per RV.5 and M2 Section 4.8 hard stop (no Phaser embed
// on landing). Video surface is YouTube unlisted iframe at video ID
// DJQXitRa1VE (Kalypso W4 final, replaces W3 placeholder
// /video/demo-preview.mp4 mp4 file). YouTube serves the canonical 3-min
// submission demo. iframe uses lazy load and strict-origin referrer policy.
//
// prefers-reduced-motion short-circuits all animations; elements appear at
// final opacity/position immediately. Walker animation is skipped.
//
// Tagline text is LOCKED verbatim per V1 project identity lock:
// "Infrastructure for the AI agent economy."
//
// Meta-narrative hook is LOCKED verbatim per CLAUDE.md Meta-narrative
// section: "NERIUM built itself by running the manual workflow it
// automates, one last time, for this hackathon."
//

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { PixelSprite } from './PixelSprite';

export function HeroSection() {
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const lines = root.querySelectorAll<HTMLElement>('.nl-tbody .nl-ln');
    const chars = root.querySelectorAll<HTMLElement>('.nl-logotype .nl-char');
    const underbar = root.querySelector<HTMLElement>('.nl-underbar');
    const tagline = root.querySelector<HTMLElement>('.nl-tagline');
    const metaunder = root.querySelector<HTMLElement>('.nl-meta-under');
    const ctarow = root.querySelector<HTMLElement>('.nl-ctarow');
    const walker = root.querySelector<HTMLElement>('.nl-walker');
    const heroVideo = root.querySelector<HTMLElement>('.nl-hero-video');

    const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    let cancelled = false;

    const animateElement = (
      el: HTMLElement | null,
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions
    ): Animation | null => {
      if (!el) return null;
      if (reduced) {
        // When motion is reduced, snap to the final keyframe values.
        const final = keyframes[keyframes.length - 1];
        Object.keys(final).forEach((k) => {
          if (k === 'offset') return;
          (el.style as unknown as Record<string, string>)[k] = String(
            (final as Record<string, unknown>)[k]
          );
        });
        return null;
      }
      return el.animate(keyframes, options);
    };

    const boot = async () => {
      if (reduced) {
        // Snap every intro element to final state, skip walker.
        lines.forEach((el) => {
          el.style.opacity = '1';
          el.style.transform = 'none';
        });
        chars.forEach((el) => {
          el.style.opacity = '1';
          el.style.transform = 'none';
        });
        if (underbar) underbar.style.width = 'min(60vw, 720px)';
        if (tagline) tagline.style.opacity = '1';
        if (metaunder) metaunder.style.opacity = '1';
        if (ctarow) ctarow.style.opacity = '1';
        if (heroVideo) heroVideo.classList.add('in');
        return;
      }

      for (let i = 0; i < lines.length; i++) {
        if (cancelled) return;
        lines[i].animate(
          [
            { opacity: 0, transform: 'translateY(4px)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 220, fill: 'forwards', easing: 'ease-out' }
        );
        await wait(210);
      }
      await wait(250);
      if (cancelled) return;

      chars.forEach((c, i) => {
        c.animate(
          [
            { opacity: 0, transform: 'translateY(22px) scale(0.96)' },
            { opacity: 1, transform: 'none' },
          ],
          {
            duration: 440,
            fill: 'forwards',
            easing: 'cubic-bezier(0.2,0.8,0.2,1)',
            delay: i * 55,
          }
        );
      });
      await wait(chars.length * 55 + 440);
      if (cancelled) return;

      animateElement(
        underbar,
        [{ width: '0px' }, { width: 'min(60vw, 720px)' }],
        { duration: 520, fill: 'forwards', easing: 'cubic-bezier(0.2,0.8,0.2,1)' }
      );

      const logotype = root.querySelector<HTMLElement>('.nl-logotype');
      if (logotype && walker) {
        const tw = logotype.getBoundingClientRect().width;
        const barW = Math.min(window.innerWidth * 0.6, 720);
        const startX = (tw - barW) / 2;
        walker.style.left = startX + 'px';
        walker.animate(
          [
            { opacity: 0, transform: 'translateX(0) translateY(0)' },
            { opacity: 1, transform: 'translateX(0) translateY(-2px)', offset: 0.05 },
            {
              opacity: 1,
              transform: `translateX(${barW - 24}px) translateY(0)`,
              offset: 0.95,
            },
            { opacity: 0, transform: `translateX(${barW - 24}px) translateY(0)` },
          ],
          { duration: 1400, fill: 'forwards', easing: 'steps(14)' }
        );
      }

      await wait(500);
      if (cancelled) return;

      animateElement(
        tagline,
        [
          { opacity: 0, transform: 'translateY(8px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 520, fill: 'forwards' }
      );
      await wait(380);
      if (cancelled) return;

      animateElement(
        metaunder,
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 520, fill: 'forwards' }
      );
      await wait(200);
      if (cancelled) return;

      animateElement(
        ctarow,
        [
          { opacity: 0, transform: 'translateY(10px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 600, fill: 'forwards', easing: 'cubic-bezier(0.2,0.8,0.2,1)' }
      );
      await wait(400);
      if (cancelled) return;

      if (heroVideo) heroVideo.classList.add('in');
    };

    boot();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header className="nl-hero" id="nl-top" ref={rootRef}>
      <div className="nl-terminal" role="presentation" aria-hidden="true">
        <div className="nl-tbar">
          <span className="nl-chip a" />
          <span className="nl-chip b" />
          <span className="nl-chip c" />
          <span className="nl-ttl">nerium@hackathon ~ boot.sh</span>
        </div>
        <div className="nl-tbody">
          <div className="nl-ln">
            <span className="nl-dim">$</span> ./boot --agents=47 --phases=9 --manual
          </div>
          <div className="nl-ln">
            <span className="nl-dim">-&gt;</span> loading registry <span className="nl-ok">ok</span>
          </div>
          <div className="nl-ln">
            <span className="nl-dim">-&gt;</span> warming marketplace <span className="nl-ok">ok</span>
          </div>
          <div className="nl-ln">
            <span className="nl-dim">-&gt;</span> metering ledger{' '}
            <span className="nl-warn">... wait</span>
          </div>
          <div className="nl-ln">
            <span className="nl-dim">-&gt;</span> protocol handshake{' '}
            <span className="nl-ok">ok</span>
          </div>
          <div className="nl-ln">
            <span className="nl-ok">&gt; quest.begin("build_yourself")</span>{' '}
            <span className="nl-cursor" />
          </div>
        </div>
      </div>

      <h1 className="nl-logotype" aria-label="NERIUM">
        <span className="nl-char">N</span>
        <span className="nl-char">E</span>
        <span className="nl-char">R</span>
        <span className="nl-char">I</span>
        <span className="nl-char">U</span>
        <span className="nl-char">M</span>
        <span className="nl-walker" aria-hidden="true">
          <PixelSprite name="walker" size={32} />
        </span>
        <span className="nl-underbar" aria-hidden="true" />
      </h1>

      <p className="nl-tagline">
        infrastructure for the <span className="nl-br">//</span> ai agent economy
      </p>

      <p className="nl-meta-under">
        <span className="nl-quo">&quot;</span>
        NERIUM built itself by running the manual workflow it automates, one
        last time, for this hackathon.
        <span className="nl-quo">&quot;</span>
      </p>

      <div className="nl-ctarow">
        <Link
          href="/play"
          prefetch={false}
          className="nl-btn nl-btn-primary"
          aria-label="Play in browser"
        >
          <span className="nl-arrow">&gt;</span> play in browser
        </Link>
        <a
          href="https://github.com/Finerium/nerium"
          target="_blank"
          rel="noopener noreferrer"
          className="nl-btn nl-btn-ghost"
          aria-label="View source on GitHub"
        >
          view source <span className="nl-tag">mit</span>
        </a>
      </div>

      <div className="nl-hero-video">
        <div className="nl-video-frame">
          <iframe
            src="https://www.youtube.com/embed/DJQXitRa1VE"
            title="NERIUM 3-minute hackathon submission demo video"
            aria-label="NERIUM 3-minute hackathon submission demo video, hosted on YouTube"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
          />
          <span className="nl-video-note">3 min demo // youtube unlisted</span>
        </div>
      </div>
    </header>
  );
}

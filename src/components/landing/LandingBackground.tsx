'use client';

//
// src/components/landing/LandingBackground.tsx
//
// Parallax scene-swap + CRT chrome ported from Claude Design mockup at
// _skills_staging/claude_design_landing.html. Manages 6 stacked scenes
// (outskirts, inside-the-city, workshop, aerial, pipeline procession, dawn),
// pixel-silhouette SVG skyline data URIs, phosphor-dust particles, scanfield,
// vignette, and scene-swap driven by IntersectionObserver on section anchors.
//
// Client Component because every subsystem needs the browser runtime
// (IntersectionObserver, requestAnimationFrame, DOM mutation, matchMedia).
// The parent Server Component (app/page.tsx) remains server-rendered.
//
// prefers-reduced-motion is honored: scenes lock to scene-1, parallax
// transform is skipped, flicker/dust/pedestrian/train animations throttle via
// the @media rule inside app/landing.css.
//

import { useEffect, useRef } from 'react';

// ----- palette constants matching mockup exactly -----
const COLORS = {
  farFill: 'oklch(0.22 0.04 140)',
  midFill: 'oklch(0.26 0.05 140)',
  nearFill: 'oklch(0.19 0.03 140)',
  amber: 'oklch(0.78 0.17 55)',
  phos: 'oklch(0.72 0.12 140)',
  dim: 'oklch(0.18 0.02 140)',
};

type Rect = [number, number, number, number, string?];

function svgDataURI(w: number, h: number, rects: Rect[], fill: string, scale: number): string {
  const body = rects
    .map(
      ([x, y, rw, rh, c]) =>
        `<rect x="${x * scale}" y="${y * scale}" width="${rw * scale}" height="${
          rh * scale
        }" fill="${c ?? fill}"/>`
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function cityFar(seed: number): string {
  const rects: Rect[] = [];
  let x = 0;
  const a = [8, 12, 5, 10, 14, 6, 10, 9, 11, 7, 13, 8, 10, 6, 12, 5, 10, 9, 8, 11, 6, 13, 8];
  const b = [22, 18, 28, 14, 26, 20, 24, 17, 30, 12, 25, 20, 28, 16, 22, 19, 26, 14, 30, 18, 24, 22, 20];
  for (let i = 0; i < a.length && x < 60; i++) {
    const w = a[(i + seed) % a.length];
    const h = b[(i + seed) % b.length];
    rects.push([x, 34 - h, w, h]);
    if (i % 2 === 0) rects.push([x + Math.floor(w / 2), 34 - h - 3, 1, 3]);
    x += w;
  }
  return svgDataURI(60 * 6, 34 * 6, rects, COLORS.farFill, 6);
}

function cityMid(seed: number): string {
  const rects: Rect[] = [];
  const widths = [6, 4, 8, 5, 10, 6, 4, 9, 5, 7, 6, 8, 4, 10, 6, 5, 9, 4, 8, 6];
  const heights = [14, 10, 22, 12, 18, 15, 9, 20, 11, 17, 13, 19, 8, 24, 14, 11, 22, 10, 17, 13];
  let x = 0;
  for (let i = 0; i < widths.length && x < 80; i++) {
    const w = widths[(i + seed) % widths.length];
    const h = heights[(i + seed) % heights.length];
    const y = 30 - h;
    rects.push([x, y, w, h]);
    for (let wy = y + 2; wy < 29; wy += 3) {
      for (let wx = x + 1; wx < x + w - 1; wx += 2) {
        if ((wx * 7 + wy * 3 + i + seed) % 5 === 0) rects.push([wx, wy, 1, 1, COLORS.phos]);
      }
    }
    x += w + 1;
  }
  return svgDataURI(80 * 5, 30 * 5, rects, COLORS.midFill, 5);
}

function archesNear(seed: number): string {
  const rects: Rect[] = [];
  const archs = [2, 16, 30, 44, 58, 72, 86, 100];
  archs.forEach((ax, i) => {
    const h = 12 + ((i + seed) * 3) % 6;
    rects.push([ax, 24 - h, 2, h]);
    rects.push([ax + 8, 24 - h, 2, h]);
    rects.push([ax, 24 - h, 10, 2]);
    if (i % 2 === 0) rects.push([ax + 7, 24 - h + 2, 2, 2]);
  });
  const trees = [10, 24, 38, 52, 66, 80, 94, 108];
  trees.forEach((tx, i) => {
    const h = 5 + (i % 3);
    rects.push([tx, 24 - h, 1, h]);
    rects.push([tx - 1, 24 - h - 1, 3, 2]);
  });
  return svgDataURI(120 * 4, 24 * 4, rects, COLORS.nearFill, 4);
}

function streetNear(): string {
  const rects: Rect[] = [];
  const facades = [0, 20, 40, 60, 80, 100];
  facades.forEach((fx, i) => {
    rects.push([fx, 10, 18, 14]);
    rects.push([fx + 3, 16, 5, 6, COLORS.dim]);
    rects.push([fx + 10, 14, 3, 3, COLORS.phos]);
    rects.push([fx + 10, 19, 3, 3, COLORS.phos]);
    rects.push([fx - 1, 8, 20, 2, COLORS.midFill]);
    if (i % 2 === 0) rects.push([fx + 8, 6, 1, 2, COLORS.amber]);
  });
  return svgDataURI(120 * 4, 24 * 4, rects, COLORS.nearFill, 4);
}

function cityMidDense(): string {
  const rects: Rect[] = [];
  const w = [8, 6, 10, 7, 9, 8, 6, 10, 7, 8];
  const h = [22, 18, 26, 20, 24, 22, 17, 28, 19, 23];
  let x = 0;
  for (let i = 0; i < w.length && x < 70; i++) {
    rects.push([x, 30 - h[i], w[i], h[i]]);
    for (let wy = 32 - h[i]; wy < 29; wy += 2) {
      for (let wx = x + 1; wx < x + w[i] - 1; wx += 2) {
        if ((wx * 3 + wy * 5 + i) % 4 === 0) rects.push([wx, wy, 1, 1, COLORS.phos]);
      }
    }
    x += w[i] + 1;
  }
  return svgDataURI(70 * 5, 30 * 5, rects, COLORS.midFill, 5);
}

function aerialFar(): string {
  const rects: Rect[] = [];
  for (let gy = 2; gy < 32; gy += 6) rects.push([0, gy, 60, 1, COLORS.dim]);
  for (let gx = 3; gx < 60; gx += 7) rects.push([gx, 2, 1, 30, COLORS.dim]);
  rects.push([8, 14, 2, 10]);
  rects.push([7, 24, 4, 1]);
  rects.push([9, 11, 1, 3, COLORS.phos]);
  rects.push([46, 14, 2, 10]);
  rects.push([54, 14, 2, 10]);
  rects.push([46, 12, 10, 2]);
  return svgDataURI(60 * 6, 34 * 6, rects, COLORS.farFill, 6);
}

function aerialMid(): string {
  const rects: Rect[] = [];
  const tents: Array<[number, number]> = [
    [4, 12],
    [10, 14],
    [16, 13],
    [22, 15],
  ];
  tents.forEach(([tx, ty]) => {
    rects.push([tx, ty, 4, 3]);
    rects.push([tx + 1, ty - 2, 2, 2, COLORS.amber]);
  });
  rects.push([50, 8, 14, 16]);
  rects.push([54, 14, 6, 6, COLORS.dim]);
  rects.push([56, 16, 2, 2, COLORS.phos]);
  const blocks: Array<[number, number, number, number]> = [
    [32, 16, 6, 6],
    [40, 18, 4, 4],
    [28, 22, 8, 4],
  ];
  blocks.forEach(([x, y, bw, bh]) => rects.push([x, y, bw, bh]));
  return svgDataURI(70 * 5, 30 * 5, rects, COLORS.midFill, 5);
}

function aerialNear(): string {
  const rects: Rect[] = [];
  const cx = 52;
  rects.push([cx, 8, 14, 16]);
  rects.push([cx + 2, 4, 3, 4]);
  rects.push([cx + 9, 4, 3, 4]);
  rects.push([cx + 6, 12, 2, 6, COLORS.dim]);
  rects.push([cx + 5, 2, 1, 2, COLORS.phos]);
  rects.push([cx + 10, 2, 1, 2, COLORS.amber]);
  rects.push([0, 22, 120, 1, COLORS.dim]);
  rects.push([0, 18, 120, 1, COLORS.dim]);
  for (let i = 0; i < 5; i++) {
    const hx = 10 + i * 8;
    rects.push([hx, 16, 5, 6]);
    rects.push([hx + 1, 14, 3, 2]);
  }
  return svgDataURI(120 * 4, 24 * 4, rects, COLORS.nearFill, 4);
}

function workshopFar(): string {
  const rects: Rect[] = [];
  for (let i = 0; i < 4; i++) rects.push([0, 30 - i * 3, 60, 1, COLORS.dim]);
  rects.push([12, 6, 36, 22, COLORS.dim]);
  const skyline: Array<[number, number, number, number]> = [
    [14, 20, 3, 7],
    [18, 16, 2, 11],
    [21, 22, 3, 5],
    [25, 18, 4, 9],
    [30, 14, 3, 13],
    [34, 22, 3, 5],
    [38, 19, 2, 8],
    [41, 16, 4, 11],
  ];
  skyline.forEach((r) => rects.push([r[0], r[1], r[2], r[3], COLORS.farFill]));
  for (let bi = 8; bi < 28; bi += 2) rects.push([12, bi, 36, 1, COLORS.dim]);
  return svgDataURI(60 * 6, 34 * 6, rects, COLORS.farFill, 6);
}

function workshopMid(): string {
  const rects: Rect[] = [];
  const cabs: Array<[number, number]> = [
    [4, 10],
    [14, 10],
    [50, 10],
    [60, 10],
  ];
  cabs.forEach(([cx, cy]) => {
    rects.push([cx, cy, 8, 18]);
    rects.push([cx + 2, cy + 2, 4, 3, COLORS.dim]);
    rects.push([cx + 2, cy + 7, 4, 3, COLORS.dim]);
    rects.push([cx + 2, cy + 12, 4, 3, COLORS.dim]);
  });
  rects.push([24, 14, 22, 1, COLORS.dim]);
  rects.push([24, 20, 22, 1, COLORS.dim]);
  for (let i = 0; i < 8; i++) rects.push([25 + i * 2, 13, 1, 1, COLORS.phos]);
  return svgDataURI(70 * 5, 30 * 5, rects, COLORS.midFill, 5);
}

function workshopNear(): string {
  const rects: Rect[] = [];
  for (let i = 0; i < 4; i++) rects.push([0, 20 - i * 2, 120, 1, COLORS.dim]);
  return svgDataURI(120 * 4, 24 * 4, rects, COLORS.nearFill, 4);
}

export function LandingBackground() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ----- apply layer background images -----
    const setLayer = (sceneId: string, layerClass: string, uri: string) => {
      const el = root.querySelector<HTMLElement>(`[data-scene="${sceneId}"] .${layerClass}`);
      if (el) el.style.backgroundImage = `url("${uri}")`;
    };

    setLayer('1', 'nl-plx-far', cityFar(0));
    setLayer('1', 'nl-plx-mid', cityMid(0));
    setLayer('1', 'nl-plx-near', archesNear(0));

    setLayer('2', 'nl-plx-far', cityFar(7));
    setLayer('2', 'nl-plx-mid', cityMidDense());
    setLayer('2', 'nl-plx-near', streetNear());

    setLayer('3', 'nl-plx-far', workshopFar());
    setLayer('3', 'nl-plx-mid', workshopMid());
    setLayer('3', 'nl-plx-near', workshopNear());

    setLayer('4', 'nl-plx-far', aerialFar());
    setLayer('4', 'nl-plx-mid', aerialMid());
    setLayer('4', 'nl-plx-near', aerialNear());

    setLayer('6', 'nl-plx-far', cityFar(3));
    setLayer('6', 'nl-plx-mid', cityMid(3));
    setLayer('6', 'nl-plx-near', archesNear(3));

    // ----- seed flickers inside every .nl-flicker-field -----
    const flickerFields = root.querySelectorAll<HTMLElement>('.nl-flicker-field');
    flickerFields.forEach((field) => {
      if (field.childElementCount > 0) return;
      for (let i = 0; i < 16; i++) {
        const f = document.createElement('span');
        f.className = 'nl-flicker';
        f.style.left = 2 + Math.random() * 96 + '%';
        f.style.bottom = Math.random() * 120 + 'px';
        f.style.animationDelay = -Math.random() * 5 + 's';
        f.style.animationDuration = 3 + Math.random() * 5 + 's';
        f.style.opacity = String(0.35 + Math.random() * 0.4);
        field.appendChild(f);
      }
    });

    // ----- build scene 5 pipeline procession: 47 agents across 3 strips -----
    const strips: Array<{ id: string; count: number; dur: number; size: number }> = [
      { id: 'nl-pipelineFar', count: 15, dur: 80, size: 0.7 },
      { id: 'nl-pipelineMid', count: 16, dur: 55, size: 1.0 },
      { id: 'nl-pipelineNear', count: 16, dur: 40, size: 1.3 },
    ];

    strips.forEach(({ id, count, dur, size }) => {
      const el = root.querySelector<HTMLElement>(`#${id}`);
      if (!el || el.childElementCount > 0) return;
      const row = document.createElement('div');
      row.className = 'nl-pipelineRow';
      row.style.animationDuration = dur + 's';
      row.style.transform = 'scale(' + size + ')';
      row.style.transformOrigin = 'left center';

      const buildSeq = (isLast: boolean): DocumentFragment => {
        const frag = document.createDocumentFragment();
        for (let i = 0; i < count; i++) {
          const a = document.createElement('span');
          a.className = 'nl-agent';
          if (i % 3 === 0) a.style.height = '14px';
          if (i % 4 === 0) a.style.background = COLORS.phos;
          frag.appendChild(a);
          const ln = document.createElement('span');
          ln.className = 'nl-line';
          frag.appendChild(ln);
        }
        if (isLast) {
          const q = document.createElement('span');
          q.className = 'nl-quest';
          frag.appendChild(q);
        }
        return frag;
      };

      row.appendChild(buildSeq(true));
      row.appendChild(buildSeq(true));
      el.appendChild(row);
    });

    // ----- dust particles -----
    const dust = root.querySelector<HTMLElement>('.nl-dust');
    if (dust && dust.childElementCount === 0) {
      for (let i = 0; i < 22; i++) {
        const s = document.createElement('i');
        s.style.left = Math.random() * 100 + '%';
        s.style.animationDuration = 18 + Math.random() * 22 + 's';
        s.style.animationDelay = -Math.random() * 30 + 's';
        s.style.opacity = String(0.15 + Math.random() * 0.35);
        dust.appendChild(s);
      }
    }

    // ----- scroll-linked parallax -----
    const farLayers = Array.from(root.querySelectorAll<HTMLElement>('.nl-scene .nl-plx-far'));
    const midLayers = Array.from(root.querySelectorAll<HTMLElement>('.nl-scene .nl-plx-mid'));
    const nearLayers = Array.from(root.querySelectorAll<HTMLElement>('.nl-scene .nl-plx-near'));
    let ticking = false;

    const updateParallax = () => {
      const y = window.scrollY;
      farLayers.forEach((e) => {
        e.style.transform = `translate3d(${-y * 0.05}px, ${y * 0.08}px, 0)`;
      });
      midLayers.forEach((e) => {
        e.style.transform = `translate3d(${-y * 0.12}px, ${y * 0.18}px, 0)`;
      });
      nearLayers.forEach((e) => {
        e.style.transform = `translate3d(${-y * 0.22}px, ${y * 0.32}px, 0)`;
      });
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking && !reduced) {
        requestAnimationFrame(updateParallax);
        ticking = true;
      }
    };

    if (!reduced) {
      window.addEventListener('scroll', onScroll, { passive: true });
      updateParallax();
    }

    // ----- scene-swap via IntersectionObserver -----
    // map of section anchor -> scene data attribute
    const sceneMap: Array<{ sel: string; scene: string }> = [
      { sel: '#nl-top', scene: '1' },
      { sel: '#nl-what', scene: '2' },
      { sel: '#nl-pain', scene: '3' },
      { sel: '#nl-pillars', scene: '4' },
      { sel: '#nl-manifesto', scene: '5' },
      { sel: '#nl-final', scene: '6' },
    ];

    const activateScene = (id: string) => {
      const target = reduced ? '1' : id;
      root.querySelectorAll<HTMLElement>('.nl-scene').forEach((s) => {
        s.classList.toggle('active', s.dataset.scene === target);
      });
    };

    let sceneObserver: IntersectionObserver | null = null;
    if (!reduced) {
      sceneObserver = new IntersectionObserver(
        (entries) => {
          let best: IntersectionObserverEntry | null = null;
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
          });
          if (best !== null) {
            // TypeScript narrowing fails through the callback closure; assert.
            const entry = best as IntersectionObserverEntry;
            const match = sceneMap.find((m) => entry.target.matches(m.sel));
            if (match) activateScene(match.scene);
          }
        },
        { threshold: [0.25, 0.5, 0.75], rootMargin: '-20% 0px -20% 0px' }
      );
      sceneMap.forEach((m) => {
        const el = document.querySelector(m.sel);
        if (el) sceneObserver!.observe(el);
      });
    } else {
      activateScene('1');
    }

    return () => {
      if (sceneObserver) sceneObserver.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <div ref={rootRef}>
      <div className="nl-parallax" aria-hidden="true">
        {/* scene 1 outskirts */}
        <div className="nl-scene active" data-scene="1">
          <div className="nl-plx-layer nl-plx-far" />
          <div className="nl-plx-layer nl-plx-mid" />
          <div className="nl-plx-layer nl-plx-near" />
          <div
            className="nl-flicker-field"
            style={{ position: 'absolute', left: 0, right: 0, bottom: 40, height: 180, pointerEvents: 'none' }}
          />
        </div>
        {/* scene 2 inside the city */}
        <div className="nl-scene" data-scene="2">
          <div className="nl-plx-layer nl-plx-far" />
          <div className="nl-plx-layer nl-plx-mid" />
          <div className="nl-plx-layer nl-plx-near" />
          <div
            className="nl-flicker-field"
            style={{ position: 'absolute', left: 0, right: 0, bottom: 80, height: 140, pointerEvents: 'none' }}
          />
          <div className="nl-train" />
          <div className="nl-car" style={{ animationDuration: '24s', animationDelay: '-8s' }} />
          <div className="nl-car" style={{ animationDuration: '32s', animationDelay: '-20s', bottom: 14 }} />
          <div className="nl-pedestrian" style={{ animationDuration: '40s', animationDelay: '-2s', left: 0 }} />
          <div className="nl-pedestrian" style={{ animationDuration: '48s', animationDelay: '-14s', bottom: 20 }} />
          <div className="nl-pedestrian" style={{ animationDuration: '44s', animationDelay: '-28s', bottom: 24 }} />
          <div className="nl-pedestrian" style={{ animationDuration: '52s', animationDelay: '-38s', bottom: 22 }} />
        </div>
        {/* scene 3 workshop */}
        <div className="nl-scene" data-scene="3">
          <div className="nl-plx-layer nl-plx-far" />
          <div className="nl-plx-layer nl-plx-mid" />
          <div className="nl-plx-layer nl-plx-near" />
          <div className="nl-workshop">
            <div className="nl-ws-clock" />
            <div className="nl-ws-papers" />
            <div className="nl-ws-lamp" />
            <div className="nl-ws-desk" />
            <div className="nl-ws-stand" />
            <div className="nl-ws-monitor" />
            <div className="nl-ws-figure" />
          </div>
        </div>
        {/* scene 4 aerial */}
        <div className="nl-scene" data-scene="4">
          <div className="nl-plx-layer nl-plx-far" />
          <div className="nl-plx-layer nl-plx-mid" />
          <div className="nl-plx-layer nl-plx-near" />
          <div
            className="nl-roadFig"
            style={{ bottom: 56, left: -20, animationDuration: '22s', animationDelay: '-2s' }}
          />
          <div
            className="nl-roadFig"
            style={{ bottom: 82, left: -20, animationDuration: '28s', animationDelay: '-12s' }}
          />
          <div
            className="nl-roadFig"
            style={{ bottom: 120, left: -20, animationDuration: '34s', animationDelay: '-22s' }}
          />
        </div>
        {/* scene 5 pipeline procession */}
        <div className="nl-scene" data-scene="5">
          <div className="nl-pipeline-strip" id="nl-pipelineFar" style={{ top: '18vh', opacity: 0.32 }} />
          <div className="nl-pipeline-strip" id="nl-pipelineMid" style={{ top: '38vh', opacity: 0.45 }} />
          <div className="nl-pipeline-strip" id="nl-pipelineNear" style={{ top: '62vh', opacity: 0.62 }} />
        </div>
        {/* scene 6 dawn */}
        <div className="nl-scene" data-scene="6">
          <div className="nl-plx-layer nl-plx-far" />
          <div className="nl-plx-layer nl-plx-mid" />
          <div className="nl-plx-layer nl-plx-near" />
          <div
            className="nl-flicker-field"
            style={{ position: 'absolute', left: 0, right: 0, bottom: 40, height: 180, pointerEvents: 'none' }}
          />
        </div>
      </div>

      <div className="nl-dust" aria-hidden="true" />
      <div className="nl-vignette" aria-hidden="true" />
      <div className="nl-scanfield" aria-hidden="true" />
    </div>
  );
}

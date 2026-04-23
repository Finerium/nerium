//
// src/components/landing/LandingNav.tsx
//
// Top navigation band ported from Claude Design mockup nav. Server Component
// (no client-side state or effects). Uses the landing-scoped CSS classes in
// app/landing.css. GitHub link targets the locked repo
// github.com/Finerium/nerium.
//
// Anchor hrefs point at the landing section ids (nl-what, nl-pain,
// nl-pillars, nl-manifesto). These are the exact ids produced by
// LandingBackground + HeroSection + MetaNarrativeSection + PillarsSection.
//

export function LandingNav() {
  return (
    <nav className="nl-nav" aria-label="primary">
      <div className="nl-brand">
        <span className="nl-dot" aria-hidden="true" />
        <span>NERIUM/v0.1-hackathon</span>
      </div>
      <div className="nl-links">
        <a href="#nl-what">what</a>
        <a href="#nl-pain">pain</a>
        <a href="#nl-pillars">pillars</a>
        <a href="#nl-manifesto">manifesto</a>
        <a
          href="https://github.com/Finerium/nerium"
          target="_blank"
          rel="noopener noreferrer"
        >
          github
        </a>
      </div>
    </nav>
  );
}

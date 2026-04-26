export default function CreditsPage() {
  return (
    <main className="min-h-screen bg-[#04060C] text-[#F1ECE0] px-6 py-16 md:px-12 lg:px-24">
      <div className="max-w-3xl mx-auto">
        <h1 className="font-mono text-3xl mb-2 text-[#B0F5A0]">Credits</h1>
        <p className="text-sm opacity-60 mb-8">Acknowledgments for tools, services, and resources used to construct NERIUM.</p>

        <section className="space-y-6 leading-relaxed">
          <h2 className="font-mono text-xl text-[#B0F5A0] pt-4">AI Models and Orchestration</h2>
          <p>Anthropic Claude Opus 4.7 served as orchestrator and runtime engine across 54 specialist Claude Code agents. Claude Code itself enabled the multi-agent parallel execution pattern that constructed this submission. Gemini 2.5 generated the demo voiceover with bundled cyberpunk synthwave background music.</p>

          <h2 className="font-mono text-xl text-[#B0F5A0] pt-4">AI-Generated Visual Assets</h2>
          <p>Pixel-art assets for Apollo Village, Caravan Road, Cyberpunk Shanghai, and 9 sub-areas were generated using Nano Banana Pro (Gemini 3 Pro Image Preview). Background removal and asset processing performed via Canva Pro and rembg birefnet-general model. Demo video intro and outro animations generated via Claude Design.</p>

          <h2 className="font-mono text-xl text-[#B0F5A0] pt-4">Open-Source Dependencies</h2>
          <p>NERIUM stands on the work of open-source maintainers. Key libraries include: Next.js, React, Tailwind CSS, shadcn/ui, Framer Motion, Phaser 3, Howler, GSAP, Lenis, FastAPI, Mangum, asyncpg, SQLAlchemy, Alembic, Pydantic, Stripe SDK, Anthropic SDK, Resend SDK, structlog, Playwright, pytest, Remotion. Full dependency tree at package.json and pyproject.toml.</p>

          <h2 className="font-mono text-xl text-[#B0F5A0] pt-4">Infrastructure</h2>
          <p>Vercel for hosting and CDN. Vercel Postgres via Neon for primary database. Upstash Redis for cache and rate limit. Stripe for payment processing test mode. Resend for transactional email.</p>

          <h2 className="font-mono text-xl text-[#B0F5A0] pt-4">Hackathon</h2>
          <p>NERIUM was built for the Cerebral Valley plus Anthropic Built with Opus 4.7 hackathon, April 2026. Thanks to the Cerebral Valley team and Anthropic for organizing the event and selecting Opus 4.7 as the showcase model.</p>

          <h2 className="font-mono text-xl text-[#B0F5A0] pt-4">Author</h2>
          <p>Built solo by Ghaisan Khoirul Badruzaman, first-year Teknik Informatika student at Politeknik Negeri Bandung, Indonesia.</p>
        </section>

        <div className="mt-12 pt-8 border-t border-[#F1ECE0]/10 text-sm opacity-60">
          <a href="/" className="hover:text-[#B0F5A0]">Back to home</a>
        </div>
      </div>
    </main>
  );
}

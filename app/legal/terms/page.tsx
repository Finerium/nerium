export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#04060C] text-[#F1ECE0] px-6 py-16 md:px-12 lg:px-24">
      <div className="max-w-3xl mx-auto">
        <h1 className="font-mono text-3xl mb-2 text-[#B0F5A0]">Terms of Service</h1>
        <p className="text-sm opacity-60 mb-8">Last updated: April 27, 2026</p>

        <section className="space-y-6 leading-relaxed">
          <p>NERIUM is a hackathon submission to the Cerebral Valley plus Anthropic Built with Opus 4.7 hackathon, April 2026. The platform is provided as-is for demonstration and evaluation purposes. By accessing https://nerium-one.vercel.app or the source repository at https://github.com/Finerium/nerium, you agree to the terms below.</p>

          <h2 className="font-mono text-xl text-[#B0F5A0] pt-4">1. Use of Service</h2>
          <p>NERIUM at submission state is in test mode. The Builder runtime requires a user-provided Anthropic API key under the bring-your-own-key pattern. Stripe payment integration is in test mode and does not process real money. Multi-vendor model selection UI showcases planned vendors; live runtime invocation at submission is Anthropic-only.</p>

          <h2 className="font-mono text-xl text-[#B0F5A0] pt-4">2. User Responsibility</h2>
          <p>Users who provide their own Anthropic API key are responsible for their own usage costs and rate limits. Users who upload listings, agents, skills, or prompts to the Marketplace warrant that the content does not infringe third-party intellectual property and complies with applicable laws.</p>

          <h2 className="font-mono text-xl text-[#B0F5A0] pt-4">3. Intellectual Property</h2>
          <p>NERIUM source code is licensed under the MIT License (see repository LICENSE file). User-uploaded content remains owned by the uploading user. NERIUM retains a non-exclusive license to display, distribute, and metadata-index uploaded content for marketplace functionality.</p>

          <h2 className="font-mono text-xl text-[#B0F5A0] pt-4">4. No Warranty</h2>
          <p>NERIUM is provided as-is without warranty of any kind, express or implied. The submission is constructed for hackathon evaluation. Production-grade reliability, security audit, and uptime guarantees activate post-launch following standard infrastructure hardening.</p>

          <h2 className="font-mono text-xl text-[#B0F5A0] pt-4">5. Limitation of Liability</h2>
          <p>NERIUM and its solo author are not liable for any indirect, incidental, or consequential damages arising from use of the platform during the hackathon evaluation period.</p>

          <h2 className="font-mono text-xl text-[#B0F5A0] pt-4">6. Changes</h2>
          <p>These terms may be updated post-hackathon as NERIUM transitions from submission state to production. The latest version will always be at this URL.</p>

          <h2 className="font-mono text-xl text-[#B0F5A0] pt-4">7. Contact</h2>
          <p>Built by Ghaisan Khoirul Badruzaman, Politeknik Negeri Bandung, Indonesia. For inquiries, open an issue at the GitHub repository.</p>
        </section>

        <div className="mt-12 pt-8 border-t border-[#F1ECE0]/10 text-sm opacity-60">
          <a href="/" className="hover:text-[#B0F5A0]">Back to home</a>
        </div>
      </div>
    </main>
  );
}

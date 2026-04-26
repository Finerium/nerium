export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#04060C] text-[#F1ECE0] px-6 py-16 md:px-12 lg:px-24">
      <div className="max-w-3xl mx-auto">
        <h1 className="font-mono text-3xl mb-2 text-[#B0F5A0]">Privacy Policy</h1>
        <p className="text-sm opacity-60 mb-8">Last updated: April 27, 2026</p>

        <section className="space-y-6 leading-relaxed">
          <p>This privacy policy describes how NERIUM handles user data during the Cerebral Valley plus Anthropic Built with Opus 4.7 hackathon, April 2026. NERIUM is a hackathon submission in test mode at evaluation time.</p>

          <h2 className="font-mono text-xl text-[#B0F5A0] pt-4">1. Data We Collect</h2>
          <p>NERIUM at submission state collects minimal data. If you provide an Anthropic API key under the bring-your-own-key pattern, the key is stored only in browser sessionStorage and never transmitted to NERIUM servers. Account-related data (if you create an account) includes email, hashed password, and Ed25519 public keypair for identity registry. Usage telemetry (page views, feature interactions) is collected via structlog server-side for debugging only.</p>

          <h2 className="font-mono text-xl text-[#B0F5A0] pt-4">2. Third-Party Services</h2>
          <p>NERIUM uses the following third-party services that may collect their own data per their respective policies: Vercel (hosting and CDN), Vercel Postgres via Neon (database), Upstash Redis (cache), Stripe (test mode payment processing, no real money), Resend (transactional email), and Anthropic (Claude API when bring-your-own-key is active). Refer to each provider for their individual privacy policies.</p>

          <h2 className="font-mono text-xl text-[#B0F5A0] pt-4">3. Cookies and Local Storage</h2>
          <p>NERIUM uses sessionStorage to persist a user-provided Anthropic API key during the active session only. No tracking cookies. No advertising cookies. No cross-site tracking.</p>

          <h2 className="font-mono text-xl text-[#B0F5A0] pt-4">4. Data Retention</h2>
          <p>Account data is retained while the account exists. Usage telemetry is retained for 30 days then purged. API keys provided via bring-your-own-key are never persisted server-side.</p>

          <h2 className="font-mono text-xl text-[#B0F5A0] pt-4">5. Your Rights</h2>
          <p>You may request data deletion by opening an issue at the GitHub repository. NERIUM commits to a 30-day response window during the hackathon evaluation period and shorter response times post-launch.</p>

          <h2 className="font-mono text-xl text-[#B0F5A0] pt-4">6. Children</h2>
          <p>NERIUM is not directed at children under 13. We do not knowingly collect data from children.</p>

          <h2 className="font-mono text-xl text-[#B0F5A0] pt-4">7. Changes</h2>
          <p>This privacy policy may be updated post-hackathon. The latest version will always be at this URL.</p>

          <h2 className="font-mono text-xl text-[#B0F5A0] pt-4">8. Contact</h2>
          <p>Built by Ghaisan Khoirul Badruzaman, Politeknik Negeri Bandung, Indonesia. For privacy inquiries, open an issue at the GitHub repository.</p>
        </section>

        <div className="mt-12 pt-8 border-t border-[#F1ECE0]/10 text-sm opacity-60">
          <a href="/" className="hover:text-[#B0F5A0]">Back to home</a>
        </div>
      </div>
    </main>
  );
}

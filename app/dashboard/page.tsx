//
// app/dashboard/page.tsx
//
// Iapetus W2 NP P4 S1. Creator dashboard placeholder. The full dashboard
// (Earnings Recharts line chart, Sales paginated table, Payout schedule,
// Listing performance) is CUT per V4 budget lock and ships post-hackathon.
//
// This stub surfaces the scaffold so:
//   1. The route resolves 200 rather than 404 during the demo walkthrough.
//   2. The "coming soon" banner frames the deferral honestly (NarasiGhaisan
//      Section 16 honesty filter).
//   3. The existing auth middleware mount pattern catches the route so we
//      can swap in the full dashboard without a routing table change.
//
// Session 2 work (CUT) will replace this file with:
//   - tabbed shell (Earnings, Sales, Payouts, Listings)
//   - EarningsChart (Recharts line)
//   - SalesTable (cursor pagination)
//   - PayoutSchedule (next + history)
//   - ListingPerformance card grid
//

import { HarnessShell } from '../_harness/HarnessShell';

export const metadata = {
  title: 'Creator Dashboard | NERIUM',
  description:
    'Marketplace creator earnings, sales, and payout surface. Coming soon.',
};

export default function DashboardPage() {
  return (
    <HarnessShell
      heading="Creator Dashboard"
      sub="Your marketplace earnings, sales history, and payout schedule live here."
    >
      <section
        style={{
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px',
          padding: '2rem',
          background: 'rgba(255,255,255,0.03)',
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: '1.25rem', fontWeight: 600 }}>
          Coming soon
        </h2>
        <p style={{ maxWidth: '56ch', lineHeight: 1.6, margin: '0.5rem 0 1rem' }}>
          Creator dashboard (earnings chart + sales table + payout schedule)
          ships post-hackathon. The backend surface under{' '}
          <code>/v1/commerce/*</code> is live in this build: Stripe Connect
          Express onboarding, marketplace purchase flow, review system, and
          revenue split are all wired. Only the dashboard visualisation layer
          is deferred per V4 budget lock.
        </p>
        <ul style={{ lineHeight: 1.8, paddingLeft: '1.2rem' }}>
          <li>Earnings over time (Recharts line chart, cumulative USD).</li>
          <li>Sales table (paginated via cursor).</li>
          <li>Payout schedule (next payout + history).</li>
          <li>Listing performance card grid (top-selling listings).</li>
        </ul>
        <p style={{ marginBottom: 0, opacity: 0.7 }}>
          See the Stripe Connect onboarding link in your creator settings
          surface to start accepting marketplace purchases.
        </p>
      </section>
    </HarnessShell>
  );
}

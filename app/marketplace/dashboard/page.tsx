//
// app/marketplace/dashboard/page.tsx
//
// Iapetus W2 NP S2. Creator dashboard route. Server component shell
// hydrates the seed data and renders the six widgets per spawn spec:
//
//   1. Listings overview grid
//   2. Earnings chart (12 months gross + net, inline SVG)
//   3. Recent transactions table (with Download invoice button)
//   4. Payout schedule status
//   5. Reviews list (sortable)
//   6. Quick actions
//
// The route lives under the marketplace prefix so it sits next to
// /marketplace/listings, /marketplace/browse, /marketplace/leads, etc.
// The pre-existing /dashboard stub is left in place so the older
// linking surface still resolves; it can redirect here in a follow-up.
//

import Link from 'next/link';
import { HarnessShell } from '../../_harness/HarnessShell';
import { EarningsChart } from './EarningsChart';
import { ListingsGrid } from './ListingsGrid';
import { PayoutPanel } from './PayoutPanel';
import { ReviewsList } from './ReviewsList';
import { TransactionsTable } from './TransactionsTable';
import { DASHBOARD_SEED, formatUsdCents } from './seedData';

export const metadata = {
  title: 'Creator Dashboard | NERIUM Marketplace',
  description:
    'Marketplace creator earnings, sales history, payout schedule, and reviews. Built for the NERIUM hackathon prototype.',
};

export default function CreatorDashboardPage() {
  const seed = DASHBOARD_SEED;
  const totalRevenueCents = seed.earnings.reduce((sum, m) => sum + m.grossCents, 0);
  const ytdNetCents = seed.earnings
    .filter((m) => m.month.startsWith('2026'))
    .reduce((sum, m) => sum + m.netCents, 0);
  const activeListings = seed.listings.filter((l) => l.status === 'published').length;
  const avgRating =
    seed.listings.filter((l) => l.reviewCount > 0).reduce(
      (sum, l) => sum + l.averageRating,
      0,
    ) / Math.max(1, seed.listings.filter((l) => l.reviewCount > 0).length);

  return (
    <HarnessShell
      heading={`Creator dashboard, ${seed.creator.displayName}`}
      sub="Earnings, sales, payouts, and reviews for your marketplace listings. Demo seeded with cached commerce data; the live read endpoint /v1/commerce/dashboard ships post-hackathon."
    >
      <section
        aria-label="Top-level stats"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        <SummaryCard label="Total revenue" value={formatUsdCents(totalRevenueCents)} accent />
        <SummaryCard label="Net YTD 2026" value={formatUsdCents(ytdNetCents)} />
        <SummaryCard label="Active listings" value={String(activeListings)} />
        <SummaryCard
          label="Avg rating"
          value={Number.isFinite(avgRating) ? `${avgRating.toFixed(2)} / 5` : 'No reviews'}
        />
      </section>

      <SectionShell title="Quick actions">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <Action href="/creator/submit" primary>
            Add new listing
          </Action>
          <Action href="/marketplace">View public marketplace</Action>
          <Action href="/marketplace/listings">All my listings</Action>
          <Action href="/banking">Banking & subscriptions</Action>
        </div>
      </SectionShell>

      <SectionShell title="Earnings, last 12 months">
        <EarningsChart data={seed.earnings} />
      </SectionShell>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
          gap: '20px',
          marginBottom: '24px',
        }}
        className="dash-two-col"
      >
        <SectionShell title="Recent transactions">
          <TransactionsTable transactions={seed.transactions} />
        </SectionShell>
        <SectionShell title="Payout">
          <PayoutPanel payout={seed.payout} verified={seed.creator.verified} />
        </SectionShell>
      </div>

      <SectionShell title="Listings overview">
        <ListingsGrid listings={seed.listings} />
      </SectionShell>

      <SectionShell title="Reviews">
        <ReviewsList reviews={seed.reviews} />
      </SectionShell>

      <style>{`
        @media (max-width: 960px) {
          .dash-two-col {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </HarnessShell>
  );
}

function SummaryCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: 'oklch(0.18 0.015 250)',
        border: '1px solid oklch(0.32 0.02 250)',
        borderRadius: '10px',
        padding: '14px 16px',
      }}
    >
      <div
        style={{
          fontSize: '11px',
          color: 'oklch(0.6 0.02 250)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontFamily: 'JetBrains Mono, monospace',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: '6px',
          fontSize: '20px',
          fontWeight: 600,
          color: accent ? 'oklch(0.85 0.18 140)' : 'oklch(0.92 0.02 250)',
          fontFamily: 'JetBrains Mono, monospace',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SectionShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '24px' }}>
      <h2
        style={{
          margin: '0 0 12px',
          fontSize: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'oklch(0.6 0.02 250)',
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 500,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Action({
  href,
  primary = false,
  children,
}: {
  href: string;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '8px 14px',
        borderRadius: '6px',
        background: primary ? 'oklch(0.85 0.18 140)' : 'transparent',
        color: primary ? 'oklch(0.14 0.012 250)' : 'oklch(0.85 0.18 140)',
        border: `1px solid ${primary ? 'oklch(0.85 0.18 140)' : 'oklch(0.55 0.12 140)'}`,
        fontSize: '12px',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        fontFamily: 'JetBrains Mono, monospace',
        textDecoration: 'none',
        fontWeight: 600,
      }}
    >
      {children}
    </Link>
  );
}

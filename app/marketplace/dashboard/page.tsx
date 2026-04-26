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
// T7 pixel-art skin layered 2026-04-26. SummaryCard + SectionShell +
// Action helpers re-skinned via the .t7-marketplace-stat-card,
// .t7-marketplace-section, and .t7-marketplace-action classes declared
// in src/styles/marketplace-pixel-art.css. Existing chart + table +
// payout + reviews components render unchanged inside the new chrome.
//
// The route lives under the marketplace prefix so it sits next to
// /marketplace/listings, /marketplace/browse, /marketplace/leads, etc.
// The pre-existing /dashboard stub is left in place so the older
// linking surface still resolves; it can redirect here in a follow-up.
//

import { HarnessShell } from '../../_harness/HarnessShell';
import { EarningsChart } from './EarningsChart';
import { ListingsGrid } from './ListingsGrid';
import { PayoutPanel } from './PayoutPanel';
import { ReviewsList } from './ReviewsList';
import { TransactionsTable } from './TransactionsTable';
import { DASHBOARD_SEED, formatUsdCents } from './seedData';
import { T7MarketplacePixelShell } from '../../../src/components/marketplace/T7MarketplacePixelShell';

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
      <T7MarketplacePixelShell
        eyebrow={`Caravan ledger, ${seed.creator.displayName}`}
        heading="Creator dashboard"
        tagline="Earnings, sales, payouts, and reviews for your marketplace listings. Stats hydrated from seed commerce data; the live /v1/commerce/dashboard endpoint ships post-hackathon."
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
          <T7SummaryCard
            label="Total revenue"
            value={formatUsdCents(totalRevenueCents)}
            accent
          />
          <T7SummaryCard label="Net YTD 2026" value={formatUsdCents(ytdNetCents)} />
          <T7SummaryCard label="Active listings" value={String(activeListings)} />
          <T7SummaryCard
            label="Avg rating"
            value={
              Number.isFinite(avgRating) ? `${avgRating.toFixed(2)} / 5` : 'No reviews'
            }
          />
        </section>

        <T7Section title="Quick actions">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <T7Action href="/creator/submit" primary>
              Add new listing
            </T7Action>
            <T7Action href="/marketplace">View public marketplace</T7Action>
            <T7Action href="/marketplace/listings">All my listings</T7Action>
            <T7Action href="/banking">Banking and subscriptions</T7Action>
          </div>
        </T7Section>

        <T7Section title="Earnings, last 12 months">
          <EarningsChart data={seed.earnings} />
        </T7Section>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
            gap: '20px',
            marginBottom: '24px',
          }}
          className="dash-two-col"
        >
          <T7Section title="Recent transactions">
            <TransactionsTable transactions={seed.transactions} />
          </T7Section>
          <T7Section title="Payout">
            <PayoutPanel payout={seed.payout} verified={seed.creator.verified} />
          </T7Section>
        </div>

        <T7Section title="Listings overview">
          <ListingsGrid listings={seed.listings} />
        </T7Section>

        <T7Section title="Reviews">
          <ReviewsList reviews={seed.reviews} />
        </T7Section>

        <style>{`
          @media (max-width: 960px) {
            .dash-two-col {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </T7MarketplacePixelShell>
    </HarnessShell>
  );
}

function T7SummaryCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="t7-marketplace-stat-card">
      <div className="t7-stat-label">{label}</div>
      <div className="t7-stat-value" data-accent={accent ? 'true' : 'false'}>
        {value}
      </div>
    </div>
  );
}

function T7Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="t7-marketplace-section">
      <h2 className="t7-section-title">{title}</h2>
      {children}
    </section>
  );
}

function T7Action({
  href,
  primary = false,
  children,
}: {
  href: string;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="t7-marketplace-action"
      data-primary={primary ? 'true' : 'false'}
    >
      {children}
    </a>
  );
}

//
// app/marketplace/dashboard/seedData.ts
//
// Iapetus W2 NP S2. Seed data for the creator dashboard. The harness
// banner above declares "Worker components rendered against cached or
// seed data" so this module is the canonical source while the live
// /v1/commerce/dashboard read endpoint ships post-hackathon.
//
// Shapes here are stable so the eventual SWR fetch can swap in without
// touching the component tree. Currency amounts are minor units (USD
// cents) per the BIGINT-everywhere convention so the renderer stays
// integer-safe. The transactions[] entries carry a real-shape UUID v7
// that the invoice-download button will pass to the
// /v1/billing/invoices/{invoice_id}.pdf endpoint.
//

export type ListingStatus = 'published' | 'draft' | 'archived';

export interface DashboardListing {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly status: ListingStatus;
  readonly executionsLast30d: number;
  readonly revenueCentsLast30d: number;
  readonly averageRating: number;
  readonly reviewCount: number;
}

export interface MonthlyEarning {
  readonly month: string;
  readonly grossCents: number;
  readonly netCents: number;
}

export interface DashboardTransaction {
  readonly purchaseId: string;
  readonly listingTitle: string;
  readonly buyerHandle: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: 'completed' | 'pending' | 'refunded' | 'failed';
  readonly occurredAt: string;
}

export interface PayoutSchedule {
  readonly cadence: 'monthly' | 'weekly';
  readonly nextPayoutDate: string;
  readonly pendingBalanceCents: number;
  readonly lastPayoutCents: number;
  readonly lastPayoutDate: string;
}

export interface DashboardReview {
  readonly id: string;
  readonly listingTitle: string;
  readonly rating: 1 | 2 | 3 | 4 | 5;
  readonly text: string;
  readonly author: string;
  readonly createdAt: string;
}

export interface DashboardSeed {
  readonly creator: { readonly displayName: string; readonly verified: boolean };
  readonly listings: ReadonlyArray<DashboardListing>;
  readonly earnings: ReadonlyArray<MonthlyEarning>;
  readonly transactions: ReadonlyArray<DashboardTransaction>;
  readonly payout: PayoutSchedule;
  readonly reviews: ReadonlyArray<DashboardReview>;
}

export const DASHBOARD_SEED: DashboardSeed = {
  creator: { displayName: 'Apollo Builder', verified: true },
  listings: [
    {
      id: '01890001-0000-7000-8000-000000000001',
      title: 'XAU/USD algorithmic trading signal pack',
      category: 'core_agent',
      status: 'published',
      executionsLast30d: 412,
      revenueCentsLast30d: 198000,
      averageRating: 4.7,
      reviewCount: 38,
    },
    {
      id: '01890001-0000-7000-8000-000000000002',
      title: 'Restaurant ops automation bundle',
      category: 'services',
      status: 'published',
      executionsLast30d: 87,
      revenueCentsLast30d: 156000,
      averageRating: 4.9,
      reviewCount: 19,
    },
    {
      id: '01890001-0000-7000-8000-000000000003',
      title: 'Indonesian SME compliance reviewer',
      category: 'services',
      status: 'published',
      executionsLast30d: 54,
      revenueCentsLast30d: 81000,
      averageRating: 4.5,
      reviewCount: 11,
    },
    {
      id: '01890001-0000-7000-8000-000000000004',
      title: 'Cyberpunk Shanghai sprite pack v2 (draft)',
      category: 'assets',
      status: 'draft',
      executionsLast30d: 0,
      revenueCentsLast30d: 0,
      averageRating: 0,
      reviewCount: 0,
    },
  ],
  earnings: [
    { month: '2025-05', grossCents: 124300, netCents: 99440 },
    { month: '2025-06', grossCents: 138900, netCents: 111120 },
    { month: '2025-07', grossCents: 156400, netCents: 125120 },
    { month: '2025-08', grossCents: 178200, netCents: 142560 },
    { month: '2025-09', grossCents: 204500, netCents: 163600 },
    { month: '2025-10', grossCents: 221800, netCents: 177440 },
    { month: '2025-11', grossCents: 248900, netCents: 199120 },
    { month: '2025-12', grossCents: 267400, netCents: 213920 },
    { month: '2026-01', grossCents: 289100, netCents: 231280 },
    { month: '2026-02', grossCents: 312700, netCents: 250160 },
    { month: '2026-03', grossCents: 358200, netCents: 286560 },
    { month: '2026-04', grossCents: 435000, netCents: 348000 },
  ],
  transactions: buildSeedTransactions(),
  payout: {
    cadence: 'weekly',
    nextPayoutDate: '2026-04-29',
    pendingBalanceCents: 173400,
    lastPayoutCents: 286560,
    lastPayoutDate: '2026-04-22',
  },
  reviews: [
    {
      id: 'rev_01',
      listingTitle: 'XAU/USD algorithmic trading signal pack',
      rating: 5,
      text: 'Backtest matched live within 0.4% spread over a month. Solid.',
      author: 'r***@trading.example',
      createdAt: '2026-04-25T08:14:00Z',
    },
    {
      id: 'rev_02',
      listingTitle: 'Restaurant ops automation bundle',
      rating: 5,
      text: 'Cut my Friday close from 2 hours to 35 minutes.',
      author: 'm***@warung.example',
      createdAt: '2026-04-24T11:02:00Z',
    },
    {
      id: 'rev_03',
      listingTitle: 'Indonesian SME compliance reviewer',
      rating: 4,
      text: 'Caught a missing PPN line item. Wish onboarding was shorter.',
      author: 'd***@umkm.example',
      createdAt: '2026-04-23T16:48:00Z',
    },
    {
      id: 'rev_04',
      listingTitle: 'XAU/USD algorithmic trading signal pack',
      rating: 4,
      text: 'Good model card. Would pay more for backtest as a service tier.',
      author: 'n***@gmail.example',
      createdAt: '2026-04-22T09:31:00Z',
    },
    {
      id: 'rev_05',
      listingTitle: 'Restaurant ops automation bundle',
      rating: 5,
      text: 'Even my non-tech ibu can use it. That is the bar.',
      author: 'a***@kafe.example',
      createdAt: '2026-04-21T19:22:00Z',
    },
  ],
};

function buildSeedTransactions(): ReadonlyArray<DashboardTransaction> {
  const baseTime = new Date('2026-04-26T03:00:00Z').getTime();
  const items: Array<{
    title: string;
    handle: string;
    amount: number;
    status: DashboardTransaction['status'];
  }> = [
    { title: 'XAU/USD algorithmic trading signal pack', handle: 'r***@trading.example', amount: 4900, status: 'completed' },
    { title: 'Restaurant ops automation bundle', handle: 'm***@warung.example', amount: 17900, status: 'completed' },
    { title: 'XAU/USD algorithmic trading signal pack', handle: 'k***@quant.example', amount: 4900, status: 'completed' },
    { title: 'Indonesian SME compliance reviewer', handle: 'd***@umkm.example', amount: 12500, status: 'completed' },
    { title: 'XAU/USD algorithmic trading signal pack', handle: 't***@hedge.example', amount: 4900, status: 'pending' },
    { title: 'Restaurant ops automation bundle', handle: 'a***@kafe.example', amount: 17900, status: 'completed' },
    { title: 'XAU/USD algorithmic trading signal pack', handle: 'p***@retail.example', amount: 4900, status: 'completed' },
    { title: 'Indonesian SME compliance reviewer', handle: 'b***@usaha.example', amount: 12500, status: 'refunded' },
    { title: 'XAU/USD algorithmic trading signal pack', handle: 's***@fund.example', amount: 4900, status: 'completed' },
    { title: 'Restaurant ops automation bundle', handle: 'n***@warmindo.example', amount: 17900, status: 'completed' },
  ];
  return items.map((row, idx) => ({
    purchaseId: paddedUuid(idx + 1),
    listingTitle: row.title,
    buyerHandle: row.handle,
    amountCents: row.amount,
    currency: 'USD',
    status: row.status,
    occurredAt: new Date(baseTime - idx * 4 * 3600_000).toISOString(),
  }));
}

function paddedUuid(seed: number): string {
  const hex = seed.toString(16).padStart(12, '0');
  return `01890002-0000-7000-8000-${hex}`;
}

export function formatUsdCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}USD ${whole.toLocaleString('en-US')}.${frac.toString().padStart(2, '0')}`;
}

export function formatMonthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split('-');
  const monthIdx = Number(m) - 1;
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[monthIdx]} ${y.slice(2)}`;
}

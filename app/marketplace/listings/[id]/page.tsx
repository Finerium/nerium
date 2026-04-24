//
// app/marketplace/listings/[id]/page.tsx
//
// Minimal detail-page landing after a publish redirect. Renders a
// placeholder with the listing id; Hyperion and Iapetus will later compose
// the full detail view via the /v1/marketplace/listings/{id} endpoint.
//

import Link from 'next/link';
import { HarnessShell } from '../../../_harness/HarnessShell';

export default async function ListingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ published?: string }>;
}) {
  const { id } = await params;
  const { published } = await searchParams;
  return (
    <HarnessShell
      heading="Marketplace listing"
      sub="Detail page stub. Full render (card, trust score, purchase flow) shipped by Hyperion + Iapetus + Astraea downstream."
    >
      <div
        style={{
          maxWidth: 720,
          margin: '2rem auto',
          padding: '1.5rem',
          borderRadius: '0.75rem',
          border: '1px solid var(--color-border, #24244c)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
        data-testid="listing-detail-stub"
      >
        {published === '1' ? (
          <p
            style={{ margin: 0, color: 'var(--color-accent, #00f0ff)' }}
            data-testid="publish-toast"
          >
            Publish complete. Welcome to the Marketplace.
          </p>
        ) : null}
        <h2 style={{ margin: 0 }}>Listing {id}</h2>
        <p style={{ margin: 0, opacity: 0.8 }}>
          Fetch the full projection via <code>GET /v1/marketplace/listings/{id}</code>.
          The creator submission wizard has handed control back to the public
          Marketplace surface.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link
            href="/marketplace"
            style={{
              padding: '0.55rem 1rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--color-border, #24244c)',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            Back to Marketplace
          </Link>
          <Link
            href="/creator/submit"
            style={{
              padding: '0.55rem 1rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--color-border, #24244c)',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            Publish another listing
          </Link>
        </div>
      </div>
    </HarnessShell>
  );
}

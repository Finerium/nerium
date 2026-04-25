//
// app/marketplace/dashboard/TransactionsTable.tsx
//
// Iapetus W2 NP S2 + Plutus W2 NP S2 cross-cut.
//
// Recent transactions table with a per-row "Download invoice" button
// that calls GET /v1/billing/invoices/{purchase_id}.pdf, gets a PDF
// blob back, and triggers a browser save dialog. The endpoint is
// auth-gated via the Aether middleware stack so the fetch needs
// credentials: 'include' (the Aether HS256 cookie or bearer token sits
// on the same origin in the demo build).
//
// Rendering note. This is a client component because the download
// flow needs window.URL.createObjectURL + a synthetic <a download>
// click. The parent page is a server component; only the interactive
// pieces hydrate.
//

'use client';

import { useCallback, useState } from 'react';
import { formatUsdCents, type DashboardTransaction } from './seedData';

interface Props {
  readonly transactions: ReadonlyArray<DashboardTransaction>;
}

const STATUS_COLOR: Record<DashboardTransaction['status'], string> = {
  completed: 'oklch(0.78 0.16 145)',
  pending: 'oklch(0.78 0.17 80)',
  refunded: 'oklch(0.7 0.14 50)',
  failed: 'oklch(0.7 0.18 25)',
};

export function TransactionsTable({ transactions }: Props) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  const handleDownload = useCallback(async (purchaseId: string) => {
    setDownloadingId(purchaseId);
    setErrorId(null);
    try {
      const res = await fetch(`/v1/billing/invoices/${purchaseId}.pdf`, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/pdf' },
      });
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nerium-invoice-${purchaseId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (_err) {
      setErrorId(purchaseId);
    } finally {
      setDownloadingId(null);
    }
  }, []);

  return (
    <div
      style={{
        background: 'oklch(0.18 0.015 250)',
        borderRadius: '12px',
        border: '1px solid oklch(0.32 0.02 250)',
        overflow: 'hidden',
      }}
    >
      <div
        role="table"
        aria-label="Recent marketplace transactions"
        style={{ width: '100%', fontFamily: 'JetBrains Mono, monospace', fontSize: '13px' }}
      >
        <div
          role="row"
          style={{
            display: 'grid',
            gridTemplateColumns: '2.4fr 1.4fr 1fr 1fr 1.2fr 1fr',
            padding: '10px 16px',
            background: 'oklch(0.22 0.018 250)',
            color: 'oklch(0.6 0.02 250)',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            borderBottom: '1px solid oklch(0.32 0.02 250)',
          }}
        >
          <span role="columnheader">Listing</span>
          <span role="columnheader">Buyer</span>
          <span role="columnheader" style={{ textAlign: 'right' }}>
            Amount
          </span>
          <span role="columnheader">Status</span>
          <span role="columnheader">When</span>
          <span role="columnheader" style={{ textAlign: 'right' }}>
            Invoice
          </span>
        </div>

        {transactions.map((tx) => {
          const downloading = downloadingId === tx.purchaseId;
          const failed = errorId === tx.purchaseId;
          return (
            <div
              key={tx.purchaseId}
              role="row"
              style={{
                display: 'grid',
                gridTemplateColumns: '2.4fr 1.4fr 1fr 1fr 1.2fr 1fr',
                padding: '12px 16px',
                color: 'oklch(0.85 0.02 250)',
                borderBottom: '1px solid oklch(0.26 0.018 250)',
                alignItems: 'center',
              }}
            >
              <span role="cell" style={{ fontFamily: 'Space Grotesk, system-ui, sans-serif' }}>
                {tx.listingTitle}
              </span>
              <span role="cell" style={{ color: 'oklch(0.7 0.02 250)' }}>
                {tx.buyerHandle}
              </span>
              <span role="cell" style={{ textAlign: 'right', color: 'oklch(0.85 0.18 140)' }}>
                {formatUsdCents(tx.amountCents)}
              </span>
              <span role="cell">
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: STATUS_COLOR[tx.status],
                    color: 'oklch(0.14 0.012 250)',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  {tx.status}
                </span>
              </span>
              <span role="cell" style={{ color: 'oklch(0.7 0.02 250)' }}>
                {new Date(tx.occurredAt).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span role="cell" style={{ textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={() => handleDownload(tx.purchaseId)}
                  disabled={downloading}
                  aria-label={`Download invoice PDF for ${tx.listingTitle}`}
                  style={{
                    background: 'transparent',
                    border: '1px solid oklch(0.55 0.12 140)',
                    color: 'oklch(0.85 0.18 140)',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    cursor: downloading ? 'progress' : 'pointer',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    transition: 'background 120ms ease, color 120ms ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'oklch(0.85 0.18 140)';
                    e.currentTarget.style.color = 'oklch(0.14 0.012 250)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'oklch(0.85 0.18 140)';
                  }}
                >
                  {downloading ? 'Loading' : failed ? 'Retry' : 'PDF'}
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

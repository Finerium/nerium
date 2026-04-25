//
// app/marketplace/dashboard/PayoutPanel.tsx
//
// Iapetus W2 NP S2. Payout schedule status panel.
//
// Surfaces the current Stripe Connect payout cadence (monthly default
// for Standard creators, weekly for Verified per Iapetus contract
// Section 4.5), the next payout date, the pending balance, and the
// last payout amount + date.
//

import { formatUsdCents, type PayoutSchedule } from './seedData';

interface Props {
  readonly payout: PayoutSchedule;
  readonly verified: boolean;
}

export function PayoutPanel({ payout, verified }: Props) {
  const cadenceLabel = payout.cadence === 'weekly' ? 'Weekly' : 'Monthly';
  const next = new Date(payout.nextPayoutDate);
  const last = new Date(payout.lastPayoutDate);

  return (
    <div
      style={{
        background: 'oklch(0.18 0.015 250)',
        border: '1px solid oklch(0.32 0.02 250)',
        borderRadius: '12px',
        padding: '20px',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '20px',
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: '14px',
              color: 'oklch(0.6 0.02 250)',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            Payout schedule
          </h3>
          <p
            style={{
              margin: '4px 0 0',
              color: 'oklch(0.92 0.02 250)',
              fontSize: '20px',
              fontWeight: 600,
              fontFamily: 'Space Grotesk, system-ui, sans-serif',
            }}
          >
            {cadenceLabel}
          </p>
        </div>
        {verified ? (
          <span
            style={{
              padding: '3px 10px',
              borderRadius: '4px',
              background: 'oklch(0.85 0.18 140)',
              color: 'oklch(0.14 0.012 250)',
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            Verified
          </span>
        ) : null}
      </header>

      <dl style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: 0 }}>
        <Row
          label="Pending balance"
          value={formatUsdCents(payout.pendingBalanceCents)}
          accent
        />
        <Row
          label="Next payout"
          value={next.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })}
        />
        <Row
          label="Last payout"
          value={`${formatUsdCents(payout.lastPayoutCents)} on ${last.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}`}
        />
      </dl>

      <p
        style={{
          marginTop: '16px',
          color: 'oklch(0.55 0.02 250)',
          fontSize: '11px',
          fontFamily: 'JetBrains Mono, monospace',
          lineHeight: 1.5,
        }}
      >
        Stripe test mode. No live payouts pre-Atlas verification.
      </p>
    </div>
  );
}

function Row({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <dt
        style={{
          color: 'oklch(0.6 0.02 250)',
          fontSize: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontFamily: 'JetBrains Mono, monospace',
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          margin: 0,
          color: accent ? 'oklch(0.85 0.18 140)' : 'oklch(0.92 0.02 250)',
          fontSize: '15px',
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 600,
        }}
      >
        {value}
      </dd>
    </div>
  );
}

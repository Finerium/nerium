//
// postcss.config.mjs
//
// Nemea Phase 5 QA emergency harness (2026-04-22). Missing from the initial
// scaffold; Tailwind v4 requires the @tailwindcss/postcss plugin to compile
// utility classes used pervasively across Worker components (WalletCard,
// LiveCostMeter, TransactionPulse, etc). Without this config the harness
// renders unstyled Tailwind classes.
//
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;

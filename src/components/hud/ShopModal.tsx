'use client';

//
// src/components/hud/ShopModal.tsx
//
// Gated modal: `useUIStore.shopOpen`. Opens via `toggleShop()` or an
// incoming `game.shop.open` event translated by BusBridge. Closes via
// the close button, the Escape key, or clicking the backdrop.
//
// Content: seeds a compact catalog by reading Demeter's V3 mock catalog
// (KEEP per REUSE_REWRITE_MATRIX Section 10). The listing surface is
// intentionally minimal for the RV vertical slice; full ShopModal content
// is a post-hackathon refactor.
//

import { useEffect, useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { useT } from '../../lib/i18n';
import { useUIStore } from '../../stores/uiStore';
import { useInventoryStore } from '../../stores/inventoryStore';
import { HONEST_CLAIM_LOCKED_TEXT } from '../../../app/protocol/vendor/annotation_text.constant';
import { formatCurrency } from '../../../app/banking/meter/cost_ticker';
import { emitBusEvent } from '../../lib/hudBus';

interface ShopListing {
  id: string;
  name: string;
  vendor: string;
  priceUsd: number;
}

const SEED_LISTINGS: ReadonlyArray<ShopListing> = [
  { id: 'apollo.advisor.v1', name: 'Apollo Advisor', vendor: 'NERIUM', priceUsd: 0 },
  { id: 'lumio.blueprint', name: 'Lumio Blueprint', vendor: 'NERIUM', priceUsd: 4.2 },
  { id: 'restaurant-ops.v2', name: 'Restaurant Ops Agent', vendor: 'Community', priceUsd: 9.9 },
  { id: 'clinic-daily.v1', name: 'Clinic Daily Ops', vendor: 'Community', priceUsd: 6.5 },
];

export function ShopModal() {
  const shopOpen = useUIStore((s) => s.shopOpen);
  const toggleShop = useUIStore((s) => s.toggleShop);
  const deductCurrency = useInventoryStore((s) => s.deductCurrency);
  const award = useInventoryStore((s) => s.award);
  const t = useT();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!shopOpen) return;
    const onKey = (evt: KeyboardEvent) => {
      if (evt.key === 'Escape') {
        toggleShop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shopOpen, toggleShop]);

  const listings = useMemo(() => SEED_LISTINGS, []);

  const handlePurchase = (listing: ShopListing) => {
    if (listing.priceUsd > 0 && !deductCurrency('USD', listing.priceUsd)) {
      emitBusEvent('game.inventory.rejected', {
        itemId: listing.id,
        reason: 'insufficient_funds',
      });
      return;
    }
    award(listing.id, 1);
    emitBusEvent('game.shop.purchase_completed', {
      orderId: `order-${Date.now()}`,
      itemId: listing.id,
      quantity: 1,
      totalUsd: listing.priceUsd,
    });
  };

  return (
    <AnimatePresence>
      {shopOpen ? (
        <motion.div
          key="shop-modal"
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          role="dialog"
          aria-modal="true"
          aria-label={t('shop.title')}
          data-hud-role="shop-modal"
        >
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={toggleShop}
            aria-hidden="true"
          />
          <motion.section
            className="relative z-10 flex max-h-[80vh] w-full max-w-xl flex-col gap-3 rounded-lg border border-border bg-background/95 p-5 shadow-2xl"
            initial={reducedMotion ? false : { y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { y: 16, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <header className="flex items-start justify-between gap-3 border-b border-border/60 pb-3">
              <div className="flex flex-col">
                <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">
                  {t('shop.title')}
                </span>
                <span className="font-mono text-xs text-foreground/60">
                  {t('shop.subtitle')}
                </span>
              </div>
              <button
                type="button"
                onClick={toggleShop}
                className="rounded-md border border-border bg-background/70 px-3 py-1 font-mono text-xs text-foreground/80 hover:border-ring hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label={t('shop.close')}
              >
                {t('shop.close')}
              </button>
            </header>
            <div className="rounded-md border border-border/60 bg-background/70 px-3 py-2 font-mono text-[10px] text-foreground/60">
              <span className="font-semibold uppercase tracking-wider text-foreground/75">
                {t('shop.honest_claim_heading')}:
              </span>{' '}
              {HONEST_CLAIM_LOCKED_TEXT}
            </div>
            {listings.length === 0 ? (
              <p className="font-mono text-xs text-foreground/60">
                {t('shop.empty')}
              </p>
            ) : (
              <ul className="flex flex-col gap-2 overflow-y-auto pr-1" role="list">
                {listings.map((listing) => {
                  const priceFmt = formatCurrency(listing.priceUsd, 'USD').formatted;
                  return (
                    <li
                      key={listing.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/70 px-3 py-2"
                    >
                      <div className="flex flex-col">
                        <span className="font-mono text-sm text-foreground">
                          {listing.name}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-foreground/50">
                          {listing.vendor}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs tabular-nums text-primary">
                          {listing.priceUsd === 0 ? 'Free' : priceFmt}
                        </span>
                        <button
                          type="button"
                          onClick={() => handlePurchase(listing)}
                          className="rounded-md bg-primary px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-background hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          {t('shop.cta_purchase')}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default ShopModal;

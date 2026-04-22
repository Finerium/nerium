// app/marketplace/browse/types.ts
//
// NERIUM Marketplace browse surface types.
// Conforms to docs/contracts/browse_ui.contract.md v0.1.0 Section 3.
// Authoring agent: Artemis (P3a Marketplace Worker, Browse).

import type {
  AgentListing,
  CapabilityTag,
  VendorOrigin,
  PricingTier,
} from '../schema/listing.schema';

export interface BrowseFilter {
  capability_tag?: CapabilityTag;
  vendor_origin?: VendorOrigin;
  pricing_tier?: PricingTier;
}

export interface BrowseSortOrder {
  kind: 'recent' | 'trust_weighted' | 'curator_picked' | 'popular';
}

export interface BrowseCanvasProps {
  filter: BrowseFilter;
  sort: BrowseSortOrder;
  onFilterChange: (next: BrowseFilter) => void;
  onSortChange: (next: BrowseSortOrder) => void;
  onListingClick: (listing_id: string) => void;
  pageSize?: number;
}

export interface CategoryNavProps {
  capabilities: Array<{ tag: CapabilityTag; display_label: string; count: number }>;
  activeTag?: CapabilityTag;
  onTagSelect: (tag?: CapabilityTag) => void;
}

export interface VendorFilterProps {
  vendors: Array<{ vendor: VendorOrigin; display_label: string; count: number }>;
  selected: VendorOrigin[];
  onToggle: (vendor: VendorOrigin) => void;
}

export interface FeaturedAgentsProps {
  featured: AgentListing[];
  onListingClick: (listing_id: string) => void;
}

export interface ListingCardProps {
  listing: AgentListing;
  onClick: (listing_id: string) => void;
  trust_band_hint?: 'unverified' | 'emerging' | 'established' | 'trusted' | 'elite';
  featured?: boolean;
}

export const CAPABILITY_LABELS: Record<CapabilityTag, string> = {
  code_generation: 'Code Generation',
  research: 'Research',
  data_extraction: 'Data Extraction',
  customer_support: 'Customer Support',
  marketing_copy: 'Marketing Copy',
  design_asset: 'Design Asset',
  video_generation: 'Video Generation',
  trading_signal: 'Trading Signal',
  domain_automation: 'Domain Automation',
  analysis: 'Analysis',
  other: 'Other',
};

export const VENDOR_LABELS: Record<VendorOrigin, string> = {
  hand_coded: 'Hand Coded',
  cursor: 'Cursor',
  claude_code: 'Claude Code',
  replit: 'Replit Agent',
  bolt: 'Bolt',
  lovable: 'Lovable',
  claude_skills: 'Claude Skills',
  gpt_store: 'GPT Store',
  mcp_hub: 'MCP Hub',
  huggingface_space: 'Hugging Face Space',
  langchain_hub: 'LangChain Hub',
  vercel_gallery: 'Vercel Agent Gallery',
  cloudflare_marketplace: 'Cloudflare AI Marketplace',
  nerium_builder: 'NERIUM Builder',
  other: 'Other',
};

export const PRICING_LABELS: Record<PricingTier, string> = {
  free: 'Free',
  cheap: 'Cheap',
  mid: 'Mid',
  premium: 'Premium',
};

export const BROWSE_EVENT_TOPICS = {
  opened: 'marketplace.browse.opened',
  listing_clicked: 'marketplace.browse.listing_clicked',
  filter_changed: 'marketplace.browse.filter_changed',
} as const;

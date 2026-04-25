---
name: stripe_connect_onboarding
description: Skill that walks marketplace creators through Stripe Connect Express account creation, KYC verification, payout schedule setup, and tax document collection. Cuts new-creator onboarding time from 2 hours to 12 minutes.
category: skill
tags:
  - stripe
  - onboarding
  - marketplace
  - payments
  - kyc
price_usd: 10
creator_id: demo_creator_003
license: marketplace_default
runtime_compatibility:
  - anthropic_opus_4.7
  - anthropic_sonnet_4.6
  - openai_gpt_5
created_at: 2026-04-26T00:00:00Z
---

# Stripe Connect Onboarding

## Purpose

Conversational onboarding skill for marketplace platforms that need new creators to set up Stripe Connect Express accounts with minimum friction. Replaces the standard Stripe-hosted onboarding flow which typically requires creators to fill 30+ form fields across 4 screens, with high abandonment rate.

Conversational format walks creator through the same data collection in plain language, validates inputs, surfaces error states immediately, generates the Stripe Connect account programmatically once all required fields collected, and triggers KYC document upload via secure link.

## Capability

5-stage conversational flow:

1. **Identity verification**: collects full legal name, date of birth, government ID number, citizenship country
2. **Banking details**: bank account routing, account number, validates against country bank registry
3. **Tax document collection**: walks through W-9 (US) or local equivalent (NPWP for Indonesia), generates fillable PDF, collects signature
4. **Business profile**: business type, industry category, expected monthly volume, currency preference
5. **Payout schedule**: daily, weekly, monthly cadence, threshold trigger, hold period preference

Outputs Stripe Connect account_id ready for charge.create transactions, plus webhook subscription for KYC status updates.

## Example usage

Marketplace user clicks "Become a Creator." Skill activates conversational flow:

> Skill: "Welcome. To accept payments through this marketplace, we need to set up your Stripe Connect account. This takes about 12 minutes. Ready to start?"
> Creator: "Yes."
> Skill: "Great. First, what's your full legal name as it appears on your government ID?"
> Creator: "Adi Pratama"
> Skill: "Got it. Date of birth?"
> ... (continues through 5 stages)

After completion: account_id generated, KYC document upload link sent via email, dashboard refreshes showing creator status as "active, pending verification."

## Pricing

USD 10 per onboarded creator (one-time fee, not subscription). Revenue share to creator of skill: 70 percent. NERIUM platform fee: 30 percent. Volume discount: 50 percent off after 100 onboardings per month.

## License

Marketplace default license. Buyer integrates skill into their marketplace. Stripe API credentials must be provided by buyer (skill does not include Stripe account). Skill is country-specific currently for US, Indonesia, Singapore, Malaysia.

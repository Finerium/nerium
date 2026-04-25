---
name: indonesian_tax_calculator_mcp
description: MCP server that calculates Indonesian PPh, PPN, and PBJT for individuals and businesses. Up-to-date with 2026 regulations including UMKM exemption thresholds and progressive rate brackets.
category: mcp
tags:
  - tax
  - indonesia
  - finance
  - mcp_server
  - compliance
price_usd: 5
creator_id: demo_creator_002
license: marketplace_default
runtime_compatibility:
  - anthropic_opus_4.7
  - anthropic_sonnet_4.6
  - anthropic_haiku_4.5
  - google_gemini_pro
created_at: 2026-04-26T00:00:00Z
---

# Indonesian Tax Calculator MCP

## Purpose

Model Context Protocol server exposing Indonesian tax calculation tools to any MCP-compatible AI agent. Solves the universal pain point of Indonesian SMB founders, freelancers, and accountants needing fast, accurate tax projections for PPh 21 (employment), PPh 23 (services), PPh 25 (installment), PPN (VAT), and PBJT (regional).

Up-to-date with 2026 regulations including the UMKM omnibus reform, half-percent flat rate ceiling for businesses under 4.8 billion IDR annual revenue, and the new digital service tax brackets.

## Capability

Exposes 7 MCP tools:

1. `calculate_pph_21` - employment income tax with progressive brackets
2. `calculate_pph_23` - service withholding tax flat rate
3. `calculate_pph_25` - quarterly installment estimate
4. `calculate_ppn` - VAT 11 percent for normal businesses, 0 percent UMKM under threshold
5. `calculate_pbjt` - regional tax for restaurants, hotels, parking, entertainment
6. `umkm_threshold_check` - given annual revenue, returns whether UMKM half-percent rate applies
7. `progressive_bracket_breakdown` - given taxable income, returns per-bracket calculation explanation

All tools return both the numeric result and a plain-language explanation suitable for client presentation.

## Example usage

Agent invocation: `calculate_pph_21(monthly_gross=15000000, ptkp_status="K1", thr_received=true)`

MCP returns:
```json
{
  "annual_gross": 195000000,
  "ptkp_deduction": 67500000,
  "annual_taxable": 127500000,
  "total_tax_owed": 14437500,
  "monthly_pph_21": 1203125,
  "explanation": "Karyawan dengan PTKP K1 (kawin 1 tanggungan), gross bulanan Rp 15 juta plus THR. Setelah PTKP Rp 67,5 juta, taxable annual Rp 127,5 juta. Pajak terhutang Rp 14,4 juta atau Rp 1,2 juta per bulan dipotong dari gaji."
}
```

## Pricing

USD 5 per month subscription per organization. Unlimited tool invocations within fair use limit (10,000 calls per month). Revenue share to creator: 70 percent.

## License

Marketplace default license. Tax calculations are advisory and based on regulations current as of 2026 Q2. Not a substitute for licensed tax consultant. Buyer accepts no liability claims against creator or NERIUM platform.

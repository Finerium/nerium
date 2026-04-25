---
name: restaurant_automation_agent
description: End-to-end restaurant operations automation agent. Handles reservations, table management, supplier orders, staff scheduling, and customer feedback loops.
category: agent
tags:
  - restaurant
  - automation
  - hospitality
  - scheduling
  - inventory
price_usd: 25
creator_id: demo_creator_001
license: marketplace_default
runtime_compatibility:
  - anthropic_opus_4.7
  - anthropic_sonnet_4.6
  - google_gemini_pro
created_at: 2026-04-26T00:00:00Z
---

# Restaurant Automation Agent

## Purpose

End-to-end automation agent for independent restaurants and small chains. Handles the operational pipeline that consumes 60 percent of an owner-operator weekly schedule: reservations, table turnover optimization, supplier ordering based on inventory levels, staff scheduling around demand forecasting, and post-visit customer feedback collection.

Purpose-built for the underserved Indonesian and Southeast Asian SMB market where existing solutions are either too expensive (US-tier SaaS like Toast) or too narrow (single-feature tools like reservation-only).

## Capability

Receives natural-language instruction from restaurant owner via web chat or WhatsApp Business API:
- "Block table 7 for tonight 8pm, group of 6, customer name Pak Hadi"
- "We running low on cabe rawit again, order from supplier yang sama as last time"
- "Tomorrow estimated busy, schedule extra waiter for dinner shift"
- "Send feedback survey to all customers from this weekend"

Agent dispatches to relevant subsystem (POS integration, supplier API, staff scheduling DB, email service) and confirms execution back to owner. All operations logged for audit and reporting.

## Example usage

Owner sends WhatsApp message: "Stok bawang merah tinggal sedikit, order 50kg from Pak Slamet, kirim besok pagi."

Agent:
1. Validates supplier name in registered suppliers DB (Pak Slamet found, supplier_id 042)
2. Creates purchase order in POS: 50kg bawang merah, supplier 042, delivery tomorrow morning
3. Sends supplier WhatsApp message with PO number and delivery confirmation request
4. Logs transaction in inventory ledger
5. Replies to owner: "Order created. PO-2026-0142, 50kg bawang merah from Pak Slamet, ETA Senin 6 AM. Saya kabarin lagi kalau confirmed."

## Pricing

USD 25 per execution-month subscription. Revenue share to creator: 70 percent. NERIUM platform fee: 30 percent.

## License

Marketplace default license. Buyer receives execution rights for one restaurant location. Multi-location requires per-location license. Source code not included.

## Sample skill outcomes

- Average 4 hours per week saved on supplier ordering
- 15 percent reduction in food waste from improved inventory forecasting
- 92 percent customer feedback response rate (versus 8 percent industry baseline)
- Single-language Indonesian dialogue interface, no English required for owner

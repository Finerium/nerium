# Email DNS records (mail.nerium.com)

Owner: Pheme (W1 transactional email).
Contract: `docs/contracts/email_transactional.contract.md` Section 3.3.
Apply surface: Cloudflare DNS dashboard, `nerium.com` zone.
Applied-by: Ghaisan (manual dashboard apply; no Terraform until W3).

## Summary

This document is the single source of truth for the DNS surface that
Pheme relies on for deliverability of transactional email from
`mail.nerium.com`. Four record families ship:

1. SPF (TXT on `mail.nerium.com`).
2. DKIM (CNAME on `resend._domainkey.mail.nerium.com`).
3. DMARC (TXT on `_dmarc.nerium.com`), two-phase rollout.
4. MX: intentionally skipped. We do not receive mail on
   `mail.nerium.com`. Replies route through `support@nerium.com` which
   is forwarded via Cloudflare Email Routing on the apex.

The Resend dashboard will show "Verified" only after all three TXT +
CNAME records propagate. Check propagation with `dig` commands below
before notifying Pheme that the domain is live.

## Phase 1: Bootstrap (weeks 1 and 2)

During bootstrap the DMARC policy is `p=none` so ISPs send failure
reports to `dmarc@nerium.com` without quarantining legitimate mail.
This gives us two weeks to confirm alignment across Gmail + Outlook +
Yahoo + Proton before tightening to `p=quarantine`.

### 1.1 SPF on `mail.nerium.com`

Type: `TXT`
Name: `mail.nerium.com`
TTL: `1h` (3600)
Value:

```
v=spf1 include:_spf.resend.com include:amazonses.com -all
```

The `include:amazonses.com` fallback is present per V4 lock so we can
switch to AWS SES without a DNS round-trip if Resend quota runs out
during the demo. The final `-all` is strict: mail from servers NOT in
either include list is rejected. If you add a sender later (e.g.
Postmark for the marketing pipeline post-hackathon) append the
include BEFORE the `-all`.

### 1.2 DKIM on `resend._domainkey.mail.nerium.com`

Type: `CNAME`
Name: `resend._domainkey.mail.nerium.com`
TTL: `1h` (3600)
Value: (read from Resend dashboard after domain is added, format is
`<selector>.<resend-account>.resend.io`)

```
resend._domainkey.<resend-account-id>.resend.io
```

Ghaisan reads the actual value from https://resend.com/domains after
clicking "Add domain" and pointing at `mail.nerium.com`. Apply as a
CNAME (Cloudflare will warn if proxied; disable the orange cloud for
this record).

### 1.3 DMARC on `_dmarc.nerium.com` (apex, not subdomain)

Type: `TXT`
Name: `_dmarc.nerium.com`
TTL: `1h` (3600)
Value:

```
v=DMARC1; p=none; rua=mailto:dmarc@nerium.com; ruf=mailto:dmarc@nerium.com; fo=1
```

Note the record lives on the apex `_dmarc.nerium.com` (not
`_dmarc.mail.nerium.com`) per V4 lock. Apex DMARC covers all
subdomains. The `fo=1` flag requests forensic reports on any
authentication failure (aggregate and individual), giving us maximum
visibility during bootstrap.

`dmarc@nerium.com` is a Cloudflare Email Routing alias that forwards
to Ghaisan's personal inbox. Set up the alias before publishing the
record or aggregate reports will bounce.

### 1.4 MX: NOT CONFIGURED

We do not publish MX records on `mail.nerium.com`. The subdomain is
send-only. Reply-to addresses on transactional mail point at
`support@nerium.com`, which is handled by Cloudflare Email Routing on
the apex.

## Phase 2: Production (week 3 onwards)

Only advance to Phase 2 after:

1. Aggregate DMARC reports have shown zero authentication failures
   for 7 consecutive days.
2. Warmup schedule has reached day 3 (cap >= 100/day) without
   quarantine complaints.
3. Resend dashboard shows > 98% delivery rate across sampled sends.

### 2.1 DMARC tighten

Replace the Phase 1 DMARC record with:

```
v=DMARC1; p=quarantine; sp=quarantine; pct=25; rua=mailto:dmarc@nerium.com; ruf=mailto:dmarc@nerium.com; fo=1; adkim=r; aspf=r
```

Notes:

- `p=quarantine` : ISPs spam-folder unauthenticated mail claiming to
  be from `nerium.com`.
- `sp=quarantine` : same policy for subdomains.
- `pct=25` : only apply to 25% of unauthenticated mail at first. Ramp
  to `pct=100` after another 7 clean days.
- `adkim=r`, `aspf=r` : relaxed alignment. Strict alignment (`s`)
  breaks when `mail.nerium.com` DKIM aligns to apex `nerium.com`
  SPF via `include:_spf.resend.com`.

After another 14 clean days advance to `p=reject` (full rejection of
unauthenticated mail claiming to be nerium.com). That is the steady
state.

## Verification checklist

Before telling Ghaisan to mark the domain as "verified" in the
Resend dashboard, run each of these from a shell that can reach the
public DNS:

- [ ] `dig +short TXT mail.nerium.com` returns the SPF record in
      section 1.1.
- [ ] `dig +short CNAME resend._domainkey.mail.nerium.com` returns
      the Resend DKIM CNAME target.
- [ ] `dig +short TXT _dmarc.nerium.com` returns the Phase 1 DMARC
      record. (Phase 2 after tighten.)
- [ ] Send a probe email to `check-auth@verifier.port25.com`. The
      bounce-back report MUST show SPF=pass, DKIM=pass, DMARC=pass.
- [ ] Send a probe email to `test@mail-tester.com`. Score MUST be
      >= 9.5 / 10.
- [ ] Open https://dmarcian.com/dmarc-inspector/ and inspect
      `_dmarc.nerium.com`. The parsed policy must match the phase
      above.
- [ ] Open https://mxtoolbox.com/SuperTool.aspx and run the SPF and
      DKIM lookups against `mail.nerium.com`. Zero warnings expected
      except the absence of MX which is intentional.

## Ghaisan post-deploy apply steps

This is the exact checklist for Ghaisan to run once the Hetzner
deploy is live. Do not run before Pheme code is shipped because the
warmup start date is captured the day Resend starts sending.

1. **Create `mail.nerium.com` in the Resend dashboard.**
   - Click "Add domain" and enter `mail.nerium.com`.
   - Resend will show three DNS records to add.
2. **Apply the three records in Cloudflare.**
   - SPF TXT on `mail`.
   - DKIM CNAME on `resend._domainkey.mail`.
   - DMARC TXT on `_dmarc` (apex).
   - Disable Cloudflare proxying (orange cloud) on all three.
3. **Wait 5 to 30 minutes for propagation.**
   - Run the verification checklist above.
4. **Generate a Resend API key.**
   - Name it `NERIUM_PROD_PHEME` with scope "Full Access".
   - Copy into `NERIUM_RESEND_API_KEY` on the Hetzner CX32 env file.
5. **Generate a Resend webhook signing secret.**
   - In the dashboard: Webhooks -> Add endpoint.
   - URL: `https://api.nerium.com/v1/email/webhooks/resend`.
   - Events: `email.delivered`, `email.bounced`, `email.complained`.
   - Copy the signing secret into `NERIUM_RESEND_WEBHOOK_SECRET`.
6. **Set `NERIUM_EMAIL_WARMUP_START` to today's UTC date (ISO).**
   - Example: `NERIUM_EMAIL_WARMUP_START=2026-04-26`.
   - Pheme will ramp the daily cap per the schedule in
     `src/backend/email/warmup.py`.
7. **Restart the API + worker containers** so the new env loads.
8. **Monitor the first send.**
   - The welcome email on your own signup is the canary.
   - Inspect Resend dashboard -> Logs.
   - Confirm SPF=pass, DKIM=pass, DMARC=pass on the delivered message
     (Gmail: show original).

## Rollback

If DMARC Phase 2 tightening causes delivery failures (observed via
Resend dashboard bounce rate spike > 2%), revert `_dmarc.nerium.com`
to the Phase 1 record immediately and open a post-mortem. The
tighten is idempotent; moving back to `p=none` cancels the
quarantine rule without purging spam-foldered messages (those stay
where the ISP put them).

## Contact

If you are reading this during an incident, email Ghaisan directly
(Discord DM faster). Pheme, the agent that authored this document, is
a Claude Code session and will not respond to inbound mail.

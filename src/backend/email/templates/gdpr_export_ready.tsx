// gdpr_export_ready template: Eunomia GDPR export ZIP available.
// Contract: docs/contracts/email_transactional.contract.md Section 3.2.
// Consumer: Eunomia (W1 admin + GDPR).
// Category: security, critical = true.

import * as React from "react";
import { Heading, Link, Section, Text } from "@react-email/components";
import { Layout, headingStyle, paragraphStyle } from "./_shared";

export default function GdprExportReadyTemplate() {
  return (
    <Layout preview="Your NERIUM data export is ready.">
      <Section>
        <Heading as="h1" style={headingStyle}>
          Your data export is ready
        </Heading>
        <Text style={paragraphStyle}>Hi {"{{ recipient_name }}"},</Text>
        <Text style={paragraphStyle}>
          Your GDPR data export is ready. Download it here:
          <br />
          <Link href="{{ export_url }}">{"{{ export_url }}"}</Link>
        </Text>
        <Text style={paragraphStyle}>
          The link expires at <strong>{"{{ expires_at }}"}</strong>. After
          expiry we delete the ZIP from our storage to minimise data-at-rest.
        </Text>
      </Section>
    </Layout>
  );
}

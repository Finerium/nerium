// purchase_receipt template: buyer receipt after marketplace checkout.
// Contract: docs/contracts/email_transactional.contract.md Section 3.2.
// Consumer: Iapetus (W1 marketplace commerce), Plutus (W1 billing).
// Category: billing.

import * as React from "react";
import { Heading, Link, Section, Text } from "@react-email/components";
import { Layout, headingStyle, paragraphStyle } from "./_shared";

export default function PurchaseReceiptTemplate() {
  return (
    <Layout preview="Your NERIUM marketplace receipt.">
      <Section>
        <Heading as="h1" style={headingStyle}>
          Receipt for {"{{ listing_title }}"}
        </Heading>
        <Text style={paragraphStyle}>Thanks for your purchase.</Text>
        <Text style={paragraphStyle}>
          <strong>Amount:</strong> {"{{ amount_paid }}"}
          <br />
          <strong>Listing:</strong> {"{{ listing_title }}"}
          <br />
          <strong>Invoice:</strong>&nbsp;
          <Link href="{{ invoice_url }}">{"{{ invoice_url }}"}</Link>
        </Text>
        <Text style={paragraphStyle}>
          Your asset pack is already in your library. If something looks off,
          open a dispute within 7 days.
        </Text>
      </Section>
    </Layout>
  );
}

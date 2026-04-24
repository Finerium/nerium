// marketplace_sale template: seller notification on sale.
// Contract: docs/contracts/email_transactional.contract.md Section 3.2.
// Consumer: Iapetus (W1 marketplace commerce).
// Category: marketplace.

import * as React from "react";
import { Heading, Section, Text } from "@react-email/components";
import { Layout, headingStyle, paragraphStyle } from "./_shared";

export default function MarketplaceSaleTemplate() {
  return (
    <Layout preview="Your NERIUM listing was purchased.">
      <Section>
        <Heading as="h1" style={headingStyle}>
          {"{{ listing_title }}"} sold
        </Heading>
        <Text style={paragraphStyle}>Good news, {"{{ recipient_name }}"}.</Text>
        <Text style={paragraphStyle}>
          <strong>Buyer:</strong> @{"{{ buyer_handle }}"}
          <br />
          <strong>Gross:</strong> {"{{ gross_amount }}"}
          <br />
          <strong>Your net after fees:</strong> {"{{ seller_net }}"}
        </Text>
        <Text style={paragraphStyle}>
          The payout accrues to your balance and pays out on the next Plutus
          schedule. Track every sale in your seller dashboard.
        </Text>
      </Section>
    </Layout>
  );
}

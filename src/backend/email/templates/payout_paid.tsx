// payout_paid template: seller notified when bank payout clears.
// Contract: docs/contracts/email_transactional.contract.md Section 3.2.
// Consumer: Plutus + Iapetus.
// Category: billing.

import * as React from "react";
import { Heading, Section, Text } from "@react-email/components";
import { Layout, headingStyle, paragraphStyle } from "./_shared";

export default function PayoutPaidTemplate() {
  return (
    <Layout preview="Your NERIUM payout has been sent.">
      <Section>
        <Heading as="h1" style={headingStyle}>
          Payout on the way
        </Heading>
        <Text style={paragraphStyle}>Hi {"{{ recipient_name }}"},</Text>
        <Text style={paragraphStyle}>
          We sent {"{{ amount }}"} to your bank account ending in&nbsp;
          <strong>{"{{ bank_last4 }}"}</strong>. Expected arrival:&nbsp;
          <strong>{"{{ expected_arrival }}"}</strong>.
        </Text>
        <Text style={paragraphStyle}>
          Your payout history is always available in the seller dashboard.
        </Text>
      </Section>
    </Layout>
  );
}

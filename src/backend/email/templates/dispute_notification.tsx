// dispute_notification template: marketplace dispute opened.
// Contract: docs/contracts/email_transactional.contract.md Section 3.2.
// Consumer: Iapetus (W1 marketplace commerce).
// Category: marketplace, critical = true.

import * as React from "react";
import { Heading, Section, Text } from "@react-email/components";
import { Layout, headingStyle, paragraphStyle } from "./_shared";

export default function DisputeNotificationTemplate() {
  return (
    <Layout preview="A NERIUM dispute needs your attention.">
      <Section>
        <Heading as="h1" style={headingStyle}>
          Dispute opened on {"{{ listing_title }}"}
        </Heading>
        <Text style={paragraphStyle}>Hi {"{{ recipient_name }}"},</Text>
        <Text style={paragraphStyle}>
          A buyer opened a dispute on your listing&nbsp;
          <strong>{"{{ listing_title }}"}</strong>. Reason:&nbsp;
          <em>{"{{ dispute_reason }}"}</em>.
        </Text>
        <Text style={paragraphStyle}>
          Respond by <strong>{"{{ action_deadline }}"}</strong> or the dispute
          auto-resolves in the buyer's favour. Submit your response from the
          seller dashboard.
        </Text>
      </Section>
    </Layout>
  );
}

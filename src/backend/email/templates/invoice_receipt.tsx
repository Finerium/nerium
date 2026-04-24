// invoice_receipt template: Stripe invoice.paid webhook consumer.
// Contract: docs/contracts/email_transactional.contract.md Section 3.2.
// Consumer: Plutus (W1 billing).
// Category: billing.

import * as React from "react";
import { Heading, Link, Section, Text } from "@react-email/components";
import { Layout, headingStyle, paragraphStyle } from "./_shared";

export default function InvoiceReceiptTemplate() {
  return (
    <Layout preview="Your NERIUM invoice.">
      <Section>
        <Heading as="h1" style={headingStyle}>
          Invoice {"{{ invoice_number }}"}
        </Heading>
        <Text style={paragraphStyle}>Hi {"{{ recipient_name }}"},</Text>
        <Text style={paragraphStyle}>
          Thanks, your payment of <strong>{"{{ amount }}"}</strong> has posted.
        </Text>
        <Text style={paragraphStyle}>
          Download the PDF:&nbsp;
          <Link href="{{ invoice_pdf_url }}">{"{{ invoice_pdf_url }}"}</Link>
        </Text>
        <Text style={paragraphStyle}>
          Keep this receipt for your records. NERIUM does not store card
          numbers; only Stripe does.
        </Text>
      </Section>
    </Layout>
  );
}

// email_verify template: account email ownership verification.
// Contract: docs/contracts/email_transactional.contract.md Section 3.2.
// Consumer: Aether (W1 auth, verify flow).
// Category: security (critical = true, bypasses warmup cap).

import * as React from "react";
import { Button, Heading, Section, Text } from "@react-email/components";
import { Layout, headingStyle, paragraphStyle } from "./_shared";

export default function EmailVerifyTemplate() {
  return (
    <Layout preview="Confirm your NERIUM email. Link expires in 24 hours.">
      <Section>
        <Heading as="h1" style={headingStyle}>
          Verify your email
        </Heading>
        <Text style={paragraphStyle}>Hi {"{{ recipient_name }}"},</Text>
        <Text style={paragraphStyle}>
          Confirm that <strong>{"{{ to_email }}"}</strong> belongs to you so we
          can secure your NERIUM account. The link expires in&nbsp;
          {"{{ expires_in_hours }}"} hours.
        </Text>
        <Button
          href="{{ verify_url }}"
          style={{
            backgroundColor: "#2563eb",
            borderRadius: "8px",
            color: "#ffffff",
            padding: "12px 24px",
            textDecoration: "none",
          }}
        >
          Verify email
        </Button>
        <Text style={paragraphStyle}>
          If you did not sign up, ignore this message.
        </Text>
      </Section>
    </Layout>
  );
}

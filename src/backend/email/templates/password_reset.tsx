// password_reset template: security-category, critical = true.
// Contract: docs/contracts/email_transactional.contract.md Section 3.2.
// Consumer: Aether (W1 auth, password reset flow).

import * as React from "react";
import { Button, Heading, Section, Text } from "@react-email/components";
import { Layout, headingStyle, paragraphStyle } from "./_shared";

export default function PasswordResetTemplate() {
  return (
    <Layout preview="Reset your NERIUM password. Link expires in 1 hour.">
      <Section>
        <Heading as="h1" style={headingStyle}>
          Reset your password
        </Heading>
        <Text style={paragraphStyle}>Hi {"{{ recipient_name }}"},</Text>
        <Text style={paragraphStyle}>
          We received a request to reset the NERIUM password for&nbsp;
          <strong>{"{{ to_email }}"}</strong>. The link expires in&nbsp;
          {"{{ expires_in_hours }}"} hour.
        </Text>
        <Button
          href="{{ reset_url }}"
          style={{
            backgroundColor: "#dc2626",
            borderRadius: "8px",
            color: "#ffffff",
            padding: "12px 24px",
            textDecoration: "none",
          }}
        >
          Reset password
        </Button>
        <Text style={paragraphStyle}>
          If you did not request a reset, ignore this message. Your password
          is unchanged.
        </Text>
      </Section>
    </Layout>
  );
}

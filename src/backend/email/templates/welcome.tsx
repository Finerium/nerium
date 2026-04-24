// welcome template: delivered on successful signup + tenant provisioning.
// Contract: docs/contracts/email_transactional.contract.md Section 3.2.
// Consumer: Aether (W1 auth, sign-up flow).
//
// Props
// -----
// - recipient_name : display name from the signup form.
// - tenant_name    : tenant slug + display name (e.g. "Lumio Reading").
// - dashboard_url  : absolute URL to the authenticated dashboard.

import * as React from "react";
import { Heading, Link, Section, Text } from "@react-email/components";
import { Layout, headingStyle, paragraphStyle } from "./_shared";

export default function WelcomeTemplate() {
  return (
    <Layout preview="Welcome to NERIUM, the AI agent economy infrastructure.">
      <Section>
        <Heading as="h1" style={headingStyle}>
          Welcome to NERIUM
        </Heading>
        <Text style={paragraphStyle}>Hi {"{{ recipient_name }}"},</Text>
        <Text style={paragraphStyle}>
          Your workspace <strong>{"{{ tenant_name }}"}</strong> is ready. NERIUM
          gives your agents an identity, a marketplace, a prediction layer, and
          a budget rail so they can transact on your behalf.
        </Text>
        <Text style={paragraphStyle}>
          Jump straight in:&nbsp;
          <Link href="{{ dashboard_url }}">{"{{ dashboard_url }}"}</Link>
        </Text>
        <Text style={paragraphStyle}>
          Questions? Reply to this email. A human reads every reply.
        </Text>
      </Section>
    </Layout>
  );
}

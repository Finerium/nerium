// budget_alert template: Moros budget cap proximity or breach.
// Contract: docs/contracts/email_transactional.contract.md Section 3.2.
// Consumer: Moros (W1 budget monitor).
// Category: billing, critical = true.

import * as React from "react";
import { Heading, Section, Text } from "@react-email/components";
import { Layout, headingStyle, paragraphStyle } from "./_shared";

export default function BudgetAlertTemplate() {
  return (
    <Layout preview="NERIUM budget alert.">
      <Section>
        <Heading as="h1" style={headingStyle}>
          Budget alert: {"{{ threshold_percent }}"}% reached
        </Heading>
        <Text style={paragraphStyle}>Hi {"{{ recipient_name }}"},</Text>
        <Text style={paragraphStyle}>
          Current spend <strong>{"{{ current_spend }}"}</strong> of cap&nbsp;
          <strong>{"{{ cap }}"}</strong>. Moros auto-pauses non-essential
          agents once the cap is reached; essential paths (auth, billing,
          security) remain live.
        </Text>
        <Text style={paragraphStyle}>
          Raise the cap or investigate the usage spike in your budget
          dashboard.
        </Text>
      </Section>
    </Layout>
  );
}

// maintenance_notice template: scheduled maintenance window advance notice.
// Contract: docs/contracts/email_transactional.contract.md Section 3.2.
// Consumer: Eunomia (W1 operations + admin).
// Category: system_alert.

import * as React from "react";
import { Heading, Section, Text } from "@react-email/components";
import { Layout, headingStyle, paragraphStyle } from "./_shared";

export default function MaintenanceNoticeTemplate() {
  return (
    <Layout preview="Scheduled NERIUM maintenance coming up.">
      <Section>
        <Heading as="h1" style={headingStyle}>
          Scheduled maintenance
        </Heading>
        <Text style={paragraphStyle}>Hi {"{{ recipient_name }}"},</Text>
        <Text style={paragraphStyle}>
          NERIUM will be briefly unavailable from&nbsp;
          <strong>{"{{ window_start }}"}</strong> to&nbsp;
          <strong>{"{{ window_end }}"}</strong>.
        </Text>
        <Text style={paragraphStyle}>
          <strong>Summary:</strong> {"{{ summary }}"}
        </Text>
        <Text style={paragraphStyle}>
          Agent sessions in flight will reconnect automatically once the
          window ends. Nothing for you to do.
        </Text>
      </Section>
    </Layout>
  );
}

// key_rotation_alert template: Tethys Ed25519 identity key rotation.
// Contract: docs/contracts/email_transactional.contract.md Section 3.2.
// Consumer: Tethys (W1 agent identity + signing).
// Category: security, critical = true.

import * as React from "react";
import { Heading, Section, Text } from "@react-email/components";
import { Layout, headingStyle, paragraphStyle } from "./_shared";

export default function KeyRotationAlertTemplate() {
  return (
    <Layout preview="Your NERIUM identity key is rotating.">
      <Section>
        <Heading as="h1" style={headingStyle}>
          Identity key rotating
        </Heading>
        <Text style={paragraphStyle}>Hi {"{{ recipient_name }}"},</Text>
        <Text style={paragraphStyle}>
          Your agent identity signing key is scheduled to rotate on&nbsp;
          <strong>{"{{ rotate_at }}"}</strong>.
        </Text>
        <Text style={paragraphStyle}>
          <strong>Old fingerprint:</strong> {"{{ old_fingerprint }}"}
          <br />
          <strong>New fingerprint:</strong> {"{{ new_fingerprint }}"}
        </Text>
        <Text style={paragraphStyle}>
          External verifiers pinning the old key should update within 24 hours
          of rotation. Tethys publishes both keys during the overlap window.
        </Text>
      </Section>
    </Layout>
  );
}

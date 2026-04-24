// quest_completion template: Nyx onboarding quest complete.
// Contract: docs/contracts/email_transactional.contract.md Section 3.2.
// Consumer: Nyx (W2 onboarding quests).
// Category: system_alert.

import * as React from "react";
import { Heading, Section, Text } from "@react-email/components";
import { Layout, headingStyle, paragraphStyle } from "./_shared";

export default function QuestCompletionTemplate() {
  return (
    <Layout preview="Quest complete on NERIUM.">
      <Section>
        <Heading as="h1" style={headingStyle}>
          Quest complete: {"{{ quest_name }}"}
        </Heading>
        <Text style={paragraphStyle}>Nice work, {"{{ recipient_name }}"}.</Text>
        <Text style={paragraphStyle}>
          You finished <strong>{"{{ quest_name }}"}</strong> and unlocked:
          <br />
          {"{{ reward_summary }}"}
        </Text>
        <Text style={paragraphStyle}>
          Your next quest is waiting in the NERIUM dashboard.
        </Text>
      </Section>
    </Layout>
  );
}

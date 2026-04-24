// Shared React Email shell for NERIUM transactional templates.
//
// Owner: Pheme (W1 transactional email).
//
// Why .tsx instead of Jinja / MJML?
// ---------------------------------
// The contract (docs/contracts/email_transactional.contract.md Section
// 3.2) names React Email as the authoring surface because:
//   1. Components compose cleanly and get type-checked against props.
//   2. `@react-email/render` emits inlined-CSS HTML that matches Gmail
//      and Outlook's conservative rendering pipelines.
//   3. A shared <Layout> here keeps brand + footer + unsubscribe
//      footer consistent across all 13 templates without per-template
//      copy-paste.
//
// Build pipeline
// --------------
// `pnpm exec react-email export` consumes every .tsx sibling here and
// writes inlined-CSS HTML into ./rendered/<name>.html. The Python
// renderer (src/backend/email/renderer.py) reads those artifacts and
// performs `{{ key }}` substitution with HTML-escaped values at send
// time. No Node subprocess is forked per send.
//
// Placeholders
// ------------
// Every interpolated value uses the `{{ key }}` marker format. Props
// that should NOT be HTML-escaped (already-safe URLs) are still
// escaped by the Python layer; keep URLs in attribute position so the
// escape is neutral.

import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

export type LayoutProps = {
  preview: string;
  children: React.ReactNode;
};

const BRAND_COLOR = "#60a5fa";
const MUTED_COLOR = "#6b7280";
const BG_COLOR = "#0b0f17";
const CARD_COLOR = "#11161f";
const BORDER_COLOR = "#1f2937";
const TEXT_COLOR = "#e6edf3";

const bodyStyle = {
  backgroundColor: BG_COLOR,
  color: TEXT_COLOR,
  fontFamily:
    "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  margin: 0,
  padding: "32px 16px",
} as const;

const containerStyle = {
  backgroundColor: CARD_COLOR,
  border: `1px solid ${BORDER_COLOR}`,
  borderRadius: "12px",
  margin: "0 auto",
  maxWidth: "560px",
  padding: "32px",
} as const;

const headingStyle = {
  color: TEXT_COLOR,
  fontSize: "22px",
  fontWeight: 600,
  margin: "0 0 16px 0",
} as const;

const paragraphStyle = {
  color: TEXT_COLOR,
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 12px 0",
} as const;

const mutedStyle = {
  color: MUTED_COLOR,
  fontSize: "12px",
  lineHeight: "1.5",
  margin: "24px 0 0 0",
} as const;

const hrStyle = {
  borderColor: BORDER_COLOR,
  margin: "24px 0",
} as const;

const linkStyle = {
  color: BRAND_COLOR,
} as const;

export function Layout({ preview, children }: LayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section>
            <Text style={{ ...paragraphStyle, color: BRAND_COLOR, fontWeight: 600 }}>
              NERIUM
            </Text>
            <Hr style={hrStyle} />
            {children}
            <Hr style={hrStyle} />
            <Text style={mutedStyle}>
              NERIUM, Infrastructure for the AI agent economy.
              <br />
              Transactional message. No marketing tracking.
              <br />
              <Link style={linkStyle} href="{{ unsubscribe_url }}">
                Unsubscribe
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export { BRAND_COLOR, MUTED_COLOR, headingStyle, paragraphStyle };

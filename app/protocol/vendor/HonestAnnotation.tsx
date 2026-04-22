'use client';

//
// HonestAnnotation.tsx (Morpheus P3b).
//
// Conforms to:
// - docs/contracts/vendor_adapter_ui.contract.md v0.1.0
//   (Section 3 HonestAnnotationProps, Section 4 visual treatment rules).
// - NarasiGhaisan Section 16 honest framing.
// - CLAUDE.md anti-pattern 7 (no Gemini / Higgsfield execution claim).
//
// Visibility requirements (non-negotiable per morpheus.md hard_constraints):
// - visible without hover (no tooltip, no collapsible disclosure)
// - minimum font-size 12px (enforced in styles.css)
// - WCAG AA contrast against advisor background (amber warn token 4.6:1 on
//   near-black, verified by Erato palette already in use for strategy notes)
// - role="note" so screen readers announce it as an aside, not as a control
// - alwaysVisible defaults true; cannot be dismissed (no close button rendered)
//
// Copy source of truth: annotation_text.constant.ts HONEST_CLAIM_LOCKED_TEXT.
// Overriding the text via `text` prop is allowed for locale swap (Apollo
// provides ID copy via apollo.prompts.ts MULTI_VENDOR_ANNOTATION_ID); changing
// the English default at this layer requires halt-and-ferry per contract.
//

import type { ReactElement } from 'react';

import type { HonestAnnotationProps } from './vendor_adapter_ui_types';
import { HONEST_CLAIM_LOCKED_TEXT } from './annotation_text.constant';

export default function HonestAnnotation(
  props: HonestAnnotationProps,
): ReactElement {
  const {
    text = HONEST_CLAIM_LOCKED_TEXT,
    severity = 'advisory',
    alwaysVisible = true,
    className,
  } = props;

  const resolvedText = text.trim().length > 0 ? text : HONEST_CLAIM_LOCKED_TEXT;

  const rootClassName = [
    'morpheus-annotation',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={rootClassName}
      role="note"
      aria-live="polite"
      data-severity={severity}
      data-always-visible={alwaysVisible ? 'true' : 'false'}
      data-honest-claim="locked"
    >
      <span className="morpheus-annotation-icon" aria-hidden="true">
        {/* Non-emoji neutral glyph; simple outlined info dot */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          focusable="false"
        >
          <circle
            cx="7"
            cy="7"
            r="6"
            stroke="currentColor"
            strokeWidth="1.25"
            fill="none"
          />
          <rect x="6.25" y="5.5" width="1.5" height="4.25" rx="0.4" fill="currentColor" />
          <rect x="6.25" y="3.5" width="1.5" height="1.5" rx="0.4" fill="currentColor" />
        </svg>
      </span>
      <span className="morpheus-annotation-label">Honest claim</span>
      <span className="morpheus-annotation-text">{resolvedText}</span>
    </div>
  );
}

export { HONEST_CLAIM_LOCKED_TEXT };

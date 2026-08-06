'use client';

/**
 * Minimalist — "Quiet"
 * Tracked small-caps letterhead · generous whitespace · no ornament
 *
 * Restraint means fewer marks, not less information. This template used to omit
 * the inside address entirely — it showed the company name in a meta row and
 * dropped the recipient's name, title and address on the floor — which is not
 * minimal, it is incomplete: the letter no longer says who it is addressed to.
 */

import React from 'react';
import type { CLTemplateProps } from './types';
import { getCLTokens, INK, A4_PAGE_PX } from './shared';
import { Salutation, LetterBody, SignatureBlock } from './parts';

export default function MinimalistTemplate({ coverLetter, senderName, senderEmail, today, labels }: CLTemplateProps) {
  const { font, fontSize, ink } = getCLTokens(coverLetter, '#374151');
  const hasRecipient = !!(coverLetter.recipientName || coverLetter.recipientTitle
    || coverLetter.companyName || coverLetter.companyAddress);

  return (
    <div style={{
      fontFamily: font,
      fontSize,
      color: INK.body,
      lineHeight: 1.85,
      // Wider margins than the others — the whitespace is the design. Still
      // narrower than before (was 72px) because the measure was already long.
      padding: '76px 88px',
      background: '#fff',
      minHeight: `${A4_PAGE_PX}px`,
    }}>
      {/* Letterhead. Tracked small caps, but at a readable size: at 0.8em on a
          14px base this was 11.2px — the smallest text on the page was the
          author's name. */}
      {senderName && (
        <div style={{
          fontSize: '1.05em',
          fontWeight: 600,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: ink,
          marginBottom: 44,
        }}>
          {senderName}
        </div>
      )}

      <div style={{ marginBottom: 26, color: INK.meta, fontSize: '0.9em' }}>{today}</div>

      {/* Inside address */}
      {hasRecipient && (
        <div style={{ marginBottom: 34, lineHeight: 1.55 }}>
          {coverLetter.recipientName && <div style={{ fontWeight: 600, color: INK.heading }}>{coverLetter.recipientName}</div>}
          {coverLetter.recipientTitle && <div style={{ color: INK.subtle }}>{coverLetter.recipientTitle}</div>}
          {coverLetter.companyName && <div style={{ color: INK.subtle }}>{coverLetter.companyName}</div>}
          {coverLetter.companyAddress && <div style={{ color: INK.meta, fontSize: '0.92em' }}>{coverLetter.companyAddress}</div>}
        </div>
      )}

      {coverLetter.jobTitle && (
        <div style={{ marginBottom: 30, color: INK.subtle }}>
          {labels.re} <bdi>{coverLetter.jobTitle}</bdi>
        </div>
      )}

      <Salutation coverLetter={coverLetter} labels={labels} style={{ marginBottom: 22 }} />

      <LetterBody coverLetter={coverLetter} labels={labels} style={{ marginBottom: 40 }} />

      <SignatureBlock
        closing={labels.closingRegards}
        senderName={senderName}
        senderEmail={senderEmail}
        closingStyle={{ color: INK.subtle }}
        nameStyle={{ fontWeight: 600, color: INK.heading }}
      />
    </div>
  );
}

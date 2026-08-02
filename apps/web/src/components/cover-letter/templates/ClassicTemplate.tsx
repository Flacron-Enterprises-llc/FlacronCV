'use client';

/**
 * Classic — "Traditional business letter"
 * Letterhead · date · rule · inside address · subject · body · signature
 */

import React from 'react';
import type { CLTemplateProps } from './types';
import { getCLTokens, INK, A4_PAGE_PX, PAGE_PAD_X, PAGE_PAD_Y } from './shared';
import { Salutation, LetterBody, SignatureBlock } from './parts';

export default function ClassicTemplate({ coverLetter, senderName, senderEmail, today, labels }: CLTemplateProps) {
  const { font, fontSize, accent, ink } = getCLTokens(coverLetter, '#1e3a5f');
  const hasRecipient = !!(coverLetter.recipientName || coverLetter.recipientTitle
    || coverLetter.companyName || coverLetter.companyAddress);

  return (
    <div style={{
      fontFamily: font,
      fontSize,
      color: INK.body,
      lineHeight: 1.7,
      padding: `${PAGE_PAD_Y}px ${PAGE_PAD_X}px`,
      background: '#fff',
      minHeight: `${A4_PAGE_PX}px`,
    }}>
      {/* Letterhead */}
      {(senderName || senderEmail) && (
        <div style={{ marginBottom: 28 }}>
          {senderName && (
            <div style={{ fontWeight: 700, fontSize: '1.25em', color: INK.heading, letterSpacing: '-0.01em' }}>
              {senderName}
            </div>
          )}
          {senderEmail && <div style={{ color: INK.meta, fontSize: '0.9em', marginTop: 2 }}>{senderEmail}</div>}
        </div>
      )}

      <div style={{ marginBottom: 22, color: INK.meta, fontSize: '0.92em' }}>{today}</div>

      {/* Rule. The accent exactly as chosen — a 2px rule reads as a rule at any
          luminance, so this one does not need the text contrast floor. */}
      <div style={{ borderTop: `2px solid ${accent}`, marginBottom: 24 }} />

      {/* Inside address */}
      {hasRecipient && (
        <div style={{ marginBottom: 24, lineHeight: 1.55 }}>
          {coverLetter.recipientName && <div style={{ fontWeight: 600, color: INK.heading }}>{coverLetter.recipientName}</div>}
          {coverLetter.recipientTitle && <div style={{ color: INK.subtle }}>{coverLetter.recipientTitle}</div>}
          {coverLetter.companyName && <div style={{ color: INK.subtle }}>{coverLetter.companyName}</div>}
          {coverLetter.companyAddress && <div style={{ color: INK.meta, fontSize: '0.94em' }}>{coverLetter.companyAddress}</div>}
        </div>
      )}

      {/* Subject */}
      {coverLetter.jobTitle && (
        <div style={{ marginBottom: 24, fontWeight: 600, color: ink }}>
          {labels.re} <bdi>{coverLetter.jobTitle}</bdi>
        </div>
      )}

      <Salutation coverLetter={coverLetter} labels={labels} style={{ marginBottom: 16 }} />

      <LetterBody coverLetter={coverLetter} labels={labels} style={{ marginBottom: 30 }} />

      <SignatureBlock
        closing={labels.closingSincerely}
        senderName={senderName}
        nameStyle={{ fontWeight: 600, color: INK.heading }}
      />
    </div>
  );
}

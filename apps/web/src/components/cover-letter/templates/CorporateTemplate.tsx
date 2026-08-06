'use client';

/**
 * Corporate — "Letterhead rule"
 * Thin full-bleed top bar · sender opposite date · formal subject line
 */

import React from 'react';
import type { CLTemplateProps } from './types';
import { getCLTokens, INK, A4_PAGE_PX, PAGE_PAD_X, PAGE_PAD_Y } from './shared';
import { Salutation, LetterBody, SignatureBlock } from './parts';

export default function CorporateTemplate({ coverLetter, senderName, senderEmail, today, labels }: CLTemplateProps) {
  const { font, fontSize, accent, ink } = getCLTokens(coverLetter, '#0f766e');
  const hasRecipient = !!(coverLetter.recipientName || coverLetter.recipientTitle
    || coverLetter.companyName || coverLetter.companyAddress);
  const named = !!coverLetter.recipientName?.trim();

  return (
    <div style={{
      fontFamily: font,
      fontSize,
      color: INK.body,
      lineHeight: 1.7,
      background: '#fff',
      minHeight: `${A4_PAGE_PX}px`,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Letterhead bar — decorative, so it keeps the accent as chosen. */}
      <div style={{ background: accent, height: 8, flexShrink: 0 }} />

      <div style={{ flex: 1, padding: `${PAGE_PAD_Y - 16}px ${PAGE_PAD_X}px ${PAGE_PAD_Y}px` }}>
        {/* Sender opposite the date */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 24,
          marginBottom: 30,
          paddingBottom: 20,
          borderBottom: `1px solid ${INK.hair}`,
        }}>
          <div style={{ minWidth: 0 }}>
            {senderName && (
              <div style={{ fontSize: '1.22em', fontWeight: 700, color: ink, letterSpacing: '-0.01em' }}>
                {senderName}
              </div>
            )}
            {senderEmail && <div style={{ color: INK.meta, fontSize: '0.88em', marginTop: 2 }}>{senderEmail}</div>}
          </div>
          <div style={{ color: INK.meta, fontSize: '0.88em', whiteSpace: 'nowrap', flexShrink: 0, marginInlineStart: 'auto' }}>
            {today}
          </div>
        </div>

        {/* Inside address */}
        {hasRecipient && (
          <div style={{ marginBottom: 26, lineHeight: 1.55 }}>
            {coverLetter.recipientName && <div style={{ fontWeight: 600, color: INK.heading }}>{coverLetter.recipientName}</div>}
            {coverLetter.recipientTitle && <div style={{ color: INK.subtle }}>{coverLetter.recipientTitle}</div>}
            {coverLetter.companyName && <div style={{ fontWeight: 500, color: INK.subtle }}>{coverLetter.companyName}</div>}
            {coverLetter.companyAddress && <div style={{ color: INK.meta, fontSize: '0.92em' }}>{coverLetter.companyAddress}</div>}
          </div>
        )}

        {coverLetter.jobTitle && (
          <div style={{ marginBottom: 24, fontWeight: 700, color: INK.heading }}>
            {labels.subjectApplication} <bdi>{coverLetter.jobTitle}</bdi>
          </div>
        )}

        <Salutation coverLetter={coverLetter} labels={labels} style={{ marginBottom: 16 }} />

        <LetterBody coverLetter={coverLetter} labels={labels} style={{ marginBottom: 32 }} />

        <div style={{ borderTop: `1px solid ${INK.hair}`, paddingTop: 24 }}>
          {/* British convention: "faithfully" answers "Dear Sir/Madam",
              "sincerely" answers a named recipient. This template paired a
              named salutation with "Yours faithfully", which is the one
              sign-off error a formal reader will notice. Pick from the name. */}
          <SignatureBlock
            closing={named ? labels.closingSincerely : labels.closingFaithfully}
            senderName={senderName}
            senderEmail={senderEmail}
            nameStyle={{ fontWeight: 700, color: INK.heading }}
          />
        </div>
      </div>
    </div>
  );
}

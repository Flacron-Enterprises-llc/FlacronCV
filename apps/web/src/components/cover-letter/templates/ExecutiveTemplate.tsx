'use client';

/**
 * Executive — "Formal, asymmetric"
 * Letterhead set to the trailing edge · full-width rule · restrained serif voice
 */

import React from 'react';
import type { CLTemplateProps } from './types';
import { getCLTokens, INK, A4_PAGE_PX, PAGE_PAD_X, PAGE_PAD_Y, hexToRgba } from './shared';
import { Salutation, LetterBody, SignatureBlock } from './parts';

export default function ExecutiveTemplate({ coverLetter, senderName, senderEmail, today, labels }: CLTemplateProps) {
  const { font, fontSize, accent, ink } = getCLTokens(coverLetter, '#0c0c0c');
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
      {/* Letterhead, set to the trailing edge.
          'end', not 'right'. The whole point of this template is that the
          sender sits opposite the recipient; with a physical 'right' under
          dir=rtl the sender stayed right while the recipient moved right too,
          so both blocks stacked on the same side and the asymmetry — the
          template's only distinguishing idea — collapsed. */}
      {(senderName || senderEmail || today) && (
        <div style={{ textAlign: 'end', marginBottom: 36 }}>
          {senderName && (
            <div style={{ fontSize: '1.3em', fontWeight: 700, color: INK.heading, letterSpacing: '-0.01em' }}>
              {senderName}
            </div>
          )}
          {senderEmail && <div style={{ color: INK.subtle, fontSize: '0.9em', marginTop: 4 }}>{senderEmail}</div>}
          <div style={{ color: INK.meta, fontSize: '0.88em', marginTop: 8 }}>{today}</div>
        </div>
      )}

      {/* Full-width rule.
          Was a linear-gradient(to right, …) — a physical direction that never
          mirrors, so in RTL it faded out toward the reading start instead of
          away from it. A solid rule states the same thing and states it the
          same way in both directions. */}
      <div style={{ height: 2, background: accent, marginBottom: 36 }} />

      {/* Inside address */}
      {hasRecipient && (
        <div style={{ marginBottom: 30, lineHeight: 1.55 }}>
          {coverLetter.recipientName && <div style={{ fontWeight: 600, color: INK.heading }}>{coverLetter.recipientName}</div>}
          {coverLetter.recipientTitle && <div style={{ color: INK.subtle }}>{coverLetter.recipientTitle}</div>}
          {coverLetter.companyName && <div style={{ color: INK.subtle }}>{coverLetter.companyName}</div>}
          {coverLetter.companyAddress && <div style={{ color: INK.meta, fontSize: '0.92em' }}>{coverLetter.companyAddress}</div>}
        </div>
      )}

      {/* Subject. borderLeft + paddingLeft was the worst RTL failure in the
          set: the accent bar stayed pinned to the left margin while the text
          it marked moved to the right, leaving a stranded 3px mark most of a
          page-width away from anything. */}
      {coverLetter.jobTitle && (
        <div style={{
          marginBottom: 28,
          fontWeight: 600,
          fontSize: '1.04em',
          color: INK.heading,
          borderInlineStart: `3px solid ${accent}`,
          paddingInlineStart: 12,
        }}>
          {labels.re} <bdi>{coverLetter.jobTitle}</bdi>
        </div>
      )}

      <Salutation coverLetter={coverLetter} labels={labels} style={{ marginBottom: 20 }} />

      <LetterBody coverLetter={coverLetter} labels={labels} style={{ marginBottom: 34 }} />

      <div style={{ borderTop: `1px solid ${hexToRgba(ink, 0.18)}`, paddingTop: 26 }}>
        <SignatureBlock
          closing={labels.closingRespectfully}
          senderName={senderName}
          senderEmail={senderEmail}
          closingStyle={{ fontStyle: 'italic', color: INK.subtle }}
          nameStyle={{ fontWeight: 700, fontSize: '1.05em', color: INK.heading }}
        />
      </div>
    </div>
  );
}

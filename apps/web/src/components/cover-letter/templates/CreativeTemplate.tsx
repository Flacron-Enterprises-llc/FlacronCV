'use client';

/**
 * Creative — "Accent rail"
 * Full-height colour rail down the leading edge · confident letterhead
 */

import React from 'react';
import type { CLTemplateProps } from './types';
import { getCLTokens, INK, A4_PAGE_PX, PAGE_PAD_X, PAGE_PAD_Y } from './shared';
import { Salutation, LetterBody, SignatureBlock } from './parts';

const RAIL_W = 12;

export default function CreativeTemplate({ coverLetter, senderName, senderEmail, today, labels }: CLTemplateProps) {
  const { font, fontSize, accent, ink } = getCLTokens(coverLetter, '#7c3aed');
  const hasRecipient = !!(coverLetter.recipientName || coverLetter.recipientTitle
    || coverLetter.companyName || coverLetter.companyAddress);

  return (
    <div style={{
      fontFamily: font,
      fontSize,
      color: INK.body,
      lineHeight: 1.7,
      background: '#fff',
      // 1122, not 842. The rail is a flex child of a stretch container, so it
      // grew to exactly the container height — which meant it stopped 74mm
      // short of the bottom of the printed page and simply ended mid-sheet.
      // This is the one template where the wrong page height was visible.
      minHeight: `${A4_PAGE_PX}px`,
      display: 'flex',
    }}>
      {/* Accent rail. Flex order follows the writing direction, so this moves
          to the right edge under dir=rtl on its own. */}
      <div style={{ width: RAIL_W, background: accent, flexShrink: 0 }} />

      {/* The rail eats into the leading margin, so the text keeps a symmetric
          optical margin: PAGE_PAD_X on the trailing side, PAGE_PAD_X - RAIL_W
          on the leading side. Logical, so the reduced side follows the rail
          when the whole thing mirrors. */}
      <div style={{
        flex: 1,
        minWidth: 0,
        paddingBlock: `${PAGE_PAD_Y}px`,
        paddingInlineStart: `${PAGE_PAD_X - RAIL_W}px`,
        paddingInlineEnd: `${PAGE_PAD_X}px`,
      }}>
        {/* Letterhead */}
        {(senderName || senderEmail || today) && (
          <div style={{ marginBottom: 34, paddingBottom: 20, borderBottom: `1px solid ${INK.hair}` }}>
            {senderName && (
              <div style={{ fontSize: '1.5em', fontWeight: 800, color: ink, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                {senderName}
              </div>
            )}
            {senderEmail && <div style={{ color: INK.subtle, fontSize: '0.9em', marginTop: 5 }}>{senderEmail}</div>}
            <div style={{ color: INK.meta, fontSize: '0.88em', marginTop: 9 }}>{today}</div>
          </div>
        )}

        {/* Inside address — now including the title and address the template
            used to drop. */}
        {hasRecipient && (
          <div style={{ marginBottom: 26, lineHeight: 1.55 }}>
            {coverLetter.recipientName && <div style={{ fontWeight: 600, color: INK.heading }}>{coverLetter.recipientName}</div>}
            {coverLetter.recipientTitle && <div style={{ color: INK.subtle }}>{coverLetter.recipientTitle}</div>}
            {coverLetter.companyName && <div style={{ color: INK.subtle }}>{coverLetter.companyName}</div>}
            {coverLetter.companyAddress && <div style={{ color: INK.meta, fontSize: '0.9em' }}>{coverLetter.companyAddress}</div>}
          </div>
        )}

        {/* Subject. Was a rounded, accent-tinted pill — a UI tag on a letter.
            A short accent rule reads as emphasis without the chrome. */}
        {coverLetter.jobTitle && (
          <div style={{
            marginBottom: 24,
            paddingInlineStart: 12,
            borderInlineStart: `3px solid ${accent}`,
            fontWeight: 700,
            color: ink,
          }}>
            {labels.re} <bdi>{coverLetter.jobTitle}</bdi>
          </div>
        )}

        <Salutation coverLetter={coverLetter} labels={labels} style={{ marginBottom: 16 }} />

        <LetterBody coverLetter={coverLetter} labels={labels} style={{ marginBottom: 30 }} />

        <SignatureBlock
          closing={labels.closingEnthusiasm}
          senderName={senderName}
          closingStyle={{ color: INK.subtle }}
          nameStyle={{ fontWeight: 700, fontSize: '1.05em', color: ink }}
        />
      </div>
    </div>
  );
}

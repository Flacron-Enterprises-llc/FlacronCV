'use client';

/**
 * Modern — "Letterhead band"
 * Full-bleed accent band carrying the sender · inside address opposite the date
 * · subject rule · body · signature
 *
 * This is the default template, so its failure modes were everyone's.
 */

import React from 'react';
import type { CLTemplateProps } from './types';
import { getCLTokens, INK, A4_PAGE_PX, PAGE_PAD_X, PAGE_PAD_Y } from './shared';
import { Salutation, LetterBody, SignatureBlock } from './parts';

export default function ModernTemplate({ coverLetter, senderName, senderEmail, today, labels }: CLTemplateProps) {
  const { font, fontSize, accent, ink, band } = getCLTokens(coverLetter, '#2563eb');
  const hasRecipient = !!(coverLetter.recipientName || coverLetter.recipientTitle
    || coverLetter.companyName || coverLetter.companyAddress);
  // The band only exists to carry the sender. With no sender there is nothing
  // to carry, and it used to print the literal words "Your Name" across the top
  // of the page in 800-weight white — a placeholder, in the letterhead, in the
  // exported PDF, on the default template.
  const showBand = !!(senderName || senderEmail);

  return (
    <div style={{
      fontFamily: font,
      fontSize,
      color: INK.body,
      lineHeight: 1.7,
      background: '#fff',
      minHeight: `${A4_PAGE_PX}px`,
      // Column + flex:1 body, so the white page runs to the bottom edge rather
      // than ending wherever the content happens to stop.
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Letterhead band. `band` is the accent darkened only as far as white
          needs — the raw accent was painted straight behind white text, so a
          pale pick put the sender's own name into near-invisibility. */}
      {showBand && (
        <div style={{ background: band, padding: `36px ${PAGE_PAD_X}px`, color: '#fff' }}>
          {senderName && (
            <div style={{ fontSize: '1.55em', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {senderName}
            </div>
          )}
          {senderEmail && (
            // Solid white at a smaller size rather than opacity: the old
            // 0.85 alpha failed 4.5:1 against the band even at the default
            // accent. Hierarchy comes from size, not from fading the text.
            <div style={{ fontSize: '0.88em', marginTop: 6, color: '#fff' }}>{senderEmail}</div>
          )}
        </div>
      )}

      <div style={{ flex: 1, padding: `${PAGE_PAD_Y}px ${PAGE_PAD_X}px` }}>
        {/* Inside address, with the date opposite it. When there is no
            recipient the row used to collapse to an empty box beside a
            stranded right-aligned date; now the date simply stands alone. */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 24,
          marginBottom: 30,
        }}>
          {hasRecipient && (
            <div style={{ lineHeight: 1.55, minWidth: 0 }}>
              {coverLetter.recipientName && <div style={{ fontWeight: 600, color: INK.heading }}>{coverLetter.recipientName}</div>}
              {coverLetter.recipientTitle && <div style={{ color: INK.subtle }}>{coverLetter.recipientTitle}</div>}
              {coverLetter.companyName && <div style={{ color: INK.subtle }}>{coverLetter.companyName}</div>}
              {coverLetter.companyAddress && <div style={{ color: INK.meta, fontSize: '0.9em' }}>{coverLetter.companyAddress}</div>}
            </div>
          )}
          <div style={{
            color: INK.meta,
            fontSize: '0.9em',
            textAlign: 'end',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            marginInlineStart: 'auto',
          }}>
            {today}
          </div>
        </div>

        {/* Subject. A hairline rule, not a tinted rounded panel — the callout
            box read as a UI chip pasted onto a letter. borderInlineStart so the
            rule stays beside its text under dir=rtl. */}
        {coverLetter.jobTitle && (
          <div style={{
            marginBottom: 24,
            paddingInlineStart: 12,
            borderInlineStart: `3px solid ${accent}`,
          }}>
            <span style={{ fontWeight: 600, color: ink }}>{labels.position} </span>
            <bdi>{coverLetter.jobTitle}</bdi>
          </div>
        )}

        <Salutation coverLetter={coverLetter} labels={labels} style={{ marginBottom: 16 }} />

        <LetterBody coverLetter={coverLetter} labels={labels} style={{ marginBottom: 30 }} />

        <div style={{ borderTop: `1px solid ${INK.hair}`, paddingTop: 22 }}>
          <SignatureBlock
            closing={labels.closingBestRegards}
            senderName={senderName}
            closingStyle={{ color: INK.subtle }}
            // The signature was set in the raw accent, so a pale pick made the
            // author's own name the least legible thing on their letter.
            nameStyle={{ fontWeight: 700, color: ink }}
          />
        </div>
      </div>
    </div>
  );
}

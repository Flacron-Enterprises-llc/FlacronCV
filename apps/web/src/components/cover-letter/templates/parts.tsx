'use client';

/**
 * The parts of a letter that are the same letter in all six templates.
 *
 * Salutation, body and sign-off were copy-pasted six times, which is how six
 * templates ended up with six subtly different empty states: one printed a
 * placeholder name into its letterhead, one left the closing hanging with no
 * signature under it, and all six put the salutation's comma outside any bidi
 * isolate so it jumped to the wrong end of a Latin name in Arabic. These are
 * the shared decisions; the templates keep only what makes them look different.
 */

import React from 'react';
import type { CoverLetter } from '@flacroncv/shared-types';
import type { CLLabels } from './types';
import { INK } from './shared';

/* ─── Salutation ─────────────────────────────────────────────────────────── */

export function Salutation({ coverLetter, labels, style }: {
  coverLetter: CoverLetter;
  labels: CLLabels;
  style?: React.CSSProperties;
}) {
  // Trimmed, because a name of "   " is not a name — untrimmed it passed the
  // truthiness test and produced "Dear    ,".
  const name = coverLetter.recipientName?.trim();
  return (
    <div style={style}>
      {labels.dear}{' '}
      {/* The comma lives INSIDE the isolate. Under dir=rtl the Unicode
          bidi algorithm resolves trailing neutral punctuation against the
          paragraph direction, so a Latin recipient name in an Arabic letter
          rendered as ",Amara Whitfield" — comma on the left. Isolating the
          name together with its punctuation resolves the comma against the
          name instead, which is what a reader expects. */}
      <bdi>{name || labels.hiringManager},</bdi>
    </div>
  );
}

/* ─── Body ───────────────────────────────────────────────────────────────── */

/**
 * The letter itself.
 *
 * `data-cl-body` is the hook for the paragraph rhythm in globals.css. The
 * content is injected HTML: rich text from the editor, or — before this pass —
 * raw newline-separated model output, which the browser collapsed into one
 * unbroken block because newlines are not paragraph breaks in HTML. The API now
 * normalises AI output into real paragraphs; this styles them.
 */
export function LetterBody({ coverLetter, labels, style }: {
  coverLetter: CoverLetter;
  labels: CLLabels;
  style?: React.CSSProperties;
}) {
  const content = coverLetter.content?.trim();
  if (!content) {
    return (
      <div style={{ color: INK.meta, fontStyle: 'italic', ...style }}>
        {labels.placeholder}
      </div>
    );
  }
  return (
    <div
      data-cl-body=""
      // The letter's language is not necessarily the interface's: someone
      // browsing in Arabic may well be applying to an English-speaking employer,
      // and the AI generator takes its own `language` parameter. Inheriting the
      // UI direction right-aligned an English letter and threw its full stops to
      // the wrong end of every line. `auto` takes the direction from the text
      // itself, which is correct whichever way round the two are.
      dir="auto"
      style={style}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}

/* ─── Sign-off ───────────────────────────────────────────────────────────── */

/**
 * Complimentary close, signature space, name.
 *
 * The signature gap is deliberate and fixed: a letter that will be printed and
 * signed needs room for a signature, and a letter that will not still reads as
 * a letter because of it. Templates used to vary this between 32 and 44px for
 * no reason; the one case that actually mattered — no sender name at all — left
 * the closing dangling over nothing, which they all got wrong.
 */
export function SignatureBlock({ closing, senderName, senderEmail, closingStyle, nameStyle, emailStyle }: {
  closing: string;
  senderName?: string;
  senderEmail?: string;
  closingStyle?: React.CSSProperties;
  nameStyle?: React.CSSProperties;
  emailStyle?: React.CSSProperties;
}) {
  const name = senderName?.trim();
  return (
    <div>
      <div style={closingStyle}>{closing}</div>
      {name && (
        <>
          {/* Signature space */}
          <div style={{ height: 38 }} aria-hidden="true" />
          <div style={nameStyle}>{name}</div>
          {senderEmail && (
            <div style={{ color: INK.meta, fontSize: '0.9em', marginTop: 3, ...emailStyle }}>{senderEmail}</div>
          )}
        </>
      )}
    </div>
  );
}

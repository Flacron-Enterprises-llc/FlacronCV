'use client';
import React from 'react';
import type { CLTemplateProps } from './types';

export default function ClassicTemplate({ coverLetter, senderName, senderEmail, today }: CLTemplateProps) {
  const { primaryColor = '#1e3a5f', fontFamily = 'Georgia, serif', fontSize = '14px' } = coverLetter.styling;
  const font = `${fontFamily}, serif`;

  return (
    <div style={{ fontFamily: font, fontSize, color: '#1a1a1a', lineHeight: 1.7, padding: '48px 56px', background: '#fff', minHeight: '842px' }}>
      {/* Sender block */}
      {(senderName || senderEmail) && (
        <div style={{ marginBottom: 32 }}>
          {senderName && <div style={{ fontWeight: 700, fontSize: '1.1em' }}>{senderName}</div>}
          {senderEmail && <div style={{ color: '#555', fontSize: '0.9em' }}>{senderEmail}</div>}
        </div>
      )}

      {/* Date */}
      <div style={{ marginBottom: 24, color: '#555' }}>{today}</div>

      {/* Divider */}
      <div style={{ borderTop: `2px solid ${primaryColor}`, marginBottom: 24 }} />

      {/* Recipient */}
      {(coverLetter.recipientName || coverLetter.companyName) && (
        <div style={{ marginBottom: 24 }}>
          {coverLetter.recipientName && <div style={{ fontWeight: 600 }}>{coverLetter.recipientName}</div>}
          {coverLetter.recipientTitle && <div>{coverLetter.recipientTitle}</div>}
          {coverLetter.companyName && <div>{coverLetter.companyName}</div>}
          {coverLetter.companyAddress && <div style={{ color: '#666' }}>{coverLetter.companyAddress}</div>}
        </div>
      )}

      {/* RE */}
      {coverLetter.jobTitle && (
        <div style={{ marginBottom: 24, fontWeight: 600 }}>
          RE: {coverLetter.jobTitle}
        </div>
      )}

      {/* Salutation */}
      <div style={{ marginBottom: 16 }}>
        Dear {coverLetter.recipientName || 'Hiring Manager'},
      </div>

      {/* Body */}
      {coverLetter.content ? (
        <div
          style={{ marginBottom: 32 }}
          dangerouslySetInnerHTML={{ __html: coverLetter.content }}
        />
      ) : (
        <div style={{ color: '#aaa', fontStyle: 'italic', marginBottom: 32 }}>Your letter content will appear here…</div>
      )}

      {/* Closing */}
      <div>
        <div>Sincerely,</div>
        {senderName && <div style={{ marginTop: 40, fontWeight: 600 }}>{senderName}</div>}
      </div>
    </div>
  );
}

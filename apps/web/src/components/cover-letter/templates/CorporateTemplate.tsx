'use client';
import React from 'react';
import type { CLTemplateProps } from './types';

export default function CorporateTemplate({ coverLetter, senderName, senderEmail, today }: CLTemplateProps) {
  const { primaryColor = '#0f766e', fontFamily = 'Roboto, sans-serif', fontSize = '14px' } = coverLetter.styling;

  return (
    <div style={{ fontFamily, fontSize, color: '#1a1a1a', lineHeight: 1.7, background: '#fff', minHeight: '842px' }}>
      {/* Letterhead top bar */}
      <div style={{ background: primaryColor, height: 8 }} />

      <div style={{ padding: '36px 56px 48px' }}>
        {/* Header: name left, date right */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32, paddingBottom: 20, borderBottom: `1px solid #d1d5db` }}>
          <div>
            {senderName && <div style={{ fontSize: '1.25em', fontWeight: 700, color: primaryColor }}>{senderName}</div>}
            {senderEmail && <div style={{ color: '#666', fontSize: '0.88em' }}>{senderEmail}</div>}
          </div>
          <div style={{ color: '#888', fontSize: '0.88em' }}>{today}</div>
        </div>

        {/* Recipient block */}
        {(coverLetter.recipientName || coverLetter.companyName) && (
          <div style={{ marginBottom: 28 }}>
            {coverLetter.recipientName && <div style={{ fontWeight: 600 }}>{coverLetter.recipientName}</div>}
            {coverLetter.recipientTitle && <div style={{ color: '#555' }}>{coverLetter.recipientTitle}</div>}
            {coverLetter.companyName && <div style={{ fontWeight: 500 }}>{coverLetter.companyName}</div>}
            {coverLetter.companyAddress && <div style={{ color: '#666', fontSize: '0.9em' }}>{coverLetter.companyAddress}</div>}
          </div>
        )}

        {/* Subject line */}
        {coverLetter.jobTitle && (
          <div style={{ marginBottom: 24, fontWeight: 700 }}>
            Subject: Application for {coverLetter.jobTitle}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>Dear {coverLetter.recipientName ? `${coverLetter.recipientName},` : 'Hiring Manager,'}</div>

        {coverLetter.content ? (
          <div dangerouslySetInnerHTML={{ __html: coverLetter.content }} style={{ marginBottom: 36 }} />
        ) : (
          <div style={{ color: '#aaa', fontStyle: 'italic', marginBottom: 36 }}>Your letter content will appear here…</div>
        )}

        <div style={{ borderTop: `1px solid #e5e7eb`, paddingTop: 24 }}>
          <div>Yours faithfully,</div>
          {senderName && <div style={{ marginTop: 40, fontWeight: 700 }}>{senderName}</div>}
          {senderEmail && <div style={{ color: '#666', fontSize: '0.88em', marginTop: 4 }}>{senderEmail}</div>}
        </div>
      </div>
    </div>
  );
}

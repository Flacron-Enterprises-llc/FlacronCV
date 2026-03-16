'use client';
import React from 'react';
import type { CLTemplateProps } from './types';

export default function CreativeTemplate({ coverLetter, senderName, senderEmail, today }: CLTemplateProps) {
  const { primaryColor = '#7c3aed', fontFamily = 'Inter, sans-serif', fontSize = '14px' } = coverLetter.styling;

  return (
    <div style={{ fontFamily, fontSize, color: '#1a1a1a', lineHeight: 1.7, background: '#fff', minHeight: '842px', display: 'flex' }}>
      {/* Left sidebar */}
      <div style={{ width: 12, background: primaryColor, flexShrink: 0 }} />

      {/* Main content */}
      <div style={{ flex: 1, padding: '48px 48px 48px 36px' }}>
        {/* Sender header */}
        <div style={{ marginBottom: 40, paddingBottom: 20, borderBottom: `1px solid #e5e7eb` }}>
          {senderName && <div style={{ fontSize: '1.5em', fontWeight: 800, color: primaryColor }}>{senderName}</div>}
          {senderEmail && <div style={{ color: '#666', fontSize: '0.9em', marginTop: 4 }}>{senderEmail}</div>}
          <div style={{ color: '#999', fontSize: '0.85em', marginTop: 8 }}>{today}</div>
        </div>

        {/* Recipient */}
        {(coverLetter.recipientName || coverLetter.companyName) && (
          <div style={{ marginBottom: 28 }}>
            {coverLetter.recipientName && <div style={{ fontWeight: 600 }}>{coverLetter.recipientName}</div>}
            {coverLetter.recipientTitle && <div style={{ color: '#555' }}>{coverLetter.recipientTitle}</div>}
            {coverLetter.companyName && <div style={{ color: '#555' }}>{coverLetter.companyName}</div>}
          </div>
        )}

        {/* RE block */}
        {coverLetter.jobTitle && (
          <div style={{ marginBottom: 24, padding: '10px 16px', background: `${primaryColor}18`, borderRadius: 8 }}>
            <span style={{ fontWeight: 700, color: primaryColor }}>RE: {coverLetter.jobTitle}</span>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>Dear {coverLetter.recipientName || 'Hiring Manager'},</div>

        {coverLetter.content ? (
          <div dangerouslySetInnerHTML={{ __html: coverLetter.content }} style={{ marginBottom: 32 }} />
        ) : (
          <div style={{ color: '#aaa', fontStyle: 'italic', marginBottom: 32 }}>Your letter content will appear here…</div>
        )}

        <div>
          <div style={{ color: '#555' }}>With enthusiasm,</div>
          {senderName && <div style={{ marginTop: 36, fontWeight: 700, fontSize: '1.05em', color: primaryColor }}>{senderName}</div>}
        </div>
      </div>
    </div>
  );
}

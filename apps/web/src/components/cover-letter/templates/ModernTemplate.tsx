'use client';
import React from 'react';
import type { CLTemplateProps } from './types';

export default function ModernTemplate({ coverLetter, senderName, senderEmail, today }: CLTemplateProps) {
  const { primaryColor = '#2563eb', fontFamily = 'Inter, sans-serif', fontSize = '14px' } = coverLetter.styling;

  return (
    <div style={{ fontFamily, fontSize, color: '#1a1a1a', lineHeight: 1.7, background: '#fff', minHeight: '842px' }}>
      {/* Header band */}
      <div style={{ background: primaryColor, padding: '32px 48px', color: '#fff' }}>
        <div style={{ fontSize: '1.6em', fontWeight: 800, letterSpacing: '-0.02em' }}>
          {senderName || 'Your Name'}
        </div>
        {senderEmail && <div style={{ opacity: 0.85, fontSize: '0.9em', marginTop: 4 }}>{senderEmail}</div>}
      </div>

      {/* Body */}
      <div style={{ padding: '40px 48px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
          {/* Recipient */}
          <div>
            {coverLetter.recipientName && <div style={{ fontWeight: 600 }}>{coverLetter.recipientName}</div>}
            {coverLetter.recipientTitle && <div style={{ color: '#555' }}>{coverLetter.recipientTitle}</div>}
            {coverLetter.companyName && <div style={{ color: '#555' }}>{coverLetter.companyName}</div>}
            {coverLetter.companyAddress && <div style={{ color: '#888', fontSize: '0.88em' }}>{coverLetter.companyAddress}</div>}
          </div>
          <div style={{ color: '#888', fontSize: '0.88em', textAlign: 'right' }}>{today}</div>
        </div>

        {/* Job reference */}
        {coverLetter.jobTitle && (
          <div style={{ marginBottom: 20, padding: '8px 14px', borderLeft: `4px solid ${primaryColor}`, background: `${primaryColor}10`, borderRadius: 4 }}>
            <span style={{ fontWeight: 600, color: primaryColor }}>Position: </span>{coverLetter.jobTitle}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>Dear {coverLetter.recipientName || 'Hiring Manager'},</div>

        {coverLetter.content ? (
          <div dangerouslySetInnerHTML={{ __html: coverLetter.content }} style={{ marginBottom: 32 }} />
        ) : (
          <div style={{ color: '#aaa', fontStyle: 'italic', marginBottom: 32 }}>Your letter content will appear here…</div>
        )}

        <div style={{ borderTop: `1px solid ${primaryColor}30`, paddingTop: 20 }}>
          <div style={{ color: '#555' }}>Best regards,</div>
          {senderName && <div style={{ marginTop: 32, fontWeight: 700, color: primaryColor }}>{senderName}</div>}
        </div>
      </div>
    </div>
  );
}

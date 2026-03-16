'use client';
import React from 'react';
import type { CLTemplateProps } from './types';

export default function ExecutiveTemplate({ coverLetter, senderName, senderEmail, today }: CLTemplateProps) {
  const { primaryColor = '#0c0c0c', fontFamily = 'Georgia, serif', fontSize = '14px' } = coverLetter.styling;

  return (
    <div style={{ fontFamily, fontSize, color: '#1a1a1a', lineHeight: 1.7, padding: '48px 56px', background: '#fff', minHeight: '842px' }}>
      {/* Right-aligned sender header */}
      <div style={{ textAlign: 'right', marginBottom: 40 }}>
        {senderName && <div style={{ fontSize: '1.3em', fontWeight: 700, letterSpacing: '-0.01em' }}>{senderName}</div>}
        {senderEmail && <div style={{ color: '#666', fontSize: '0.9em', marginTop: 4 }}>{senderEmail}</div>}
        <div style={{ color: '#999', fontSize: '0.88em', marginTop: 8 }}>{today}</div>
      </div>

      {/* Full-width divider */}
      <div style={{ height: 3, background: `linear-gradient(to right, ${primaryColor}, ${primaryColor}33)`, marginBottom: 40, borderRadius: 2 }} />

      {/* Recipient */}
      {(coverLetter.recipientName || coverLetter.companyName) && (
        <div style={{ marginBottom: 32 }}>
          {coverLetter.recipientName && <div style={{ fontWeight: 600 }}>{coverLetter.recipientName}</div>}
          {coverLetter.recipientTitle && <div style={{ color: '#555' }}>{coverLetter.recipientTitle}</div>}
          {coverLetter.companyName && <div style={{ color: '#555' }}>{coverLetter.companyName}</div>}
          {coverLetter.companyAddress && <div style={{ color: '#777', fontSize: '0.9em' }}>{coverLetter.companyAddress}</div>}
        </div>
      )}

      {/* RE */}
      {coverLetter.jobTitle && (
        <div style={{ marginBottom: 28, fontWeight: 600, fontSize: '1.05em', borderLeft: `3px solid ${primaryColor}`, paddingLeft: 12 }}>
          Re: {coverLetter.jobTitle}
        </div>
      )}

      <div style={{ marginBottom: 20 }}>Dear {coverLetter.recipientName || 'Hiring Manager'},</div>

      {coverLetter.content ? (
        <div dangerouslySetInnerHTML={{ __html: coverLetter.content }} style={{ marginBottom: 40 }} />
      ) : (
        <div style={{ color: '#aaa', fontStyle: 'italic', marginBottom: 40 }}>Your letter content will appear here…</div>
      )}

      {/* Closing */}
      <div style={{ borderTop: `1px solid #d1d5db`, paddingTop: 28 }}>
        <div style={{ fontStyle: 'italic', color: '#555' }}>Respectfully yours,</div>
        {senderName && <div style={{ marginTop: 44, fontWeight: 700, fontSize: '1.05em' }}>{senderName}</div>}
        {senderEmail && <div style={{ color: '#888', fontSize: '0.88em', marginTop: 4 }}>{senderEmail}</div>}
      </div>
    </div>
  );
}

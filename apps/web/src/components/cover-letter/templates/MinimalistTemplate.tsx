'use client';
import React from 'react';
import type { CLTemplateProps } from './types';

export default function MinimalistTemplate({ coverLetter, senderName, senderEmail, today }: CLTemplateProps) {
  const { primaryColor = '#374151', fontFamily = 'Inter, sans-serif', fontSize = '14px' } = coverLetter.styling;

  return (
    <div style={{ fontFamily, fontSize, color: '#2d2d2d', lineHeight: 1.9, padding: '64px 72px', background: '#fff', minHeight: '842px' }}>
      {/* Name — minimal, top-left */}
      {senderName && (
        <div style={{ fontSize: '0.8em', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: primaryColor, marginBottom: 48 }}>
          {senderName}
        </div>
      )}

      {/* Date + recipient in one subtle row */}
      <div style={{ display: 'flex', gap: 32, marginBottom: 48, color: '#888', fontSize: '0.88em' }}>
        <span>{today}</span>
        {coverLetter.companyName && <span>{coverLetter.companyName}</span>}
      </div>

      {/* RE line */}
      {coverLetter.jobTitle && (
        <div style={{ marginBottom: 32, fontSize: '0.9em', color: '#555' }}>
          Re: {coverLetter.jobTitle}
        </div>
      )}

      <div style={{ marginBottom: 24 }}>Dear {coverLetter.recipientName || 'Hiring Manager'},</div>

      {coverLetter.content ? (
        <div dangerouslySetInnerHTML={{ __html: coverLetter.content }} style={{ marginBottom: 48 }} />
      ) : (
        <div style={{ color: '#bbb', fontStyle: 'italic', marginBottom: 48 }}>Your letter content will appear here…</div>
      )}

      <div style={{ fontSize: '0.88em', color: '#555' }}>
        <div>Regards,</div>
        {senderName && <div style={{ marginTop: 32, fontWeight: 600, color: '#2d2d2d' }}>{senderName}</div>}
        {senderEmail && <div style={{ color: '#888', marginTop: 4 }}>{senderEmail}</div>}
      </div>
    </div>
  );
}

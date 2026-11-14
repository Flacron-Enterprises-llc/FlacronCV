'use client';

import React from 'react';
import { ensureDarkSurface, readableOn, INK } from '@/lib/design-tokens';

/**
 * Mini thumbnail for the template picker.
 *
 * Colours are derived exactly as the real templates derive them: `band` for
 * surfaces that carry white marks, `ink` for anything standing in for text on
 * white. Painting the raw accent here would show a legible preview of an
 * illegible letter — the same divergence the CV picker had.
 *
 * `page` draws a whole page (A4-ish proportions) instead of the letterhead
 * strip: the template's own header, then generic body paragraphs and a
 * sign-off, so the cover-letter list can show which design each letter uses.
 */
export default function CLThumbnail({ templateId, color, rtl, page = false }: {
  templateId: string;
  color: string;
  rtl?: boolean;
  page?: boolean;
}) {
  const c = readableOn(color, '#ffffff', 4.5);   // stands in for accent text
  const band = ensureDarkSurface(color, 5);      // surfaces carrying white marks
  const rule = color;                            // decorative rules, as chosen
  const head = INK.heading;                      // the sender's name
  const meta = INK.meta;                         // dates, secondary lines
  const body = '#dcdfe4';                        // body copy
  // Every template now mirrors under dir=rtl (Executive's header moved from a
  // physical 'right' to a logical 'end'), so the whole card can mirror with a
  // single transform rather than six sets of hand-flipped coordinates.
  const g = rtl ? 'translate(120,0) scale(-1,1)' : undefined;
  const H = page ? 170 : 48;
  const Frame = ({ children, inset = 8 }: { children: React.ReactNode; inset?: number }) => (
    <svg viewBox={`0 0 120 ${H}`} xmlns="http://www.w3.org/2000/svg" className="w-full h-full" aria-hidden="true">
      <rect width="120" height={H} fill="#fff"/>
      <g transform={g}>
        {children}
        {page && <PageBody x={inset} body={body} meta={meta} />}
      </g>
    </svg>
  );

  if (templateId === 'classic') return (
    <Frame>
      <rect x="8" y="6" width="60" height="3" rx="1" fill={head}/>
      <rect x="8" y="11" width="40" height="2" rx="1" fill={meta}/>
      <rect x="8" y="16" width="104" height="1.5" fill={rule}/>
      <rect x="8" y="21" width="80" height="2" rx="1" fill={body}/>
      <rect x="8" y="25" width="104" height="2" rx="1" fill={body}/>
      <rect x="8" y="29" width="90" height="2" rx="1" fill={body}/>
      <rect x="8" y="33" width="70" height="2" rx="1" fill={body}/>
    </Frame>
  );
  if (templateId === 'modern') return (
    <Frame>
      <rect width="120" height="14" fill={band}/>
      <rect x="8" y="3" width="50" height="4" rx="1" fill="#fff"/>
      <rect x="8" y="9" width="30" height="2" rx="1" fill="#fff" opacity="0.75"/>
      <rect x="8" y="18" width="80" height="2" rx="1" fill={body}/>
      <rect x="8" y="22" width="104" height="2" rx="1" fill={body}/>
      <rect x="8" y="26" width="90" height="2" rx="1" fill={body}/>
      <rect x="8" y="30" width="70" height="2" rx="1" fill={body}/>
      <rect x="8" y="36" width="40" height="2" rx="1" fill={c}/>
    </Frame>
  );
  if (templateId === 'minimalist') return (
    <Frame>
      <rect x="8" y="6" width="35" height="2" rx="1" fill={c}/>
      <rect x="8" y="14" width="104" height="2" rx="1" fill={body}/>
      <rect x="8" y="19" width="80" height="2" rx="1" fill={body}/>
      <rect x="8" y="24" width="104" height="2" rx="1" fill={body}/>
      <rect x="8" y="29" width="60" height="2" rx="1" fill={body}/>
      <rect x="8" y="36" width="30" height="2" rx="1" fill={meta}/>
    </Frame>
  );
  if (templateId === 'creative') return (
    <Frame inset={12}>
      <rect width="5" height={H} fill={rule}/>
      <rect x="12" y="6" width="50" height="4" rx="1" fill={c}/>
      <rect x="12" y="12" width="30" height="2" rx="1" fill={meta}/>
      <rect x="12" y="18" width="100" height="2" rx="1" fill={body}/>
      <rect x="12" y="23" width="90" height="2" rx="1" fill={body}/>
      <rect x="12" y="28" width="100" height="2" rx="1" fill={body}/>
      <rect x="12" y="33" width="55" height="2" rx="1" fill={body}/>
    </Frame>
  );
  if (templateId === 'corporate') return (
    <Frame>
      <rect width="120" height="4" fill={rule}/>
      <rect x="8" y="8" width="55" height="3" rx="1" fill={c}/>
      <rect x="8" y="13" width="35" height="2" rx="1" fill={meta}/>
      <rect x="8" y="17" width="104" height="1" fill={INK.hair}/>
      <rect x="8" y="21" width="80" height="2" rx="1" fill={body}/>
      <rect x="8" y="25" width="104" height="2" rx="1" fill={body}/>
      <rect x="8" y="29" width="90" height="2" rx="1" fill={body}/>
      <rect x="8" y="36" width="40" height="2" rx="1" fill={meta}/>
    </Frame>
  );
  // executive
  return (
    <Frame>
      <rect x="50" y="6" width="62" height="3" rx="1" fill={head}/>
      <rect x="70" y="11" width="42" height="2" rx="1" fill={meta}/>
      <rect x="8" y="16" width="104" height="2" rx="1" fill={rule}/>
      <rect x="8" y="22" width="80" height="2" rx="1" fill={body}/>
      <rect x="8" y="26" width="104" height="2" rx="1" fill={body}/>
      <rect x="8" y="30" width="70" height="2" rx="1" fill={body}/>
      <rect x="8" y="38" width="40" height="2" rx="1" fill={meta}/>
    </Frame>
  );
}

/** Body paragraphs and sign-off below the header, for the full-page variant. */
function PageBody({ x, body, meta }: { x: number; body: string; meta: string }) {
  const w = 112 - x;
  const paragraphs = [
    [1, 0.92, 1, 0.6],
    [1, 0.95, 0.88, 1, 0.45],
    [1, 0.9, 0.7],
  ];
  let y = 48;
  const rects: React.ReactNode[] = [];
  paragraphs.forEach((lines, p) => {
    lines.forEach((frac, i) => {
      rects.push(<rect key={`${p}-${i}`} x={x} y={y} width={w * frac} height="2" rx="1" fill={body}/>);
      y += 5;
    });
    y += 5;
  });
  return (
    <>
      {rects}
      <rect x={x} y={y + 4} width="26" height="2" rx="1" fill={meta}/>
      <rect x={x} y={y + 16} width="34" height="2.5" rx="1" fill={meta}/>
    </>
  );
}

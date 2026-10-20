'use client';

import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { findVisibleTourTarget, placeTooltip } from '@/lib/app-tour';
import AppTourCard from './AppTourCard';

interface AppTourOverlayProps {
  target: string;
  title: string;
  body: string;
  progress: string;
  backLabel: string;
  skipLabel: string;
  nextLabel: string;
  finishLabel: string;
  dialogLabel: string;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  onBack: () => void;
  onSkip: () => void;
  onNext: () => void;
}

interface Frame {
  top: number;
  left: number;
  width: number;
  height: number;
  tipTop: number;
  tipLeft: number;
}

/**
 * Spotlight plus tooltip. The spotlight blocks clicks on the highlighted
 * control so the tour cannot create a document, run AI, or start a payment.
 */
export default function AppTourOverlay(props: AppTourOverlayProps) {
  const { target } = props;
  const [frame, setFrame] = useState<Frame | null>(null);

  useLayoutEffect(() => {
    let frameId = 0;
    const update = () => {
      const el = findVisibleTourTarget(target);
      const tip = document.getElementById('app-tour-card');
      const tipBox = tip?.getBoundingClientRect();
      const width = tipBox?.width || 320;
      const height = tipBox?.height || 180;
      const banner = document.querySelector('[data-cookie-banner]');
      const bottom = banner ? Math.max(8, banner.getBoundingClientRect().height + 12) : 8;
      if (!el) {
        const top = Math.max(8, (window.innerHeight - height) / 2);
        const left = Math.max(8, (window.innerWidth - width) / 2);
        setFrame({ top: 0, left: 0, width: 0, height: 0, tipTop: top, tipLeft: left });
        return;
      }
      const rect = el.getBoundingClientRect();
      const pad = 6;
      const placed = placeTooltip(
        { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 },
        { width, height },
        { width: window.innerWidth, height: window.innerHeight },
        { top: 8, right: 8, bottom, left: 8 },
      );
      setFrame({
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
        tipTop: placed.top,
        tipLeft: placed.left,
      });
    };

    const onChange = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(update);
    };

    update();
    const el = findVisibleTourTarget(target);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduce ? 'auto' : 'auto' });
    onChange();

    const observed = findVisibleTourTarget(target);
    const observer = new ResizeObserver(onChange);
    if (observed) observer.observe(observed);
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
    };
  }, [target, props.title, props.body]);

  const overlay = (
    <div className="pointer-events-none fixed inset-0 z-[80]">
      <div className="pointer-events-auto absolute inset-0" />
      {frame && frame.width > 0 && (
        <div
          className="pointer-events-auto absolute rounded-xl motion-safe:transition-[top,left,width,height] motion-safe:duration-200 motion-reduce:transition-none"
          style={{
            top: frame.top,
            left: frame.left,
            width: frame.width,
            height: frame.height,
            boxShadow: '0 0 0 9999px rgba(28, 25, 23, 0.55)',
            outline: '2px solid rgb(234 88 12)',
          }}
        />
      )}
      <div
        id="app-tour-card"
        className="pointer-events-auto absolute motion-safe:transition-[top,left] motion-safe:duration-200 motion-reduce:transition-none"
        style={{ top: frame?.tipTop ?? 16, left: frame?.tipLeft ?? 16 }}
      >
        <AppTourCard {...props} />
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(overlay, document.body);
}

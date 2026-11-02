'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { PAGE_CSS_HEIGHT, PAGE_CSS_WIDTH } from '@flacroncv/career-shared';

/** Scale a full A4 sheet as one document. The wrapper matches the scaled size. */
export function ScaledPage({
  children,
  labelled,
  caption,
}: {
  children: ReactNode;
  labelled?: boolean;
  caption?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const measure = () => {
      const next = node.getBoundingClientRect().width;
      setWidth((current) => (Math.abs(current - next) < 0.5 ? current : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const scale = width > 0 ? width / PAGE_CSS_WIDTH : 0;
  const scaledHeight = scale > 0 ? PAGE_CSS_HEIGHT * scale : undefined;
  const page = (
    <div
      ref={ref}
      className="relative w-full min-w-0 overflow-hidden"
      style={{
        contain: 'inline-size',
        containerType: 'inline-size',
        aspectRatio: `${PAGE_CSS_WIDTH} / ${PAGE_CSS_HEIGHT}`,
        height: scaledHeight,
      }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left bg-white"
        style={{
          width: PAGE_CSS_WIDTH,
          height: PAGE_CSS_HEIGHT,
          transform: scale > 0 ? `scale(${scale})` : `scale(calc(100cqw / ${PAGE_CSS_WIDTH}))`,
        }}
      >
        {children}
      </div>
    </div>
  );
  if (!labelled) return page;
  return (
    <figure className="min-w-0">
      {caption ? (
        <figcaption className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wide text-career-muted">{caption}</figcaption>
      ) : null}
      {page}
    </figure>
  );
}

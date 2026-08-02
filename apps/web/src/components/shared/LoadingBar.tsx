'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function LoadingBar() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setLoading(true);
    setProgress(20);

    const timer1 = setTimeout(() => setProgress(60), 100);
    const timer2 = setTimeout(() => setProgress(80), 200);
    const timer3 = setTimeout(() => {
      setProgress(100);
      setTimeout(() => setLoading(false), 200);
    }, 500);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [pathname]);

  if (!loading) return null;

  return (
    <div
      // start-0, not left-0: the bar grows by width, so in Arabic and Urdu it
      // has to be anchored to the reading start or it fills away from the edge
      // the reader's eye is on.
      className="fixed start-0 top-0 z-50 h-1 bg-brand-600 transition-all duration-300 ease-out"
      style={{ width: `${progress}%` }}
    />
  );
}

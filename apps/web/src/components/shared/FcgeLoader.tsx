'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { usePathname } from '@/i18n/routing';
import { useAuth } from '@/providers/AuthProvider';
import { isAllowed, onConsentChange } from '@/lib/consent';
import {
  fcgeIdentify,
  fcgeNoteUsage,
  fcgeReset,
  fcgeScriptSrc,
  fcgeTraits,
  installFcgeStub,
  isStaffPath,
} from '@/lib/fcge';

/**
 * Installs the FCGE stub, then loads the SDK, only after analytics consent
 * and never on /admin or /crm. A later accept loads it; a decline does not.
 */
export default function FcgeLoader() {
  const pathname = usePathname();
  const { user, degraded, placeholderAccount } = useAuth();
  const blocked = isStaffPath(pathname || '/');
  const [src, setSrc] = useState<string | null>(null);
  const identified = useRef<string | null>(null);
  const userRef = useRef(user);
  const degradedRef = useRef(degraded);
  const placeholderRef = useRef(placeholderAccount);
  userRef.current = user;
  degradedRef.current = degraded;
  placeholderRef.current = placeholderAccount;

  const syncIdentity = () => {
    const current = userRef.current;
    if (!current || degradedRef.current || placeholderRef.current) {
      if (!current && identified.current !== null) {
        identified.current = null;
        fcgeReset();
      }
      return;
    }
    const traits = fcgeTraits(current);
    const key = JSON.stringify(traits);
    if (key !== identified.current) {
      identified.current = key;
      fcgeIdentify(traits);
    }
    fcgeNoteUsage(current);
  };

  useLayoutEffect(() => {
    const sync = () => {
      if (blocked || !isAllowed('analytics')) {
        setSrc(null);
        if (!isAllowed('analytics')) {
          identified.current = null;
          fcgeReset();
        }
        return;
      }
      installFcgeStub();
      setSrc(fcgeScriptSrc());
      syncIdentity();
    };
    sync();
    return onConsentChange(sync);
  }, [blocked]);

  useEffect(() => {
    if (blocked || !isAllowed('analytics')) return;
    syncIdentity();
  }, [user, degraded, placeholderAccount, blocked]);

  if (!src || blocked) return null;
  return <Script id="fcge-sdk" src={src} strategy="afterInteractive" />;
}

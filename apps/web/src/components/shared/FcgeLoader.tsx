'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { usePathname } from '@/i18n/routing';
import { useAuth } from '@/providers/AuthProvider';
import {
  fcgeIdentify,
  fcgeNoteUsage,
  fcgeReset,
  fcgeTraits,
  installFcgeStub,
  isStaffPath,
} from '@/lib/fcge';

/**
 * Syncs identity and usage limits with FCGE on login, account changes, and logout.
 * Never tracks on /admin or /crm.
 */
export default function FcgeLoader() {
  const pathname = usePathname();
  const { user, degraded, placeholderAccount } = useAuth();
  const blocked = isStaffPath(pathname || '/');
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
    if (blocked) return;
    installFcgeStub();
    syncIdentity();
  }, [blocked]);

  useEffect(() => {
    if (blocked) return;
    syncIdentity();
  }, [user, degraded, placeholderAccount, blocked]);

  return null;
}


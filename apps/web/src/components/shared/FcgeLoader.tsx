'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from '@/i18n/routing';
import { useAuth } from '@/providers/AuthProvider';
import { isAllowed, onConsentChange } from '@/lib/consent';
import {
  fcgeIdentify,
  fcgeLoaded,
  fcgeNoteUsage,
  fcgeReset,
  fcgeTraits,
  isStaffPath,
  loadFcge,
} from '@/lib/fcge';

/**
 * The one place the Flacron Growth Engine SDK and support chat are loaded.
 * Loads only after analytics consent (on mount for a returning visitor who
 * already accepted, or the moment the banner is accepted), never on /admin or
 * /crm, and never when FCGE is not configured. Then syncs identity and usage
 * limits on login, account changes, and logout.
 */
export default function FcgeLoader() {
  const pathname = usePathname();
  const { user, degraded, placeholderAccount } = useAuth();
  // Staff accounts are never tracked or identified, on any page: their
  // sessions are internal, and an identify call would send their details.
  const isStaffUser = !placeholderAccount && (user?.role === 'admin' || user?.role === 'super_admin');
  const blocked = isStaffPath(pathname || '/') || isStaffUser;
  // Bumped on every saved consent decision so the load effect re-runs.
  const [consentVersion, setConsentVersion] = useState(0);
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

  useEffect(() => onConsentChange(() => setConsentVersion((v) => v + 1)), []);

  useLayoutEffect(() => {
    // A third-party script cannot be unloaded. If it is already running and the
    // visitor withdrew consent, a client-side navigation reached a staff
    // page, or a staff member signed in, the only way to honour that is a fresh document without it.
    if (fcgeLoaded() && (blocked || !isAllowed('analytics'))) {
      fcgeReset();
      window.location.reload();
      return;
    }
    if (blocked) return;
    if (loadFcge()) syncIdentity();
  }, [blocked, consentVersion]);

  useEffect(() => {
    if (blocked) return;
    syncIdentity();
  }, [user, degraded, placeholderAccount, blocked]);

  return null;
}

'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { isApiError, type AdminBusinessRow, type AdminEvidenceView, type ApiClient, type VerificationMethod, type VerifiedLabel } from '@flacroncv/career-api-client';
import { VERIFICATION_METHODS, VERIFIED_LABELS, isCalendarDate } from '@flacroncv/career-shared';
import V1Card from '@/components/ui/Card';
import { Badge, Button, Input } from '@/components/career/ui';

const selectClass = 'block h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-base text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-white';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Operator tool for spec section 25: record an issuer, assessment or reference
 * check on an evidence item the person asked to be checked. The operator sees
 * the item's title, type, label and history only, never its files. Every
 * lookup, record and revocation is audited by the career service.
 */
export function EvidenceVerificationTool({ api }: { api: ApiClient }) {
  const t = useTranslations('career.admin');
  const tEvidence = useTranslations('career.evidence');
  const [evidenceId, setEvidenceId] = useState('');
  const [item, setItem] = useState<AdminEvidenceView | null>(null);
  const [label, setLabel] = useState<VerifiedLabel>('issuer_verified');
  const [method, setMethod] = useState<VerificationMethod>('issuer_registry');
  const [checkedOn, setCheckedOn] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [scope, setScope] = useState('');
  const [issuerName, setIssuerName] = useState('');
  const [permissionEvidence, setPermissionEvidence] = useState('');
  const [revokeReason, setRevokeReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  async function act(work: () => Promise<AdminEvidenceView>, success: string) {
    setBusy(true);
    setNote(null);
    try {
      setItem(await work());
      setNote({ tone: 'success', text: success });
    } catch (error) {
      setNote({
        tone: 'error',
        text: isApiError(error, 'not_found') ? t('verify_not_found') : isApiError(error, 'validation_error') ? t('verify_invalid') : t('verify_failed'),
      });
    } finally {
      setBusy(false);
    }
  }

  function lookup(event: FormEvent) {
    event.preventDefault();
    if (!UUID.test(evidenceId.trim())) return setNote({ tone: 'error', text: t('verify_not_found') });
    void act(() => api.adminEvidence(evidenceId.trim()), t('verify_found'));
  }

  function record(event: FormEvent) {
    event.preventDefault();
    if (!item) return;
    if (!isCalendarDate(checkedOn) || (expiresOn && !isCalendarDate(expiresOn)) || !scope.trim() || !issuerName.trim() || !permissionEvidence.trim()) {
      return setNote({ tone: 'error', text: t('verify_invalid') });
    }
    void act(
      () =>
        api.recordEvidenceVerification(item.id, {
          label,
          method,
          checkedOn,
          expiresOn: expiresOn || null,
          scope: scope.trim(),
          issuerName: issuerName.trim(),
          permissionEvidence: permissionEvidence.trim(),
        }),
      t('verify_recorded'),
    );
  }

  return (
    <V1Card>
      <h2 className="text-lg font-semibold text-stone-900 dark:text-white">{t('verify_title')}</h2>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t('verify_help')}</p>
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={lookup}>
        <div className="min-w-[16rem] flex-1">
          <Input label={t('verify_evidence_id')} value={evidenceId} onChange={(event) => setEvidenceId(event.target.value)} dir="ltr" />
        </div>
        <Button type="submit" disabled={busy}>{t('verify_lookup')}</Button>
      </form>
      {note ? (
        <p role={note.tone === 'error' ? 'alert' : 'status'} className={`mt-3 text-sm ${note.tone === 'error' ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>
          {note.text}
        </p>
      ) : null}
      {item ? (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-stone-900 dark:text-white" dir="auto">{item.title}</span>
            <Badge tone="neutral">{tEvidence(`type_${item.evidenceType}`)}</Badge>
            <Badge tone="confirmed">{tEvidence(`label_${item.evidenceLabel}`)}</Badge>
          </div>
          {item.verifications.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {item.verifications.map((check) => (
                <li key={check.id} className="rounded-md border border-stone-200 p-2 dark:border-stone-800">
                  <p className="font-semibold">
                    {tEvidence(`label_${check.label}`)} · {tEvidence(`method_${check.method}`)} · {check.checkedOn}{' '}
                    <Badge tone={check.active ? 'confirmed' : 'later'}>
                      {check.revokedAt ? tEvidence('check_revoked') : check.active ? tEvidence('check_active') : tEvidence('check_expired')}
                    </Badge>
                  </p>
                  <p dir="auto">{tEvidence('check_issuer', { issuer: check.issuerName })} · {tEvidence('check_scope', { scope: check.scope })}</p>
                  {!check.revokedAt ? (
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <div className="min-w-[12rem] flex-1">
                        <Input label={t('verify_revoke_reason')} value={revokeReason} maxLength={500} onChange={(event) => setRevokeReason(event.target.value)} />
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy || !revokeReason.trim()}
                        onClick={() => void act(() => api.revokeEvidenceVerification(check.id, revokeReason.trim()), t('verify_revoked'))}
                      >
                        {t('verify_revoke')}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={record}>
            <label className="block space-y-1.5 text-sm font-semibold">
              <span>{t('verify_label')}</span>
              <select className={selectClass} value={label} onChange={(event) => setLabel(event.target.value as VerifiedLabel)}>
                {VERIFIED_LABELS.map((value) => <option key={value} value={value}>{tEvidence(`label_${value}`)}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5 text-sm font-semibold">
              <span>{t('verify_method')}</span>
              <select className={selectClass} value={method} onChange={(event) => setMethod(event.target.value as VerificationMethod)}>
                {VERIFICATION_METHODS.map((value) => <option key={value} value={value}>{tEvidence(`method_${value}`)}</option>)}
              </select>
            </label>
            <Input label={t('verify_checked_on')} type="date" value={checkedOn} onChange={(event) => setCheckedOn(event.target.value)} />
            <Input label={t('verify_expires_on')} type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} />
            <Input label={t('verify_issuer')} value={issuerName} maxLength={200} onChange={(event) => setIssuerName(event.target.value)} />
            <Input label={t('verify_scope')} hint={t('verify_scope_hint')} value={scope} maxLength={500} onChange={(event) => setScope(event.target.value)} />
            <div className="sm:col-span-2">
              <Input label={t('verify_permission')} hint={t('verify_permission_hint')} value={permissionEvidence} maxLength={500} onChange={(event) => setPermissionEvidence(event.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>{t('verify_record')}</Button>
            </div>
          </form>
        </div>
      ) : null}
    </V1Card>
  );
}

/** Invitation and role counts per Business workspace. Counts only: no addresses or candidate data. */
export function BusinessOverviewTool({ api }: { api: ApiClient }) {
  const t = useTranslations('career.admin');
  const [rows, setRows] = useState<AdminBusinessRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.adminBusiness().then((list) => setRows(list.items)).catch(() => setFailed(true));
  }, [api]);

  return (
    <V1Card>
      <h2 className="text-lg font-semibold text-stone-900 dark:text-white">{t('business_title')}</h2>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t('business_help')}</p>
      {failed ? <p className="mt-2 text-sm text-red-700 dark:text-red-300">{t('business_failed')}</p> : null}
      {rows && rows.length === 0 ? <p className="mt-2 text-sm text-stone-500">{t('business_empty')}</p> : null}
      {rows && rows.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-start text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-500 dark:border-stone-800">
                <th className="py-2 pe-3 text-start">{t('business_workspace')}</th>
                <th className="py-2 pe-3 text-start">{t('business_staff')}</th>
                <th className="py-2 pe-3 text-start">{t('business_candidates')}</th>
                <th className="py-2 text-start">{t('business_invites')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.workspaceId} className="border-b border-stone-200 align-top dark:border-stone-800">
                  <td className="py-2 pe-3 font-mono text-xs" dir="ltr">{row.workspaceId}</td>
                  <td className="py-2 pe-3">
                    {t('business_staff_counts', { managers: row.staff.manager, counselors: row.staff.counselor, billing: row.staff.billing_admin })}
                  </td>
                  <td className="py-2 pe-3">
                    {t('business_candidate_counts', { invited: row.candidates.invited, active: row.candidates.active, archived: row.candidates.archived })}
                  </td>
                  <td className="py-2">
                    {t('business_invite_counts', { staff: row.pendingStaffInvites, candidates: row.pendingCandidateInvites, expired: row.expiredInvites })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </V1Card>
  );
}

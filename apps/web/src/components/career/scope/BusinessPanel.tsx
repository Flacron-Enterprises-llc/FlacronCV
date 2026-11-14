'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { isApiError } from '@flacroncv/career-api-client';
import type {
  ApiClient,
  BusinessCandidateDetail,
  BusinessInvitation,
  BusinessMemberships,
  BusinessOverview,
  BusinessQueueItem,
  BusinessReport,
  BusinessStaffRole,
  BusinessUsage,
} from '@flacroncv/career-api-client';
import { Badge, Button, Card, ConfirmDialog, Input } from '@/components/career/ui';
import { errorNote, ScopeNote, useScopeBusy, type ActionNote } from './scope-actions';

const selectClass =
  'block h-11 w-full rounded-md border border-career-line bg-career-surface px-3 text-base text-career-ink focus:border-career-navy focus:outline-none focus:ring-2 focus:ring-career-orange-text/40';

/** The full invitation link for the inviter to copy while email is not connected. */
export function inviteLink(invitePath: string, origin: string, locale: string): string {
  return `${origin.replace(/\/+$/, '')}/${locale}${invitePath}`;
}

/**
 * CV23 Business workspace. One screen serves every role: the account holder
 * and managers run the workspace, counselors see assigned candidates and the
 * shared queue, billing administrators see invoices and usage totals only,
 * and an invited candidate manages their own membership. What each part
 * shows comes from the role's scope the API returns, and the API enforces it.
 */
export function BusinessPanel({ api, memberships }: { api: ApiClient; memberships: BusinessMemberships }) {
  const t = useTranslations('career.scope');
  const choices = [
    ...(memberships.ownsWorkspace ? [{ workspaceId: memberships.ownWorkspaceId, label: t('workspace_own') }] : []),
    ...memberships.staffOf.map((staff, index) => ({
      workspaceId: staff.workspaceId,
      label: t('workspace_staff', { n: index + 1, role: t(`role_${staff.role}`) }),
    })),
  ];
  const [workspaceId, setWorkspaceId] = useState<string | null>(choices[0]?.workspaceId ?? null);
  const acting = workspaceId === memberships.ownWorkspaceId ? undefined : workspaceId ?? undefined;

  return (
    <div className="space-y-6">
      {choices.length > 1 ? (
        <Card>
          <label className="block space-y-1.5 text-sm font-semibold text-career-ink">
            <span>{t('workspace_choose')}</span>
            <select className={selectClass} value={workspaceId ?? ''} onChange={(event) => setWorkspaceId(event.target.value)}>
              {choices.map((choice) => (
                <option key={choice.workspaceId} value={choice.workspaceId}>{choice.label}</option>
              ))}
            </select>
          </label>
        </Card>
      ) : null}
      {workspaceId ? <WorkspaceView key={workspaceId} api={api} workspaceId={acting} /> : null}
      {memberships.candidateOf.length > 0 ? <MyMemberships api={api} initial={memberships.candidateOf} /> : null}
    </div>
  );
}

function WorkspaceView({ api, workspaceId }: { api: ApiClient; workspaceId: string | undefined }) {
  const t = useTranslations('career.scope');
  const [view, setView] = useState<BusinessOverview | null>(null);
  const [failed, setFailed] = useState<ActionNote | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await api.businessOverview(workspaceId));
      setFailed(null);
    } catch (error) {
      setFailed(errorNote(error));
    }
  }, [api, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed) return <ScopeNote note={failed} />;
  if (!view) return <p className="text-sm text-career-muted">{t('loading')}</p>;
  const { scope } = view;
  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-career-ink">{t('your_role')}</h2>
          <Badge tone="recommended">{t(`role_${view.role}`)}</Badge>
        </div>
        <p className="mt-1 text-sm text-career-muted">{t(`role_${view.role}_scope`)}</p>
        <p className="mt-2 text-sm text-career-muted">
          {t('seats_line', {
            staffUsed: view.capacity.staffUsed,
            staffSeats: view.capacity.staffSeats ?? 0,
            candidatesUsed: view.capacity.candidatesUsed,
            activeCandidates: view.capacity.activeCandidates ?? 0,
          })}
        </p>
      </Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {scope.candidates !== 'none' ? <CandidatesCard api={api} workspaceId={workspaceId} view={view} onReload={load} /> : null}
        {scope.manageWorkspace ? <StaffCard api={api} workspaceId={workspaceId} view={view} onReload={load} /> : null}
        {scope.queue ? <QueueCard api={api} workspaceId={workspaceId} view={view} /> : null}
        {scope.billing || scope.manageWorkspace ? <UsageCard api={api} workspaceId={workspaceId} /> : null}
        {scope.reports ? <ReportCard api={api} workspaceId={workspaceId} /> : null}
      </div>
    </div>
  );
}

function InviteResult({ invitation }: { invitation: BusinessInvitation }) {
  const t = useTranslations('career.scope');
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  const link = inviteLink(invitation.invitePath, typeof window === 'undefined' ? '' : window.location.origin, locale);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(invitation.expiresAt));
  return (
    <div className="rounded-md border border-career-line bg-career-wash p-3 text-sm text-career-ink" role="status">
      <p>{invitation.delivered ? t('invite_sent', { date }) : t('invite_not_sent', { date })}</p>
      <code className="mt-2 block break-all font-mono text-xs" dir="ltr">{link}</code>
      <Button
        type="button"
        variant="secondary"
        className="mt-2"
        onClick={() => {
          void navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => undefined);
        }}
      >
        {copied ? t('copied') : t('copy_link')}
      </Button>
    </div>
  );
}

function CandidatesCard({ api, workspaceId, view, onReload }: { api: ApiClient; workspaceId: string | undefined; view: BusinessOverview; onReload: () => Promise<void> }) {
  const t = useTranslations('career.scope');
  const { busy, run } = useScopeBusy();
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [note, setNote] = useState<ActionNote | null>(null);
  const [invitation, setInvitation] = useState<BusinessInvitation | null>(null);
  const [opened, setOpened] = useState<BusinessCandidateDetail | null>(null);
  const [archiving, setArchiving] = useState<{ id: string; email: string; archived: boolean } | null>(null);
  const manage = view.scope.manageWorkspace;

  async function invite(event: FormEvent) {
    event.preventDefault();
    setNote(null);
    setInvitation(null);
    if (!consent) return setNote({ tone: 'error', key: 'consent_required' });
    await run(async () => {
      try {
        setInvitation(await api.inviteCandidate(email.trim(), consent, workspaceId));
        setEmail('');
        setConsent(false);
        await onReload();
      } catch (error) {
        setNote(errorNote(error));
      }
    });
  }

  async function act(work: () => Promise<unknown>) {
    await run(async () => {
      setNote(null);
      try {
        await work();
        await onReload();
      } catch (error) {
        setNote(errorNote(error));
      }
    });
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-career-ink">{t('candidates_heading')}</h2>
      {view.candidates.length === 0 ? (
        <p className="mt-2 text-sm text-career-muted">{view.scope.candidates === 'assigned' ? t('candidates_none_assigned') : t('candidates_empty')}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {view.candidates.map((candidate) => (
            <li key={candidate.id} className="rounded-md border border-career-line px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-all text-career-ink">{candidate.email}</span>
                <span className="flex flex-wrap gap-1">
                  <Badge tone={candidate.status === 'active' ? 'confirmed' : 'later'}>{t(`candidate_status_${candidate.status}`)}</Badge>
                  {candidate.status === 'invited' ? <Badge tone="neutral">{t(`invite_state_${candidate.inviteState}`)}</Badge> : null}
                  {candidate.shareProfile ? <Badge tone="neutral">{t('sharing')}</Badge> : null}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={busy} onClick={() => void run(async () => {
                  try {
                    setOpened(await api.businessCandidate(candidate.id, workspaceId));
                  } catch (error) {
                    setNote(errorNote(error));
                  }
                })}>
                  {t('open_candidate')}
                </Button>
                {manage && candidate.status === 'invited' && candidate.inviteState === 'pending' ? (
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => void act(() => api.revokeCandidateInvite(candidate.id, workspaceId))}>
                    {t('revoke_invite')}
                  </Button>
                ) : null}
                {manage && candidate.status !== 'invited' ? (
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => setArchiving({ id: candidate.id, email: candidate.email, archived: candidate.status !== 'archived' })}>
                    {candidate.status === 'archived' ? t('reactivate') : t('archive')}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ScopeNote note={note} className="mt-3" />
      {opened ? (
        <div className="mt-3 rounded-md border border-career-line bg-career-wash p-3 text-sm text-career-ink" role="status">
          <p className="font-semibold break-all">{opened.email}</p>
          {opened.shared ? (
            <>
              <p className="mt-1">{t('shared_facts', { count: opened.shared.confirmedFacts })}</p>
              {opened.shared.evidence.length > 0 ? (
                <ul className="mt-1 list-disc ps-5">
                  {opened.shared.evidence.map((item, index) => (
                    <li key={index} dir="auto">{item.title}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-career-muted">{t('not_shared')}</p>
          )}
        </div>
      ) : null}
      {manage ? (
        <form className="mt-6 grid grid-cols-1 gap-3" onSubmit={(event) => void invite(event)}>
          <h3 className="text-base font-semibold text-career-ink">{t('invite_heading')}</h3>
          <Input label={t('email')} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <label className="flex min-h-career-touch items-center gap-2 text-sm text-career-ink">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            {t('consent')}
          </label>
          <p className="text-sm text-career-muted">{t('candidate_invite_help')}</p>
          <div>
            <Button type="submit" disabled={busy}>{t('invite')}</Button>
          </div>
          {invitation ? <InviteResult invitation={invitation} /> : null}
        </form>
      ) : null}
      <ConfirmDialog
        open={archiving !== null}
        title={archiving?.archived ? t('archive_title') : t('reactivate_title')}
        body={archiving ? t(archiving.archived ? 'archive_body' : 'reactivate_body', { email: archiving.email }) : undefined}
        confirmLabel={archiving?.archived ? t('archive') : t('reactivate')}
        cancelLabel={t('cancel')}
        busy={busy}
        onConfirm={() => {
          const target = archiving;
          setArchiving(null);
          if (target) void act(() => api.setCandidateArchived(target.id, target.archived, workspaceId));
        }}
        onCancel={() => setArchiving(null)}
      />
    </Card>
  );
}

function StaffCard({ api, workspaceId, view, onReload }: { api: ApiClient; workspaceId: string | undefined; view: BusinessOverview; onReload: () => Promise<void> }) {
  const t = useTranslations('career.scope');
  const { busy, run } = useScopeBusy();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<BusinessStaffRole>('counselor');
  const [note, setNote] = useState<ActionNote | null>(null);
  const [invitation, setInvitation] = useState<BusinessInvitation | null>(null);
  const [removing, setRemoving] = useState<{ id: string; label: string } | null>(null);
  const [assignStaff, setAssignStaff] = useState('');
  const [assignCandidate, setAssignCandidate] = useState('');
  const counselors = view.staff.filter((member) => member.role === 'counselor' && member.status === 'active');
  const assignable = view.candidates.filter((candidate) => candidate.status !== 'archived');

  async function invite(event: FormEvent) {
    event.preventDefault();
    setNote(null);
    setInvitation(null);
    if (!email.trim()) return setNote({ tone: 'error', key: 'staff_required' });
    await run(async () => {
      try {
        setInvitation(await api.inviteStaff(email.trim(), role, workspaceId));
        setEmail('');
        await onReload();
      } catch (error) {
        setNote(errorNote(error));
      }
    });
  }

  async function act(work: () => Promise<unknown>, success?: ActionNote) {
    await run(async () => {
      setNote(null);
      try {
        await work();
        if (success) setNote(success);
        await onReload();
      } catch (error) {
        setNote(errorNote(error));
      }
    });
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-career-ink">{t('staff_heading')}</h2>
      {view.staff.length === 0 ? (
        <p className="mt-2 text-sm text-career-muted">{t('staff_empty')}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {view.staff.map((member) => {
            const label = member.email ?? member.authUserId ?? member.id;
            return (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-career-line px-3 py-2 text-sm">
                <span className="min-w-0 break-all text-career-ink">{label}</span>
                <span className="flex flex-wrap items-center gap-1">
                  <Badge tone="neutral">{t(`role_${member.role}`)}</Badge>
                  <Badge tone={member.status === 'active' ? 'confirmed' : 'later'}>{t(`staff_status_${member.status}`)}</Badge>
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => setRemoving({ id: member.id, label })}>
                    {member.status === 'active' ? t('remove_staff') : t('revoke_invite')}
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <form className="mt-6 grid grid-cols-1 gap-3" onSubmit={(event) => void invite(event)}>
        <h3 className="text-base font-semibold text-career-ink">{t('add_staff')}</h3>
        <Input label={t('email')} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <label className="block space-y-1.5 text-sm font-semibold text-career-ink">
          <span>{t('staff_role')}</span>
          <select className={selectClass} value={role} onChange={(event) => setRole(event.target.value as BusinessStaffRole)}>
            <option value="counselor">{t('role_counselor')}</option>
            <option value="manager">{t('role_manager')}</option>
            <option value="billing_admin">{t('role_billing_admin')}</option>
          </select>
        </label>
        <p className="text-sm text-career-muted">{t(`role_${role}_scope`)}</p>
        <div>
          <Button type="submit" disabled={busy}>{t('invite')}</Button>
        </div>
        {invitation ? <InviteResult invitation={invitation} /> : null}
      </form>

      <form
        className="mt-6 grid grid-cols-1 gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!assignStaff || !assignCandidate) return setNote({ tone: 'error', key: 'assign_required' });
          void act(() => api.assignCounselor(assignStaff, assignCandidate, workspaceId), { tone: 'success', key: 'assigned' });
        }}
      >
        <h3 className="text-base font-semibold text-career-ink">{t('assign_heading')}</h3>
        <label className="block space-y-1.5 text-sm font-semibold text-career-ink">
          <span>{t('assign_staff')}</span>
          <select className={selectClass} value={assignStaff} onChange={(event) => setAssignStaff(event.target.value)}>
            <option value="">{t('choose')}</option>
            {counselors.map((member) => (
              <option key={member.id} value={member.id}>{member.authUserId ?? member.id}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5 text-sm font-semibold text-career-ink">
          <span>{t('assign_candidate')}</span>
          <select className={selectClass} value={assignCandidate} onChange={(event) => setAssignCandidate(event.target.value)}>
            <option value="">{t('choose')}</option>
            {assignable.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.email}</option>
            ))}
          </select>
        </label>
        <div>
          <Button type="submit" disabled={busy || counselors.length === 0 || assignable.length === 0}>{t('assign')}</Button>
        </div>
      </form>
      <ScopeNote note={note} className="mt-3" />
      <ConfirmDialog
        open={removing !== null}
        title={t('remove_staff_title')}
        body={removing ? t('remove_staff_body', { name: removing.label }) : undefined}
        confirmLabel={t('remove_staff')}
        cancelLabel={t('cancel')}
        danger
        busy={busy}
        onConfirm={() => {
          const target = removing;
          setRemoving(null);
          if (target) void act(() => api.removeStaff(target.id, workspaceId), { tone: 'success', key: 'staff_removed' });
        }}
        onCancel={() => setRemoving(null)}
      />
    </Card>
  );
}

function QueueCard({ api, workspaceId, view }: { api: ApiClient; workspaceId: string | undefined; view: BusinessOverview }) {
  const t = useTranslations('career.scope');
  const { busy, run } = useScopeBusy();
  const [items, setItems] = useState<BusinessQueueItem[]>([]);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [noteText, setNoteText] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [note, setNote] = useState<ActionNote | null>(null);
  const active = view.candidates.filter((candidate) => candidate.status === 'active');

  useEffect(() => {
    api.businessQueue(workspaceId).then((list) => setItems(list.items)).catch((error: unknown) => setNote(errorNote(error)));
  }, [api, workspaceId]);

  async function add(event: FormEvent) {
    event.preventDefault();
    setNote(null);
    if (!title.trim()) return setNote({ tone: 'error', key: 'queue_title_required' });
    await run(async () => {
      try {
        const saved = await api.addBusinessQueueItem({ title: title.trim(), url: url.trim() || null, note: noteText.trim(), candidateId: candidateId || null }, workspaceId);
        setItems((current) => [saved, ...current]);
        setTitle('');
        setUrl('');
        setNoteText('');
        setCandidateId('');
      } catch (error) {
        setNote(errorNote(error));
      }
    });
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-career-ink">{t('queue_heading')}</h2>
      <p className="mt-1 text-sm text-career-muted">{t('queue_help')}</p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-career-muted">{t('queue_empty')}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-md border border-career-line px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {item.url ? (
                  <a className="font-semibold text-career-ink underline" href={item.url} target="_blank" rel="noopener noreferrer" dir="auto">{item.title}</a>
                ) : (
                  <span className="font-semibold text-career-ink" dir="auto">{item.title}</span>
                )}
                <Badge tone="neutral">{t(`queue_status_${item.status}`)}</Badge>
              </div>
              {item.note ? <p className="mt-1 text-career-muted" dir="auto">{item.note}</p> : null}
              {item.candidateId ? (
                <p className="mt-1 text-career-muted">{t('queue_for', { email: view.candidates.find((c) => c.id === item.candidateId)?.email ?? '' })}</p>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                className="mt-2"
                disabled={busy}
                onClick={() => void run(async () => {
                  try {
                    await api.removeBusinessQueueItem(item.id, workspaceId);
                    setItems((current) => current.filter((x) => x.id !== item.id));
                  } catch (error) {
                    setNote(errorNote(error));
                  }
                })}
              >
                {t('delete')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form className="mt-4 grid grid-cols-1 gap-3" onSubmit={(event) => void add(event)}>
        <Input label={t('queue_title')} value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
        <Input label={t('queue_url')} type="url" value={url} maxLength={500} onChange={(event) => setUrl(event.target.value)} />
        <Input label={t('queue_note')} value={noteText} maxLength={2000} onChange={(event) => setNoteText(event.target.value)} />
        <label className="block space-y-1.5 text-sm font-semibold text-career-ink">
          <span>{t('queue_recommend_to')}</span>
          <select className={selectClass} value={candidateId} onChange={(event) => setCandidateId(event.target.value)}>
            <option value="">{t('queue_everyone')}</option>
            {active.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.email}</option>
            ))}
          </select>
        </label>
        <div>
          <Button type="submit" disabled={busy}>{t('queue_add')}</Button>
        </div>
        <ScopeNote note={note} />
      </form>
    </Card>
  );
}

function UsageCard({ api, workspaceId }: { api: ApiClient; workspaceId: string | undefined }) {
  const t = useTranslations('career.scope');
  const locale = useLocale();
  const [usage, setUsage] = useState<BusinessUsage | null>(null);
  const [note, setNote] = useState<ActionNote | null>(null);

  useEffect(() => {
    api.businessUsage(workspaceId).then(setUsage).catch((error: unknown) => setNote(errorNote(error)));
  }, [api, workspaceId]);

  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  return (
    <Card>
      <h2 className="text-lg font-semibold text-career-ink">{t('usage_heading')}</h2>
      <p className="mt-1 text-sm text-career-muted">{t('usage_help')}</p>
      <ScopeNote note={note} className="mt-3" />
      {usage ? (
        <>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {usage.units.map((unit) => (
              <li key={unit.unit} className="rounded-md border border-career-line px-3 py-2 text-sm">
                <p className="font-semibold text-career-ink">{t(`unit_${unit.unit}`)}</p>
                <p className="text-career-muted">{t('unit_left', { remaining: unit.remaining, granted: unit.granted })}</p>
              </li>
            ))}
          </ul>
          {usage.invoices ? (
            <>
              <h3 className="mt-4 text-base font-semibold text-career-ink">{t('invoices_heading')}</h3>
              {usage.invoices.length === 0 ? (
                <p className="mt-1 text-sm text-career-muted">{t('invoices_empty')}</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {usage.invoices.map((invoice, index) => (
                    <li key={index} className="flex flex-wrap justify-between gap-2 text-career-ink">
                      <span>{invoice.sku}</span>
                      <span className="text-career-muted">
                        {invoice.amountCents !== null && invoice.currency
                          ? new Intl.NumberFormat(locale, { style: 'currency', currency: invoice.currency }).format(invoice.amountCents / 100)
                          : '—'}{' '}
                        · {date.format(new Date(invoice.purchasedAt))}
                        {invoice.refunded ? ` · ${t('refunded')}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

function ReportCard({ api, workspaceId }: { api: ApiClient; workspaceId: string | undefined }) {
  const t = useTranslations('career.scope');
  const [report, setReport] = useState<BusinessReport | null>(null);
  const [note, setNote] = useState<ActionNote | null>(null);

  useEffect(() => {
    api.businessReport(workspaceId).then(setReport).catch((error: unknown) => setNote(errorNote(error)));
  }, [api, workspaceId]);

  return (
    <Card>
      <h2 className="text-lg font-semibold text-career-ink">{t('report_heading')}</h2>
      <p className="mt-1 text-sm text-career-muted">{t('report_help')}</p>
      <ScopeNote note={note} className="mt-3" />
      {report ? (
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(
            [
              ['candidate_status_invited', report.candidates.invited],
              ['candidate_status_active', report.candidates.active],
              ['candidate_status_archived', report.candidates.archived],
              ['report_sharing', report.sharingCandidates],
              ['report_assignments', report.assignments],
              ['report_recommended', report.queue.recommended],
            ] as const
          ).map(([key, value]) => (
            <div key={key} className="rounded-md border border-career-line p-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-career-muted">{t(key)}</dt>
              <dd className="mt-1 text-xl font-bold text-career-ink">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </Card>
  );
}

/** The invited candidate's own view: what they share, and leaving. */
function MyMemberships({ api, initial }: { api: ApiClient; initial: BusinessMemberships['candidateOf'] }) {
  const t = useTranslations('career.scope');
  const { busy, run } = useScopeBusy();
  const [items, setItems] = useState(initial);
  const [note, setNote] = useState<ActionNote | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);

  return (
    <Card>
      <h2 className="text-lg font-semibold text-career-ink">{t('my_workspaces_heading')}</h2>
      <p className="mt-1 text-sm text-career-muted">{t('my_workspaces_help')}</p>
      <ul className="mt-3 space-y-2">
        {items.map((item, index) => (
          <li key={item.candidateId} className="rounded-md border border-career-line px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-career-ink">{t('my_workspace_n', { n: index + 1 })}</span>
              <Badge tone={item.status === 'active' ? 'confirmed' : 'later'}>{t(`candidate_status_${item.status}`)}</Badge>
            </div>
            <label className="mt-2 flex min-h-career-touch items-center gap-2 text-career-ink">
              <input
                type="checkbox"
                checked={item.shareProfile}
                disabled={busy || item.status !== 'active'}
                onChange={(event) => {
                  const share = event.target.checked;
                  void run(async () => {
                    try {
                      await api.setBusinessShare(item.candidateId, share);
                      setItems((current) => current.map((x) => (x.candidateId === item.candidateId ? { ...x, shareProfile: share } : x)));
                    } catch (error) {
                      setNote(errorNote(error));
                    }
                  });
                }}
              />
              {t('share_with_staff')}
            </label>
            <Button type="button" variant="secondary" className="mt-2" disabled={busy} onClick={() => setLeaving(item.candidateId)}>
              {t('leave_workspace')}
            </Button>
          </li>
        ))}
      </ul>
      <ScopeNote note={note} className="mt-3" />
      <ConfirmDialog
        open={leaving !== null}
        title={t('leave_title')}
        body={t('leave_body')}
        confirmLabel={t('leave_workspace')}
        cancelLabel={t('cancel')}
        danger
        busy={busy}
        onConfirm={() => {
          const id = leaving;
          setLeaving(null);
          if (id) {
            void run(async () => {
              try {
                await api.leaveBusiness(id);
                setItems((current) => current.filter((x) => x.candidateId !== id));
              } catch (error) {
                setNote(errorNote(error));
              }
            });
          }
        }}
        onCancel={() => setLeaving(null)}
      />
    </Card>
  );
}

/**
 * The invitation link lands here. The person signs in (the career gate does
 * that first), then accepts explicitly; the API checks that their verified
 * address is the invited one.
 */
export function BusinessJoinPanel({ api, token }: { api: ApiClient; token: string | null }) {
  const t = useTranslations('career.scope');
  const { busy, run } = useScopeBusy();
  const [note, setNote] = useState<ActionNote | null>(null);
  const [done, setDone] = useState<'staff' | 'candidate' | null>(null);

  if (!token) return <ScopeNote note={{ tone: 'error', key: 'join_no_token' }} />;
  return (
    <Card>
      <h2 className="text-lg font-semibold text-career-ink">{t('join_heading')}</h2>
      <p className="mt-1 text-sm text-career-muted">{t('join_help')}</p>
      {done ? (
        <ScopeNote note={{ tone: 'success', key: done === 'staff' ? 'join_done_staff' : 'join_done_candidate' }} className="mt-3" />
      ) : (
        <Button
          type="button"
          className="mt-4"
          disabled={busy}
          onClick={() => void run(async () => {
            setNote(null);
            try {
              setDone((await api.acceptBusinessInvitation(token)).kind);
            } catch (error) {
              if (isApiError(error, 'not_found')) setNote({ tone: 'error', key: 'join_invalid' });
              else if (isApiError(error, 'permission_denied')) setNote({ tone: 'error', key: 'join_wrong_email' });
              else setNote(errorNote(error));
            }
          })}
        >
          {t('join_accept')}
        </Button>
      )}
      <ScopeNote note={note} className="mt-3" />
    </Card>
  );
}

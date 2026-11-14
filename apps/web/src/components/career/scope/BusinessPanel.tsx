'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { ApiClient, BusinessOverview } from '@flacroncv/career-api-client';
import { Badge, Button, Card, Input } from '@/components/career/ui';
import { errorNote, ScopeNote, useScopeBusy, type ActionNote } from './scope-actions';

const selectClass =
  'block h-11 w-full rounded-md border border-career-line bg-career-surface px-3 text-base text-career-ink focus:border-career-navy focus:outline-none focus:ring-2 focus:ring-career-orange-text/40';

/**
 * Business plan workspace: staff, invited candidates, assignments. Every id
 * comes from the lists the API returns; the only typed id is a new staff
 * member's account id, which the career service has no directory to look up.
 */
export function BusinessPanel({ api, initial }: { api: ApiClient; initial: BusinessOverview }) {
  const t = useTranslations('career.scope');
  const { busy, run } = useScopeBusy();
  const [view, setView] = useState<BusinessOverview>(initial);
  const [staffUser, setStaffUser] = useState('');
  const [staffRole, setStaffRole] = useState<'counselor' | 'manager'>('counselor');
  const [staffNote, setStaffNote] = useState<ActionNote | null>(null);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [inviteNote, setInviteNote] = useState<ActionNote | null>(null);
  const [assignStaff, setAssignStaff] = useState('');
  const [assignCandidate, setAssignCandidate] = useState('');
  const [assignNote, setAssignNote] = useState<ActionNote | null>(null);
  const [opened, setOpened] = useState<{ id: string; email: string } | null>(null);
  const [openNote, setOpenNote] = useState<ActionNote | null>(null);

  async function addStaff(event: FormEvent) {
    event.preventDefault();
    setStaffNote(null);
    if (!staffUser.trim()) {
      setStaffNote({ tone: 'error', key: 'staff_required' });
      return;
    }
    await run(async () => {
      try {
        const saved = await api.addStaff(staffUser.trim(), staffRole);
        setView((current) => ({ ...current, staff: [...current.staff, { id: saved.id, authUserId: staffUser.trim(), role: staffRole }] }));
        setStaffUser('');
        setStaffNote({ tone: 'success', key: 'staff_added' });
      } catch (error) {
        setStaffNote(errorNote(error));
      }
    });
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    setInviteNote(null);
    if (!consent) {
      setInviteNote({ tone: 'error', key: 'consent_required' });
      return;
    }
    await run(async () => {
      try {
        const saved = await api.inviteCandidate(email.trim(), consent);
        setView((current) => ({ ...current, candidates: [...current.candidates, { id: saved.id, email: email.trim() }] }));
        setEmail('');
        setConsent(false);
        setInviteNote({ tone: 'success', key: 'invited' });
      } catch (error) {
        setInviteNote(errorNote(error));
      }
    });
  }

  async function assign(event: FormEvent) {
    event.preventDefault();
    setAssignNote(null);
    if (!assignStaff || !assignCandidate) {
      setAssignNote({ tone: 'error', key: 'assign_required' });
      return;
    }
    await run(async () => {
      try {
        await api.assignCounselor(assignStaff, assignCandidate);
        setAssignNote({ tone: 'success', key: 'assigned' });
      } catch (error) {
        setAssignNote(errorNote(error));
      }
    });
  }

  async function open(candidateId: string) {
    setOpenNote(null);
    await run(async () => {
      try {
        setOpened(await api.businessCandidate(candidateId));
      } catch (error) {
        setOpened(null);
        setOpenNote(errorNote(error));
      }
    });
  }

  const counselors = view.staff.filter((member) => member.role === 'counselor');

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <h2 className="text-lg font-semibold text-career-ink">{t('candidates_heading')}</h2>
        {view.candidates.length === 0 ? (
          <p className="mt-2 text-sm text-career-muted">{t('candidates_empty')}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {view.candidates.map((candidate) => (
              <li key={candidate.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-career-line px-3 py-2 text-sm">
                <span className="min-w-0 break-all text-career-ink">{candidate.email}</span>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => void open(candidate.id)}>
                  {t('open_candidate')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <ScopeNote note={openNote} className="mt-3" />
        {opened ? (
          <div className="mt-3 rounded-md border border-career-line bg-career-wash p-3 text-sm text-career-ink" role="status">
            <p className="font-semibold">{t('candidate_opened')}</p>
            <p className="mt-1 break-all">{opened.email}</p>
          </div>
        ) : null}
        <form className="mt-6 grid grid-cols-1 gap-3" onSubmit={(event) => void invite(event)}>
          <h3 className="text-base font-semibold text-career-ink">{t('invite_heading')}</h3>
          <Input label={t('email')} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <label className="flex min-h-career-touch items-center gap-2 text-sm text-career-ink">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            {t('consent')}
          </label>
          <div>
            <Button type="submit" disabled={busy}>{t('invite')}</Button>
          </div>
          <ScopeNote note={inviteNote} />
        </form>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-career-ink">{t('staff_heading')}</h2>
        {view.staff.length === 0 ? (
          <p className="mt-2 text-sm text-career-muted">{t('staff_empty')}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {view.staff.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-career-line px-3 py-2 text-sm">
                <span className="min-w-0 break-all text-career-ink">{member.authUserId}</span>
                <Badge tone="neutral">{t(`role_${member.role === 'manager' ? 'manager' : 'counselor'}`)}</Badge>
              </li>
            ))}
          </ul>
        )}
        <form className="mt-6 grid grid-cols-1 gap-3" onSubmit={(event) => void addStaff(event)}>
          <h3 className="text-base font-semibold text-career-ink">{t('add_staff')}</h3>
          <Input label={t('staff_user')} hint={t('staff_user_hint')} value={staffUser} onChange={(event) => setStaffUser(event.target.value)} />
          <label className="block space-y-1.5 text-sm font-semibold text-career-ink">
            <span>{t('staff_role')}</span>
            <select className={selectClass} value={staffRole} onChange={(event) => setStaffRole(event.target.value === 'manager' ? 'manager' : 'counselor')}>
              <option value="counselor">{t('role_counselor')}</option>
              <option value="manager">{t('role_manager')}</option>
            </select>
          </label>
          <div>
            <Button type="submit" disabled={busy}>{t('add_staff')}</Button>
          </div>
          <ScopeNote note={staffNote} />
        </form>

        <form className="mt-6 grid grid-cols-1 gap-3" onSubmit={(event) => void assign(event)}>
          <h3 className="text-base font-semibold text-career-ink">{t('assign_heading')}</h3>
          <label className="block space-y-1.5 text-sm font-semibold text-career-ink">
            <span>{t('assign_staff')}</span>
            <select className={selectClass} value={assignStaff} onChange={(event) => setAssignStaff(event.target.value)}>
              <option value="">{t('choose')}</option>
              {counselors.map((member) => (
                <option key={member.id} value={member.id}>{member.authUserId}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm font-semibold text-career-ink">
            <span>{t('assign_candidate')}</span>
            <select className={selectClass} value={assignCandidate} onChange={(event) => setAssignCandidate(event.target.value)}>
              <option value="">{t('choose')}</option>
              {view.candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.email}</option>
              ))}
            </select>
          </label>
          <div>
            <Button type="submit" disabled={busy || counselors.length === 0 || view.candidates.length === 0}>{t('assign')}</Button>
          </div>
          <ScopeNote note={assignNote} />
        </form>
      </Card>
    </div>
  );
}

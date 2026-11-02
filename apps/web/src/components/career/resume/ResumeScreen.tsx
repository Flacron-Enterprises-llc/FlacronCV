'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { newIdempotencyKey, isApiError, type ApiClient, type Resume, type ResumeVersion } from '@flacroncv/career-api-client';
import type { DocumentCredit, ResumeDetail, WritingDocument, WritingType } from '@flacroncv/career-api-client';
import {
  COVER_LETTER_TEMPLATES,
  isCoverLetterTemplateId,
  isResumeTemplateId,
  RESUME_TEMPLATES,
  resumeContactLine,
  resumeDisplayName,
  resumeSectionHeading,
  type CoverLetterTemplateId,
} from '@flacroncv/career-shared';
import { DocumentPaper } from '@/components/career/public/DocumentPaper';
import { LetterPaper } from '@/components/career/public/LetterPaper';
import {
  Button,
  Card,
  EmptyState,
  FailedJobState,
  Input,
  LoadingState,
  PermissionDeniedState,
  PlanUpgradeState,
  ProviderUnavailableState,
  QuotaExhaustedState,
} from '@/components/career/ui';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { profileLoadFailure } from '@/lib/career/profile-load';

type Problem = 'failed' | 'quota' | 'capacity' | 'upgrade' | 'missing' | 'clarify' | 'unusable' | 'conflict' | null;

const UNUSABLE_LETTER_REASONS = new Set([
  'current_role_unsupported',
  'ended_role_described_as_current',
  'unsupported_employer',
  'target_as_past_employer',
  'unsupported_date',
  'unusable_output',
  'incomplete_opening',
  'incomplete_body',
  'incomplete_closing',
  'incomplete_letter',
  'missing_evidence',
]);

export function ResumeScreen({
  api,
  user,
  ready,
  signInHref,
}: {
  api: ApiClient;
  user: SignedInUser | null;
  ready: boolean;
  signInHref: string;
}) {
  const t = useTranslations('career.resume');
  const tHome = useTranslations('career.home');
  const tProfile = useTranslations('career.profile');
  const locale = useLocale();
  const [load, setLoad] = useState<'loading' | 'permission' | 'signed-out' | 'unavailable' | 'ready'>(
    ready && !user ? 'signed-out' : 'loading',
  );
  const [detail, setDetail] = useState<ResumeDetail | null>(null);
  const [library, setLibrary] = useState<Resume[]>([]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'recent' | 'title'>('recent');
  const [pane, setPane] = useState<'edit' | 'preview'>('edit');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [credit, setCredit] = useState<DocumentCredit | null>(null);
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [title, setTitle] = useState(() => t('default_name'));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [opportunityId, setOpportunityId] = useState('');
  const [problem, setProblem] = useState<Problem>(null);
  const [released, setReleased] = useState(false);
  const [limit, setLimit] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [issues, setIssues] = useState<Array<{ code: string; section?: string; factId?: string }> | null>(null);
  const [writingType, setWritingType] = useState<WritingType>('cover_letter');
  const [writingOpportunity, setWritingOpportunity] = useState('');
  const [writingConfirm, setWritingConfirm] = useState(false);
  const [writingDoc, setWritingDoc] = useState<WritingDocument | null>(null);
  const [documentDraft, setDocumentDraft] = useState('');
  const [previewScale, setPreviewScale] = useState<'fit' | 'full'>('fit');
  const [letterTemplate, setLetterTemplate] = useState<CoverLetterTemplateId>('classic');
  const [requestedTemplate, setRequestedTemplate] = useState<string | null>(null);
  const appliedTemplateQuery = useRef(false);

  const loadResumes = useCallback(async () => {
    setLoad('loading');
    setProblem(null);
    try {
      const list = await api.resumes();
      setCredit(list.documentCredit);
      setLibrary(list.items);
      const first = list.items[0];
      if (!first) {
        setDetail(null);
        setVersions([]);
        setLoad('ready');
        return;
      }
      const full = await api.resume(first.id);
      setDetail(full);
      setVersions((await api.resumeVersions(first.id)).items);
      setDrafts(draftsFrom(full.version));
      try {
        const writings = await api.writingDocuments();
        const opened = writings.items[0];
        if (opened) {
          setWritingDoc(opened);
          setDocumentDraft(opened.body);
          setWritingType(opened.type);
          if (isCoverLetterTemplateId(opened.templateId)) setLetterTemplate(opened.templateId);
        }
      } catch {
        /* Resume studio still loads if writing history is unavailable. */
      }
      setLoad('ready');
    } catch (error) {
      setLoad(profileLoadFailure(error) === 'signed-out' ? 'signed-out' : profileLoadFailure(error));
    }
  }, [api]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLoad('signed-out');
      return;
    }
    void loadResumes();
  }, [ready, user, loadResumes]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const template = params.get('template');
    const letter = params.get('letter');
    setRequestedTemplate(template && isResumeTemplateId(template) ? template : null);
    if (letter && isCoverLetterTemplateId(letter)) {
      setWritingType('cover_letter');
      setLetterTemplate(letter);
    }
  }, []);

  useEffect(() => {
    const current = detail?.version;
    if (appliedTemplateQuery.current || load !== 'ready' || !current || !requestedTemplate) return;
    if (current.body.templateId === requestedTemplate || !isResumeTemplateId(requestedTemplate)) {
      appliedTemplateQuery.current = true;
      return;
    }
    appliedTemplateQuery.current = true;
    void api
      .updateResumeVersion(current.id, { templateId: requestedTemplate })
      .then((next) => replace(next, true))
      .catch((error) => {
        appliedTemplateQuery.current = false;
        note(error);
      });
  }, [api, detail, load, requestedTemplate]);

  const dirty = Boolean(
    detail?.version &&
      detail.version.body.sections.some((section) =>
        section.lines.some((line) => (drafts[line.factId] ?? line.text) !== line.text),
      ),
  );

  function changedLines(current: ResumeVersion) {
    return current.body.sections.flatMap((section) =>
      section.lines
        .filter((line) => drafts[line.factId] !== undefined && drafts[line.factId] !== line.text)
        .map((line) => ({ factId: line.factId, text: drafts[line.factId] ?? line.text })),
    );
  }

  useEffect(() => {
    if (!dirty) return undefined;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  if (!ready || load === 'loading') return <LoadingState label={t('loading')} />;
  if (load === 'permission') return <PermissionDeniedState title={t('permission_title')} body={t('permission_body')} />;
  if (load === 'unavailable') {
    return (
      <ProviderUnavailableState
        title={t('unavailable_title')}
        body={t('unavailable_body')}
        action={<Button type="button" onClick={() => void loadResumes()}>{t('retry')}</Button>}
      />
    );
  }
  if (load === 'signed-out' || !user) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-balance text-2xl font-bold text-career-ink">{t('title')}</h1>
          <p className="mt-2 max-w-2xl text-pretty text-sm text-career-muted">{t('studio_lede')}</p>
        </div>
        <EmptyState
          title={t('signed_out_title')}
          body={t('signed_out_body')}
          action={
            <a className="inline-flex min-h-career-touch cursor-pointer items-center rounded-md bg-career-navy px-4 text-sm font-semibold text-white" href={signInHref}>
              {t('go_sign_in')}
            </a>
          }
        />
      </div>
    );
  }

  const version = detail?.version ?? null;
  const visibleLibrary = library
    .filter((item) => item.title.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (sort === 'title' ? a.title.localeCompare(b.title) : b.createdAt.localeCompare(a.createdAt)));

  async function createResume(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const requested = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('template');
      const created = await api.createResume({
        title,
        // A CV created from the French studio is a French CV (headings, dates, and review language).
        language: locale === 'fr' ? 'fr' : 'en',
        ...(requested && isResumeTemplateId(requested) ? { templateId: requested } : {}),
      });
      setDetail(created);
      setLibrary((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setVersions(created.version ? [created.version] : []);
      setDrafts(draftsFrom(created.version));
      setSaveState('idle');
    } catch (error) {
      note(error);
    } finally {
      setPending(false);
    }
  }

  async function openResume(id: string) {
    if (dirty && typeof window !== 'undefined' && !window.confirm(t('leave_unsaved'))) return;
    setPending(true);
    try {
      const full = await api.resume(id);
      setDetail(full);
      setVersions((await api.resumeVersions(id)).items);
      setDrafts(draftsFrom(full.version));
      setSaveState('idle');
      setPane('edit');
    } catch (error) {
      note(error);
    } finally {
      setPending(false);
    }
  }

  async function save() {
    if (!version) return;
    setPending(true);
    setSaveState('saving');
    try {
      const saved = await api.updateResumeVersion(version.id, {
        lines: changedLines(version),
        expectedRevision: detail?.revision,
      });
      replace(saved);
      await refreshRevision();
      setSaveState('saved');
    } catch (error) {
      setSaveState('error');
      note(error);
    } finally {
      setPending(false);
    }
  }

  async function changeTemplate(value: string) {
    if (!version || !isResumeTemplateId(value)) return;
    setPending(true);
    setSaveState(dirty ? 'saving' : 'idle');
    try {
      const saved = await api.updateResumeVersion(version.id, {
        templateId: value,
        lines: version.document ? [] : changedLines(version),
        expectedRevision: detail?.revision,
      });
      replace(saved);
      await refreshRevision();
      if (dirty) setSaveState('saved');
    } catch (error) {
      setSaveState('error');
      note(error);
    } finally {
      setPending(false);
    }
  }

  async function confirmVersion() {
    if (!version) return;
    setPending(true);
    try {
      replace(await api.updateResumeVersion(version.id, { confirmation: 'confirmed', expectedRevision: detail?.revision }));
      await refreshRevision();
    } catch (error) {
      note(error);
    } finally {
      setPending(false);
    }
  }

  async function generate() {
    if (!detail) return;
    setPending(true);
    setProblem(null);
    try {
      const paid = await api.generateResume(detail.id, '', newIdempotencyKey());
      replace(paid.version);
      setVersions((current) => [paid.version, ...current.filter((item) => item.id !== paid.version.id)]);
      setCredit((current) =>
        current ? { ...current, includedRemaining: paid.usage.includedRemaining, packRemaining: paid.usage.packRemaining } : current,
      );
      setConfirming(false);
    } catch (error) {
      note(error);
    } finally {
      setPending(false);
    }
  }

  async function tailor() {
    if (!detail || opportunityId.trim().length === 0) return;
    setPending(true);
    setProblem(null);
    try {
      const paid = await api.tailorResume(detail.id, opportunityId.trim(), newIdempotencyKey());
      replace(paid.version);
      setVersions((current) => [paid.version, ...current.filter((item) => item.id !== paid.version.id)]);
    } catch (error) {
      if (isApiError(error, 'not_found')) setProblem('missing');
      else note(error);
    } finally {
      setPending(false);
    }
  }

  async function writeDocument() {
    setPending(true);
    setProblem(null);
    try {
      const paid = await api.createWriting(
        {
          type: writingType,
          opportunityId: writingOpportunity.trim() || null,
          templateId: writingType === 'cover_letter' ? letterTemplate : undefined,
        },
        newIdempotencyKey(),
      );
      setWritingDoc(paid.document);
      setDocumentDraft(paid.document.body);
      setCredit((current) =>
        current ? { ...current, includedRemaining: paid.usage.includedRemaining, packRemaining: paid.usage.packRemaining } : current,
      );
      setWritingConfirm(false);
    } catch (error) {
      if (isApiError(error, 'not_found')) setProblem('missing');
      else note(error);
    } finally {
      setPending(false);
    }
  }

  async function saveDocument() {
    if (!writingDoc) return;
    setPending(true);
    setProblem(null);
    try {
      const saved = await api.updateWriting(writingDoc.id, { body: documentDraft });
      setWritingDoc(saved);
      setDocumentDraft(saved.body);
    } catch (error) {
      note(error);
    } finally {
      setPending(false);
    }
  }

  async function loadDrafts() {
    setProblem(null);
    try {
      const list = await api.writingDocuments();
      setCredit(list.documentCredit);
      const first = list.items[0];
      if (!first) return;
      setWritingDoc(first);
      setDocumentDraft(first.body);
      setWritingType(first.type);
      if (isCoverLetterTemplateId(first.templateId)) setLetterTemplate(first.templateId);
    } catch (error) {
      note(error);
    }
  }

  async function checkReadability() {
    if (!version) return;
    setProblem(null);
    try {
      setIssues((await api.readability(version.id)).issues);
    } catch (error) {
      note(error);
    }
  }

  function issueText(issue: { code: string; section?: string }): string {
    if (issue.code === 'empty') return t('issue_empty');
    if (issue.code === 'unconfirmed_version') return t('issue_unconfirmed_version');
    if (issue.code === 'missing_section') return t('issue_missing_section', { section: issue.section ?? '' });
    return t('issue_uncertain_line');
  }

  async function downloadWriting(format: 'pdf' | 'docx' | 'txt') {
    if (!writingDoc) return;
    setProblem(null);
    try {
      const file = await api.exportWriting(writingDoc.id, format);
      const buffer = new ArrayBuffer(file.bytes.byteLength);
      new Uint8Array(buffer).set(file.bytes);
      const blob = new Blob([buffer], { type: file.contentType });
      if (typeof URL.createObjectURL === 'function') {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = format === 'pdf' ? 'letter.pdf' : format === 'docx' ? 'letter.docx' : 'letter.txt';
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      note(error);
    }
  }

  async function download(format: 'pdf' | 'docx') {
    if (!version) return;
    setProblem(null);
    try {
      const file = await api.exportResume(version.id, format);
      const buffer = new ArrayBuffer(file.bytes.byteLength);
      new Uint8Array(buffer).set(file.bytes);
      const blob = new Blob([buffer], { type: file.contentType });
      if (typeof URL.createObjectURL === 'function') {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = format === 'pdf' ? 'resume.pdf' : 'resume.docx';
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      note(error);
    }
  }

  /** Fresh revision, lines and preview after a conflict; unsaved edits on this page are dropped. */
  async function reloadResume(resumeId: string) {
    try {
      const full = await api.resume(resumeId);
      setDetail(full);
      setDrafts(draftsFrom(full.version));
      setVersions((await api.resumeVersions(resumeId)).items);
    } catch (error) {
      note(error);
    }
  }

  /** The resume's revision moves on every save, from this page or another tab or device. */
  async function refreshRevision() {
    if (!detail) return;
    const fresh = await api.resume(detail.id);
    setDetail((current) => (current && current.id === fresh.id ? { ...current, revision: fresh.revision } : current));
  }

  function replace(next: ResumeVersion, keepDrafts = false) {
    setDetail((current) => (current ? { ...current, currentVersionId: next.id, version: next } : current));
    if (!keepDrafts) setDrafts(draftsFrom(next));
    setVersions((current) => current.map((item) => (item.id === next.id ? next : item)));
  }

  function note(error: unknown) {
    if (isApiError(error, 'revision_conflict')) setProblem('conflict');
    else if (isApiError(error, 'plan_upgrade_required')) setProblem('upgrade');
    else if (isApiError(error, 'quota_exhausted')) setProblem('quota');
    else if (isApiError(error, 'capacity_exceeded')) {
      setLimit(typeof error.body.limit === 'number' ? error.body.limit : null);
      setProblem('capacity');
    } else if (isApiError(error, 'provider_unavailable')) {
      setReleased(error.body.released === true);
      const reason = typeof error.body.reason === 'string' ? error.body.reason : '';
      setProblem(UNUSABLE_LETTER_REASONS.has(reason) ? 'unusable' : 'failed');
    } else if (isApiError(error, 'validation_error')) {
      const reason = error.body.reason;
      if (
        reason === 'need_experience_or_education' ||
        reason === 'no_facts' ||
        reason === 'no_confirmed_facts'
      ) {
        setProblem('clarify');
      } else setProblem('failed');
    } else if (isApiError(error, 'permission_denied')) setLoad('permission');
    else setProblem('failed');
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-balance text-2xl font-bold text-career-ink">{t('title')}</h1>
        <p className="mt-2 max-w-2xl text-pretty text-sm text-career-muted">{t('studio_lede')}</p>
      </div>
      {library.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-career-line bg-career-surface p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-sm font-semibold text-career-ink" htmlFor="resume-search">
              {t('library_search')}
              <input
                id="resume-search"
                className="mt-1.5 min-h-career-touch w-full rounded-md border border-career-line bg-white px-3 text-sm text-career-ink dark:bg-career-surface"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label className="text-sm font-semibold text-career-ink" htmlFor="resume-sort">
              {t('sort_label')}
              <select
                id="resume-sort"
                className="mt-1.5 min-h-career-touch w-full rounded-md border border-career-line bg-white px-3 text-sm text-career-ink dark:bg-career-surface sm:w-40"
                value={sort}
                onChange={(event) => setSort(event.target.value === 'title' ? 'title' : 'recent')}
              >
                <option value="recent">{t('sort_recent')}</option>
                <option value="title">{t('sort_title')}</option>
              </select>
            </label>
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {visibleLibrary.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void openResume(item.id)}
                  className={`flex min-h-career-touch w-full min-w-0 items-stretch gap-3 rounded-md border p-2 text-start transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-career-orange-text ${
                    detail?.id === item.id ? 'border-career-orange bg-career-orange-tint' : 'border-career-line bg-white hover:bg-career-wash dark:bg-career-surface'
                  }`}
                >
                  <span className="max-h-28 w-24 shrink-0 self-start overflow-hidden rounded-sm" aria-hidden="true">
                    <DocumentPaper templateId={item.templateId} mode="live" title={item.title} compact />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col justify-center py-1">
                    <span className="block truncate text-sm font-semibold text-career-ink">{item.title}</span>
                    <span className="mt-1 block text-xs text-career-muted">
                      {isResumeTemplateId(item.templateId) ? t(`templates.${item.templateId}`) : item.templateId}
                    </span>
                    <span className="mt-1 block text-xs text-career-muted">{t('opened_on', { date: item.createdAt.slice(0, 10) })}</span>
                    <span className="mt-2 text-sm font-semibold text-career-orange-text">{t('open_resume')}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {!detail || !version ? (
        <EmptyState
          title={t('empty_title')}
          body={t('empty_body')}
          action={
            <form className="flex flex-col gap-3" onSubmit={(event) => void createResume(event)}>
              <Input label={t('name_label')} name="title" value={title} onChange={(event) => setTitle(event.target.value)} />
              {requestedTemplate && isResumeTemplateId(requestedTemplate) ? (
                <p className="text-sm text-career-muted">{t('requested_layout', { name: t(`templates.${requestedTemplate}`) })}</p>
              ) : null}
              <Button type="submit" disabled={pending}>{t('create')}</Button>
            </form>
          }
        />
      ) : (
        <>
        <div className="xl:hidden">
          <div role="group" aria-label={t('preview')} className="inline-flex rounded-md border border-career-line bg-career-wash p-1">
            <button
              type="button"
              aria-pressed={pane === 'edit'}
              className={`min-h-career-touch rounded px-3 text-sm font-semibold transition-colors duration-200 ${pane === 'edit' ? 'bg-career-navy text-white' : 'text-career-ink'}`}
              onClick={() => setPane('edit')}
            >
              {t('pane_edit')}
            </button>
            <button
              type="button"
              aria-pressed={pane === 'preview'}
              className={`min-h-career-touch rounded px-3 text-sm font-semibold transition-colors duration-200 ${pane === 'preview' ? 'bg-career-navy text-white' : 'text-career-ink'}`}
              onClick={() => setPane('preview')}
            >
              {t('pane_preview')}
            </button>
          </div>
        </div>
        <div data-testid="resume-layout" className="grid grid-cols-1 gap-4 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[14rem_minmax(0,1fr)_minmax(16rem,22rem)]">
          <div className={pane === 'preview' ? 'max-xl:hidden' : undefined}>
            <h2 className="text-sm font-semibold text-career-ink">{t('versions')}</h2>
            <ul className="mt-2 flex flex-col gap-2">
              {versions.map((item) => (
                <li key={item.id}>
                  <span className="text-sm text-career-ink">{t('version_label', { number: item.versionNumber })}</span>
                </li>
              ))}
            </ul>
          </div>
          <Card className={pane === 'preview' ? 'max-xl:hidden' : undefined}>
            <p className="text-sm text-career-muted">{version.body.confirmation === 'confirmed' ? t('confirmed') : t('draft')}</p>
            <label className="mt-3 block text-sm font-semibold text-career-ink" htmlFor="resume-template">
              {t('template')}
              <select
                id="resume-template"
                className="mt-1.5 min-h-career-touch w-full rounded-md border border-career-line bg-white px-3 text-sm text-career-ink dark:bg-career-surface"
                value={version.body.templateId}
                disabled={pending}
                onChange={(event) => void changeTemplate(event.target.value)}
              >
                {RESUME_TEMPLATES.map((template) => (
                  <option key={template.id} value={template.id}>
                    {t(`templates.${template.id}`)}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-sm text-career-muted">{t('template_keep')}</p>
            {version.document ? null : version.body.sections.map((section) => (
              <div key={section.factType} className="fc-enter mt-4 flex flex-col gap-3">
                {section.lines.map((line) => (
                  <div key={line.factId}>
                    <Input
                      label={tProfile(`types.${section.factType}`)}
                      name={line.factId}
                      value={drafts[line.factId] ?? line.text}
                      onChange={(event) => {
                        setSaveState('idle');
                        setDrafts((current) => ({ ...current, [line.factId]: event.target.value }));
                      }}
                    />
                    {line.uncertain ? <p className="mt-1 text-sm text-career-orange-text">{t('uncertain')}</p> : null}
                  </div>
                ))}
              </div>
            ))}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {version.document ? null : (
                <Button type="button" variant="secondary" disabled={pending} onClick={() => void save()}>{t('save')}</Button>
              )}
              {saveState === 'saving' ? <p role="status" className="self-center text-sm text-career-muted">{t('save_saving')}</p> : null}
              {saveState === 'saved' ? <p role="status" className="self-center text-sm text-career-ink">{t('save_saved')}</p> : null}
              {saveState === 'error' ? <p role="status" className="self-center text-sm text-career-danger">{t('save_error')}</p> : null}
              {version.body.confirmation === 'draft' ? (
                <Button type="button" variant="secondary" disabled={pending} onClick={() => void confirmVersion()}>{t('confirm')}</Button>
              ) : null}
              <Button type="button" disabled={pending} onClick={() => setConfirming(true)}>{t('generate')}</Button>
              <Button type="button" variant="secondary" onClick={() => void download('pdf')}>{t('pdf')}</Button>
              <Button type="button" variant="secondary" onClick={() => void download('docx')}>{t('docx')}</Button>
              <Button type="button" variant="secondary" onClick={() => void checkReadability()}>{t('readability')}</Button>
            </div>
            {confirming ? (
              <div className="mt-4 rounded-md border border-career-line p-4">
                <h2 className="text-lg font-semibold text-career-ink">{t('generate_title')}</h2>
                <p className="mt-2 text-sm text-career-muted">
                  {t('generate_body', { count: (credit?.includedRemaining ?? 0) + (credit?.packRemaining ?? 0) })}
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Button type="button" disabled={pending} onClick={() => void generate()}>{t('generate_go')}</Button>
                  <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>{t('generate_leave')}</Button>
                </div>
              </div>
            ) : null}
            {issues ? (
              <div className="mt-4">
                <h2 className="text-lg font-semibold text-career-ink">{t('readability_label')}</h2>
                <p className="mt-1 text-sm text-career-muted">{t('readability_not_a_score')}</p>
                {issues.length === 0 ? <p className="mt-2 text-sm text-career-ink">{t('readability_clear')}</p> : null}
                <ul className="mt-2 flex flex-col gap-1">
                  {issues.map((issue, index) => (
                    <li key={`${issue.code}-${issue.section ?? ''}-${issue.factId ?? index}`} className="text-sm text-career-ink">
                      {issueText(issue)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <form className="mt-6 flex flex-col gap-2 border-t border-career-line pt-4" onSubmit={(event) => { event.preventDefault(); setWritingConfirm(true); }}>
              <label className="text-sm font-semibold text-career-ink" htmlFor="writing-type">{t('writing_type')}</label>
              <select
                id="writing-type"
                className="min-h-career-touch w-full min-w-0 rounded-md border border-career-line bg-white px-3 text-sm text-career-ink dark:bg-career-surface"
                value={writingType}
                onChange={(event) => setWritingType(event.target.value as WritingType)}
              >
                <option value="cover_letter">{t('type_cover_letter')}</option>
                <option value="bio">{t('type_bio')}</option>
                <option value="linkedin">{t('type_linkedin')}</option>
                <option value="outreach">{t('type_outreach')}</option>
              </select>
              {writingType === 'cover_letter' ? (
                <label className="text-sm font-semibold text-career-ink" htmlFor="letter-template">
                  {t('letter_template')}
                  <select
                    id="letter-template"
                    className="mt-1.5 min-h-career-touch w-full min-w-0 rounded-md border border-career-line bg-white px-3 text-sm text-career-ink dark:bg-career-surface"
                    value={letterTemplate}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!isCoverLetterTemplateId(value)) return;
                      setLetterTemplate(value);
                      if (!writingDoc) return;
                      void api
                        .updateWriting(writingDoc.id, { templateId: value })
                        .then((saved) => {
                          setWritingDoc(saved);
                          setDocumentDraft(saved.body);
                        })
                        .catch(note);
                    }}
                  >
                    {COVER_LETTER_TEMPLATES.map((template) => (
                      <option key={template.id} value={template.id}>
                        {tHome(`letter_template_${template.id}`)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <Input
                label={t('writing_opportunity')}
                name="writingOpportunityId"
                value={writingOpportunity}
                onChange={(event) => setWritingOpportunity(event.target.value)}
              />
              <p className="text-sm text-career-muted">{t('writing_draft_only')}</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" disabled={pending}>{t('writing_open')}</Button>
                <Button type="button" variant="secondary" onClick={() => void loadDrafts()}>{t('writing_load')}</Button>
              </div>
            </form>
            {writingConfirm ? (
              <div className="mt-4 rounded-md border border-career-line p-4">
                <h2 className="text-lg font-semibold text-career-ink">{t('writing_title')}</h2>
                <p className="mt-2 text-sm text-career-muted">
                  {t('writing_body', { count: (credit?.includedRemaining ?? 0) + (credit?.packRemaining ?? 0) })}
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Button type="button" disabled={pending} onClick={() => void writeDocument()}>{t('writing_go')}</Button>
                  <Button type="button" variant="ghost" onClick={() => setWritingConfirm(false)}>{t('generate_leave')}</Button>
                </div>
              </div>
            ) : null}
            {writingDoc ? (
              <form className="mt-4 flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); void saveDocument(); }}>
                <p className="text-sm font-semibold text-career-ink">{writingDoc.title}</p>
                <p className="text-sm text-career-muted">{t('writing_facts_only')}</p>
                {writingDoc.type === 'cover_letter' ? (
                  <div className="max-w-xs">
                    <p className="mb-2 text-sm text-career-muted">{t('letter_layout_note')}</p>
                    <LetterPaper
                      templateId={letterTemplate}
                      labelled={false}
                      body={documentDraft}
                      name={version ? resumeDisplayName(version.body, '', drafts) : ''}
                      compact
                    />
                  </div>
                ) : null}
                <label className="text-sm font-semibold text-career-ink" htmlFor="writing-draft">{t('writing_edit')}</label>
                <textarea
                  id="writing-draft"
                  className="min-h-32 w-full min-w-0 rounded-md border border-career-line bg-white p-3 text-sm text-career-ink dark:bg-career-surface"
                  value={documentDraft}
                  onChange={(event) => setDocumentDraft(event.target.value)}
                />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="submit" variant="secondary" disabled={pending}>{t('writing_save')}</Button>
                  <Button type="button" variant="ghost" onClick={() => void downloadWriting('pdf')}>
                    {t('writing_download_pdf')}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => void downloadWriting('docx')}>
                    {t('writing_download_docx')}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => void downloadWriting('txt')}>
                    {t('writing_download')}
                  </Button>
                </div>
              </form>
            ) : null}
            <form className="mt-4 flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); void tailor(); }}>
              <Input label={t('tailor_label')} name="opportunityId" value={opportunityId} onChange={(event) => setOpportunityId(event.target.value)} />
              <Button type="submit" variant="secondary" disabled={pending}>{t('tailor')}</Button>
            </form>
          </Card>
          <div className={pane === 'edit' ? 'max-xl:hidden' : undefined}>
            <ResumePreview
              name={title}
              language={detail?.language ?? (locale === 'fr' ? 'fr' : 'en')}
              version={version}
              drafts={drafts}
              scale={previewScale}
              onScale={setPreviewScale}
            />
          </div>
        </div>
        </>
      )}
      {problem === 'upgrade' ? <PlanUpgradeState title={t('upgrade_title')} body={t('upgrade_body')} /> : null}
      {problem === 'quota' ? (
        <QuotaExhaustedState title={t('quota_title')} body={t('quota_body', { date: credit?.renewalDate?.slice(0, 10) ?? '' })} />
      ) : null}
      {problem === 'failed' ? (
        <FailedJobState title={t('failed_title')} body={released ? t('failed_released') : t('failed_kept')} />
      ) : null}
      {problem === 'capacity' && limit !== null ? <p role="status">{t('capacity', { limit })}</p> : null}
      {problem === 'clarify' ? <p role="status">{t('clarify_role')}</p> : null}
      {problem === 'unusable' ? <p role="status">{t('letter_unusable')}</p> : null}
      {problem === 'conflict' && detail ? (
        <div role="alert" className="flex flex-col gap-2">
          <p>{t('conflict')}</p>
          <Button type="button" variant="secondary" onClick={() => { setProblem(null); void reloadResume(detail.id); }}>{t('conflict_reload')}</Button>
        </div>
      ) : null}
      {problem === 'missing' ? <p role="status">{t('tailor_missing')}</p> : null}
    </div>
  );
}

function draftsFrom(version: ResumeVersion | null): Record<string, string> {
  const drafts: Record<string, string> = {};
  for (const section of version?.body.sections ?? []) {
    for (const line of section.lines) drafts[line.factId] = line.text;
  }
  return drafts;
}

function ResumePreview({
  name,
  language,
  version,
  drafts,
  scale,
  onScale,
}: {
  name: string;
  language: 'en' | 'fr';
  version: ResumeVersion;
  drafts: Record<string, string>;
  scale: 'fit' | 'full';
  onScale: (value: 'fit' | 'full') => void;
}) {
  const t = useTranslations('career.resume');
  const templateId = isResumeTemplateId(version.body.templateId) ? version.body.templateId : 'classic';
  // Same name, contact line, and headings as the exported PDF/DOCX.
  const displayName = resumeDisplayName(version.body, name, drafts);
  const contact = version.body.sections
    .filter((section) => section.factType === 'contact')
    .flatMap((section) => section.lines.map((line) => resumeContactLine(drafts[line.factId] ?? line.text, displayName)))
    .filter(Boolean)
    .join(' · ');
  const lines = version.body.sections.flatMap((section) =>
    section.lines.map((line) => ({ id: line.factId, text: drafts[line.factId] ?? line.text })),
  );
  return (
    <aside className="min-w-0 xl:sticky xl:top-[calc(var(--fc-header)+1rem)]" aria-label={t('preview')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-career-ink">{t('preview')}</p>
        <div role="group" aria-label={t('preview_zoom')} className="inline-flex rounded-md border border-career-line p-0.5">
          <button
            type="button"
            aria-pressed={scale === 'fit'}
            className={`min-h-career-touch rounded px-2 text-xs font-semibold ${scale === 'fit' ? 'bg-career-navy text-white' : 'text-career-ink'}`}
            onClick={() => onScale('fit')}
          >
            {t('preview_fit')}
          </button>
          <button
            type="button"
            aria-pressed={scale === 'full'}
            className={`min-h-career-touch rounded px-2 text-xs font-semibold ${scale === 'full' ? 'bg-career-navy text-white' : 'text-career-ink'}`}
            onClick={() => onScale('full')}
          >
            {t('preview_full')}
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs text-career-muted">{t('preview_help')}</p>
      {lines.length === 0 ? <p className="mt-4 text-sm text-career-muted">{t('preview_empty')}</p> : (
        <div className={`mt-3 origin-top transition-transform duration-200 ${scale === 'fit' ? 'max-w-full' : 'min-w-[24rem]'}`}>
          <DocumentPaper
            templateId={templateId}
            lines={lines}
            sections={version.body.sections
              .filter((section) => section.factType !== 'contact')
              .map((section) => ({
                heading: resumeSectionHeading(section.factType, language),
                items: section.lines.map((line) => drafts[line.factId] ?? line.text),
              }))}
            mode="live"
            labelled={false}
            title={displayName}
            contact={contact}
            language={language}
          />
        </div>
      )}
    </aside>
  );
}

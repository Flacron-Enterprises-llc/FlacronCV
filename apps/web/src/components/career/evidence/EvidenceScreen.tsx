'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  isApiError,
  type ApiClient,
  type CareerEvidence,
  type CreateEvidenceInput,
  type EvidenceLabel,
  type EvidenceType,
} from '@flacroncv/career-api-client';
import { EVIDENCE_TYPES, safeEvidenceUrl } from '@flacroncv/career-shared';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FilePicker,
  Input,
  LoadingState,
  PageHeader,
  PermissionDeniedState,
  ProviderUnavailableState,
  ScreenStack,
} from '@/components/career/ui';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { profileLoadFailure } from '@/lib/career/profile-load';

/** The types the API stores (it checks each file's signature too). */
const FILE_ACCEPT = '.pdf,.png,.jpg,.jpeg,.docx,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Decimal units, the same ones the plan storage allowance is counted in (OPEN_DECISIONS 14). */
function formatBytes(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

const LABEL_TONES: Record<EvidenceLabel, 'neutral' | 'recommended' | 'later' | 'draft' | 'confirmed' | 'submitted'> = {
  self_reported: 'neutral',
  evidence_attached: 'draft',
  assessment_completed: 'recommended',
  issuer_verified: 'confirmed',
  reference_confirmed: 'submitted',
};

export function EvidenceScreen({
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
  const t = useTranslations('career.evidence');
  const [load, setLoad] = useState<'loading' | 'permission' | 'unavailable' | 'signed-out' | 'ready'>('loading');
  const [items, setItems] = useState<CareerEvidence[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [evidenceType, setEvidenceType] = useState<EvidenceType>('project');
  const [description, setDescription] = useState('');
  const [ownershipStatement, setOwnershipStatement] = useState('');
  const [skillsText, setSkillsText] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [isPortfolioShared, setIsPortfolioShared] = useState(false);
  const [confidential, setConfidential] = useState(false);
  const [redactionNote, setRedactionNote] = useState('');
  const [redactionConfirmed, setRedactionConfirmed] = useState(false);
  const [factIds, setFactIds] = useState<string[]>([]);
  const [facts, setFacts] = useState<Array<{ id: string; label: string }>>([]);
  // Sharing a confidential item asks for a redaction confirmation first.
  const [sharing, setSharing] = useState<CareerEvidence | null>(null);
  const [sharingNote, setSharingNote] = useState('');
  const [itemError, setItemError] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [fileBusy, setFileBusy] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoad('loading');
    setErrorMessage(null);
    try {
      const res = await api.evidence();
      setItems(res.items);
      setLoad('ready');
    } catch (error) {
      const failure = profileLoadFailure(error);
      setLoad(failure === 'signed-out' ? 'signed-out' : failure === 'permission' ? 'permission' : 'unavailable');
    }
  }, [api]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLoad('signed-out');
      return;
    }
    void loadItems();
  }, [ready, user, loadItems]);

  useEffect(() => {
    if (load !== 'ready') return;
    let live = true;
    api
      .facts()
      .then((list) => {
        if (!live) return;
        setFacts(list.items.map((fact) => ({ id: fact.id, label: evidenceFactLabel(fact.factType, fact.value as Record<string, unknown>) })));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (attachmentUrl.trim() && !safeEvidenceUrl(attachmentUrl)) {
      setErrorMessage(t('url_unsafe'));
      return;
    }
    if (confidential && isPortfolioShared && !redactionConfirmed) {
      setErrorMessage(t('redaction_required'));
      return;
    }
    setSaving(true);
    try {
      const skills = skillsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const input: CreateEvidenceInput = {
        title: title.trim(),
        evidenceType,
        description: description.trim() || undefined,
        ownershipStatement: ownershipStatement.trim() || undefined,
        linkedSkills: skills.length > 0 ? skills : undefined,
        attachmentUrl: attachmentUrl.trim() || undefined,
        attachmentName: attachmentName.trim() || undefined,
        isPortfolioShared,
        linkedFactIds: factIds.length > 0 ? factIds : undefined,
        confidential,
        redactionNote: confidential ? redactionNote.trim() || null : null,
        redactionConfirmed: confidential && redactionConfirmed,
      };

      const created = await api.createEvidence(input);
      setItems((prev) => [created, ...prev]);
      setIsCreating(false);
      // Reset form
      setTitle('');
      setDescription('');
      setOwnershipStatement('');
      setSkillsText('');
      setAttachmentUrl('');
      setAttachmentName('');
      setIsPortfolioShared(false);
      setConfidential(false);
      setRedactionNote('');
      setRedactionConfirmed(false);
      setFactIds([]);
    } catch (error) {
      if (isApiError(error, 'capacity_exceeded')) {
        setErrorMessage(t('capacity_exceeded'));
      } else if (isApiError(error, 'feature_unavailable')) {
        setErrorMessage(t('feature_unavailable'));
      } else if (isApiError(error, 'validation_error')) {
        setErrorMessage(t('validation_error'));
      } else {
        setErrorMessage(t('save_failed'));
      }
    } finally {
      setSaving(false);
    }
  };

  const replaceItem = (updated: CareerEvidence) =>
    setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));

  const patchItem = async (item: CareerEvidence, patch: Parameters<ApiClient['updateEvidence']>[1]) => {
    setItemError((current) => ({ ...current, [item.id]: '' }));
    try {
      replaceItem(await api.updateEvidence(item.id, patch));
    } catch (error) {
      const message =
        isApiError(error, 'validation_error') && error.body.field === 'redactionConfirmed'
          ? t('redaction_required')
          : isApiError(error, 'validation_error') && error.body.field === 'attachmentUrl'
            ? t('url_unsafe')
            : t('save_failed');
      setItemError((current) => ({ ...current, [item.id]: message }));
    }
  };

  const toggleShare = (item: CareerEvidence) => {
    if (item.isPortfolioShared) return void patchItem(item, { isPortfolioShared: false });
    if (item.confidential && !item.redactionConfirmedAt) {
      setSharingNote(item.redactionNote ?? '');
      setSharing(item);
      return;
    }
    void patchItem(item, { isPortfolioShared: true });
  };

  const fileErrorMessage = (error: unknown): string => {
    if (isApiError(error) && error.status === 413) return t('file_error_too_large');
    if (isApiError(error, 'validation_error')) {
      return error.body.reason === 'too_large' ? t('file_error_too_large') : t('file_error_type');
    }
    if (isApiError(error, 'capacity_exceeded')) return t('file_error_capacity');
    if (isApiError(error, 'provider_unavailable')) return t('file_error_unavailable');
    return t('file_error_failed');
  };

  const handleUpload = async (item: CareerEvidence, file: File | undefined) => {
    if (!file) return;
    setFileBusy(item.id);
    setErrorMessage(null);
    try {
      replaceItem(await api.uploadEvidenceAttachment(item.id, file, file.name));
    } catch (error) {
      setErrorMessage(fileErrorMessage(error));
    } finally {
      setFileBusy(null);
    }
  };

  const handleDownload = async (item: CareerEvidence) => {
    setFileBusy(item.id);
    setErrorMessage(null);
    try {
      const link = await api.evidenceAttachmentLink(item.id);
      window.location.assign(link.url);
    } catch (error) {
      setErrorMessage(fileErrorMessage(error));
    } finally {
      setFileBusy(null);
    }
  };

  const handleRemoveFile = async (item: CareerEvidence) => {
    setFileBusy(item.id);
    setErrorMessage(null);
    try {
      replaceItem(await api.removeEvidenceAttachment(item.id));
    } catch (error) {
      setErrorMessage(fileErrorMessage(error));
    } finally {
      setFileBusy(null);
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmBusy(true);
    try {
      await api.deleteEvidence(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch {
      setErrorMessage(t('delete_failed'));
    } finally {
      setConfirmBusy(false);
      setPendingConfirm(null);
    }
  };

  // Deleting an item or its stored file cannot be undone, so both ask first.
  const [pendingConfirm, setPendingConfirm] = useState<{ kind: 'delete' | 'file'; item: CareerEvidence } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const runConfirmed = async () => {
    if (!pendingConfirm) return;
    if (pendingConfirm.kind === 'delete') {
      await handleDelete(pendingConfirm.item.id);
      return;
    }
    setConfirmBusy(true);
    try {
      await handleRemoveFile(pendingConfirm.item);
    } finally {
      setConfirmBusy(false);
      setPendingConfirm(null);
    }
  };

  if (!ready || load === 'loading') return <LoadingState label={t('loading')} />;
  if (load === 'permission') return <PermissionDeniedState title={t('permission_title')} body={t('permission_body')} />;
  if (load === 'unavailable') {
    return (
      <ProviderUnavailableState
        title={t('unavailable_title')}
        body={t('unavailable_body')}
        action={
          <Button type="button" onClick={() => void loadItems()}>
            {t('retry')}
          </Button>
        }
      />
    );
  }
  if (load === 'signed-out') {
    return (
      <EmptyState
        title={t('signed_out_title')}
        body={t('signed_out_body')}
        action={
          <a href={signInHref} className="btn-primary min-h-career-touch inline-flex items-center px-4 py-2 font-medium">
            {t('sign_in')}
          </a>
        }
      />
    );
  }

  return (
    <ScreenStack>
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          !isCreating ? (
            <Button type="button" onClick={() => setIsCreating(true)}>
              {t('add_evidence')}
            </Button>
          ) : null
        }
      />
      <ConfirmDialog
        open={pendingConfirm !== null}
        title={pendingConfirm?.kind === 'file' ? t('confirm_file_title') : t('confirm_delete_title')}
        body={pendingConfirm ? t(pendingConfirm.kind === 'file' ? 'confirm_file_body' : 'confirm_delete_body', { title: pendingConfirm.item.title }) : undefined}
        confirmLabel={pendingConfirm?.kind === 'file' ? t('file_remove') : t('delete')}
        cancelLabel={t('cancel')}
        danger
        busy={confirmBusy}
        onConfirm={() => void runConfirmed()}
        onCancel={() => setPendingConfirm(null)}
      />

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      {/* Creation Form */}
      {isCreating && (
        <Card className="p-6">
          <form onSubmit={handleCreate} className="space-y-4">
            <h2 className="text-lg font-semibold text-career-ink">{t('create_heading')}</h2>

            <Input
              id="evidence-title"
              label={`${t('field_title')} *`}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
              placeholder={t('field_title_placeholder')}
            />

            <div>
              <label htmlFor="evidence-type" className="block text-sm font-semibold text-career-ink">
                {t('field_type')} *
              </label>
              <select
                id="evidence-type"
                value={evidenceType}
                onChange={(e) => setEvidenceType(e.target.value as EvidenceType)}
                className="mt-1.5 block w-full rounded-md border border-career-line bg-career-surface px-3 py-2 text-base text-career-ink shadow-sm focus:border-career-navy focus:outline-none focus:ring-1 focus:ring-career-navy"
              >
                {EVIDENCE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`type_${type}`)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="evidence-desc" className="block text-sm font-semibold text-career-ink">
                {t('field_description')}
              </label>
              <textarea
                id="evidence-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={4000}
                rows={3}
                placeholder={t('field_description_placeholder')}
                className="mt-1.5 block w-full rounded-md border border-career-line bg-career-surface px-3 py-2 text-base text-career-ink shadow-sm focus:border-career-navy focus:outline-none focus:ring-1 focus:ring-career-navy"
              />
            </div>

            <Input
              id="evidence-ownership"
              label={t('field_ownership')}
              type="text"
              value={ownershipStatement}
              onChange={(e) => setOwnershipStatement(e.target.value)}
              maxLength={2000}
              placeholder={t('field_ownership_placeholder')}
            />

            <Input
              id="evidence-skills"
              label={t('field_skills')}
              type="text"
              value={skillsText}
              onChange={(e) => setSkillsText(e.target.value)}
              placeholder={t('field_skills_placeholder')}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="evidence-url"
                label={t('field_attachment_url')}
                type="url"
                value={attachmentUrl}
                onChange={(e) => setAttachmentUrl(e.target.value)}
                placeholder="https://..."
              />
              <Input
                id="evidence-name"
                label={t('field_attachment_name')}
                type="text"
                value={attachmentName}
                onChange={(e) => setAttachmentName(e.target.value)}
                placeholder="credential.pdf"
              />
            </div>

            {facts.length > 0 ? (
              <fieldset className="space-y-1">
                <legend className="text-sm font-semibold text-career-ink">{t('field_linked_facts')}</legend>
                <p className="text-xs text-career-muted">{t('field_linked_facts_hint')}</p>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-career-line p-2">
                  {facts.map((fact) => (
                    <label key={fact.id} className="flex items-center gap-2 text-sm text-career-ink">
                      <input
                        type="checkbox"
                        checked={factIds.includes(fact.id)}
                        onChange={(e) => setFactIds((current) => (e.target.checked ? [...current, fact.id] : current.filter((id) => id !== fact.id)))}
                      />
                      <span dir="auto">{fact.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <div className="flex items-center gap-2 pt-2">
              <input
                id="evidence-confidential"
                type="checkbox"
                checked={confidential}
                onChange={(e) => setConfidential(e.target.checked)}
                className="h-4 w-4 rounded border-career-line text-career-navy focus:ring-career-navy"
              />
              <label htmlFor="evidence-confidential" className="text-sm font-semibold text-career-ink">
                {t('field_confidential')}
              </label>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                id="evidence-shared"
                type="checkbox"
                checked={isPortfolioShared}
                onChange={(e) => setIsPortfolioShared(e.target.checked)}
                className="h-4 w-4 rounded border-career-line text-career-navy focus:ring-career-navy"
              />
              <label htmlFor="evidence-shared" className="text-sm font-semibold text-career-ink">
                {t('field_portfolio_shared')}
              </label>
            </div>

            {confidential && isPortfolioShared ? (
              <div className="space-y-2 rounded-md border border-career-line bg-career-wash p-3">
                <p className="text-sm text-career-ink">{t('redaction_help')}</p>
                <Input id="evidence-redaction" label={t('field_redaction_note')} value={redactionNote} maxLength={1000} onChange={(e) => setRedactionNote(e.target.value)} />
                <label className="flex items-center gap-2 text-sm font-semibold text-career-ink">
                  <input type="checkbox" checked={redactionConfirmed} onChange={(e) => setRedactionConfirmed(e.target.checked)} />
                  {t('field_redaction_confirm')}
                </label>
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-3 pt-4">
              <Button type="button" variant="secondary" onClick={() => setIsCreating(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" loading={saving} loadingLabel={t('saving')}>
                {t('save')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Items List */}
      {items.length === 0 && !isCreating ? (
        <EmptyState
          title={t('empty_title')}
          body={t('empty_body')}
          action={
            <Button type="button" onClick={() => setIsCreating(true)}>
              {t('add_evidence')}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <Card key={item.id} className="flex flex-col justify-between p-5">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-career-muted">
                    {t(`type_${item.evidenceType}`)}
                  </span>
                  <Badge tone={LABEL_TONES[item.evidenceLabel]}>
                    {t(`label_${item.evidenceLabel}`)}
                  </Badge>
                </div>
                <p className="text-xs text-career-muted">{t(`label_${item.evidenceLabel}_limit`)}</p>
                {item.confidential ? <Badge tone="later">{t('confidential_badge')}</Badge> : null}
                {item.linkedFactIds && item.linkedFactIds.length > 0 ? (
                  <p className="text-xs text-career-muted">{t('linked_facts_count', { count: item.linkedFactIds.length })}</p>
                ) : null}
                {item.verifications && item.verifications.length > 0 ? (
                  <details className="rounded-md border border-career-line p-2 text-xs">
                    <summary className="cursor-pointer font-semibold text-career-ink">{t('verification_history', { count: item.verifications.length })}</summary>
                    <ul className="mt-2 space-y-2">
                      {item.verifications.map((check) => (
                        <li key={check.id} className="text-career-ink">
                          <p className="font-semibold">
                            {t(`label_${check.label}`)} · {t(`method_${check.method}`)} · {check.checkedOn}
                            {' '}
                            <Badge tone={check.active ? 'confirmed' : 'later'}>
                              {check.revokedAt ? t('check_revoked') : check.active ? t('check_active') : t('check_expired')}
                            </Badge>
                          </p>
                          <p dir="auto">{t('check_issuer', { issuer: check.issuerName })}</p>
                          <p dir="auto">{t('check_scope', { scope: check.scope })}</p>
                          <p dir="auto">{t('check_permission', { permission: check.permissionEvidence })}</p>
                          {check.expiresOn ? <p>{t('check_expires', { date: check.expiresOn })}</p> : null}
                          {check.revokedReason ? <p dir="auto">{t('check_revoked_reason', { reason: check.revokedReason })}</p> : null}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                <h3 className="text-lg font-semibold text-career-ink">{item.title}</h3>

                {item.description && (
                  <p className="text-sm text-career-ink/80">{item.description}</p>
                )}

                {item.ownershipStatement && (
                  <p className="text-xs italic text-career-muted">
                    &ldquo;{item.ownershipStatement}&rdquo;
                  </p>
                )}

                {item.linkedSkills && item.linkedSkills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {item.linkedSkills.map((skill: string) => (
                      <span
                        key={skill}
                        className="inline-flex items-center rounded bg-career-wash px-2 py-0.5 text-xs font-medium text-career-ink"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                )}

                {item.attachmentStored ? (
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <span className="text-xs font-medium text-career-ink">📎 {item.attachmentName || t('view_attachment')}</span>
                    <span className="text-xs text-career-muted">{formatBytes(item.attachmentSizeBytes)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={fileBusy === item.id}
                      onClick={() => void handleDownload(item)}
                      className="text-xs"
                    >
                      {t('file_download')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={fileBusy === item.id}
                      onClick={() => setPendingConfirm({ kind: 'file', item })}
                      className="text-xs"
                    >
                      {t('file_remove')}
                    </Button>
                    <FilePicker
                      className="w-full"
                      label={fileBusy === item.id ? t('file_uploading') : t('file_replace')}
                      buttonLabel={t('file_choose')}
                      emptyLabel={t('file_none_chosen')}
                      accept={FILE_ACCEPT}
                      disabled={fileBusy === item.id}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        void handleUpload(item, file);
                      }}
                    />
                  </div>
                ) : (
                  <FilePicker
                    className="pt-2"
                    label={fileBusy === item.id ? t('file_uploading') : t('file_attach')}
                    buttonLabel={t('file_choose')}
                    emptyLabel={t('file_none_chosen')}
                    hint={t('file_hint')}
                    accept={FILE_ACCEPT}
                    disabled={fileBusy === item.id}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      void handleUpload(item, file);
                    }}
                  />
                )}

                {!item.attachmentStored && item.attachmentUrl && safeEvidenceUrl(item.attachmentUrl) ? (
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <a
                      href={safeEvidenceUrl(item.attachmentUrl) ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-career-navy hover:underline"
                    >
                      📎 {item.attachmentName || t('view_attachment')}
                    </a>
                    <Button type="button" variant="ghost" className="text-xs" onClick={() => void patchItem(item, { attachmentUrl: null })}>
                      {t('link_remove')}
                    </Button>
                  </div>
                ) : null}
                {itemError[item.id] ? <p role="alert" className="text-xs text-red-700 dark:text-red-300">{itemError[item.id]}</p> : null}
              </div>

              <div className="flex items-center justify-between border-t border-career-line pt-4 mt-4">
                <span className="flex items-center gap-2 text-xs text-career-muted">
                  {item.isPortfolioShared ? t('portfolio_public') : t('portfolio_private')}
                  <Button type="button" variant="ghost" className="text-xs" onClick={() => toggleShare(item)}>
                    {item.isPortfolioShared ? t('share_stop') : t('share_start')}
                  </Button>
                </span>
                <Button
                  type="button"
                  variant="danger-ghost"
                  onClick={() => setPendingConfirm({ kind: 'delete', item })}
                  className="text-xs"
                >
                  {t('delete')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={sharing !== null}
        title={t('redaction_confirm_title')}
        body={sharing ? t('redaction_confirm_body', { title: sharing.title, note: sharingNote || t('redaction_no_note') }) : undefined}
        confirmLabel={t('redaction_confirm_go')}
        cancelLabel={t('cancel')}
        onConfirm={() => {
          const target = sharing;
          setSharing(null);
          if (target) void patchItem(target, { isPortfolioShared: true, redactionConfirmed: true });
        }}
        onCancel={() => setSharing(null)}
      />
    </ScreenStack>
  );
}

/** A short label for a profile fact in the link picker. */
export function evidenceFactLabel(factType: string, value: Record<string, unknown>): string {
  const text = (key: string) => (typeof value[key] === 'string' ? (value[key] as string) : '');
  if (factType === 'experience') return [text('position'), text('company')].filter(Boolean).join(' · ') || factType;
  for (const key of ['name', 'title', 'institution', 'fullName', 'text']) if (text(key)) return text(key).slice(0, 80);
  return factType;
}

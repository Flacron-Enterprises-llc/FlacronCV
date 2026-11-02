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
import { EVIDENCE_TYPES } from '@flacroncv/career-shared';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  PermissionDeniedState,
  ProviderUnavailableState,
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMessage(null);
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
    try {
      await api.deleteEvidence(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch {
      setErrorMessage(t('delete_failed'));
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
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-career-navy dark:text-white sm:text-3xl">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t('subtitle')}</p>
        </div>
        {!isCreating && (
          <Button type="button" onClick={() => setIsCreating(true)} className="w-full sm:w-auto">
            {t('add_evidence')}
          </Button>
        )}
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      {/* Creation Form */}
      {isCreating && (
        <Card className="p-6">
          <form onSubmit={handleCreate} className="space-y-4">
            <h2 className="text-lg font-semibold text-career-navy dark:text-white">{t('create_heading')}</h2>

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
                      onClick={() => void handleRemoveFile(item)}
                      className="text-xs"
                    >
                      {t('file_remove')}
                    </Button>
                    <div className="w-full space-y-1">
                      <label className="block text-xs font-medium text-career-ink" htmlFor={`evidence-replace-${item.id}`}>
                        {fileBusy === item.id ? t('file_uploading') : t('file_replace')}
                      </label>
                      <input
                        id={`evidence-replace-${item.id}`}
                        type="file"
                        accept={FILE_ACCEPT}
                        disabled={fileBusy === item.id}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          void handleUpload(item, file);
                        }}
                        className="block w-full text-xs text-career-muted file:mr-3 file:rounded-md file:border file:border-career-line file:bg-career-wash file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-career-ink"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1 pt-2">
                    <label className="block text-xs font-medium text-career-ink" htmlFor={`evidence-file-${item.id}`}>
                      {fileBusy === item.id ? t('file_uploading') : t('file_attach')}
                    </label>
                    <input
                      id={`evidence-file-${item.id}`}
                      type="file"
                      accept={FILE_ACCEPT}
                      disabled={fileBusy === item.id}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        void handleUpload(item, file);
                      }}
                      className="block w-full text-xs text-career-muted file:mr-3 file:rounded-md file:border file:border-career-line file:bg-career-wash file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-career-ink"
                    />
                    <p className="text-xs text-career-muted">{t('file_hint')}</p>
                  </div>
                )}

                {!item.attachmentStored && item.attachmentUrl && (
                  <div className="pt-2">
                    <a
                      href={item.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-career-navy hover:underline"
                    >
                      📎 {item.attachmentName || t('view_attachment')}
                    </a>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-career-line pt-4 mt-4">
                <span className="text-xs text-career-muted">
                  {item.isPortfolioShared ? t('portfolio_public') : t('portfolio_private')}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleDelete(item.id)}
                  className="text-xs text-career-danger hover:bg-career-danger/10"
                >
                  {t('delete')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

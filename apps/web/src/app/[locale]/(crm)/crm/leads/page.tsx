'use client';
import React from 'react';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useModalA11y } from '@/hooks/useModalA11y';
import {
  CRMLead,
  CRMLeadStage,
  CRMCustomerSource,
} from '@flacroncv/shared-types';
import CRMStatusBadge from '@/components/crm/CRMStatusBadge';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  Plus,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Trash2,
  X,
  Target,
  Edit3,
  Save,
} from 'lucide-react';
import { safeFormat } from '@/lib/format-date';
import { toast } from 'sonner';
import { downloadCsv } from '@/lib/download-csv';

interface ListResponse {
  items: CRMLead[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const STAGE_OPTIONS = [
  { value: '', labelKey: 'leads_all_stages' },
  { value: CRMLeadStage.NEW, labelKey: 'stage_new' },
  { value: CRMLeadStage.CONTACTED, labelKey: 'stage_contacted' },
  { value: CRMLeadStage.QUALIFIED, labelKey: 'stage_qualified' },
  { value: CRMLeadStage.PROPOSAL, labelKey: 'stage_proposal' },
  { value: CRMLeadStage.CLOSED_WON, labelKey: 'stage_won' },
  { value: CRMLeadStage.CLOSED_LOST, labelKey: 'stage_lost' },
];

export default function CRMLeadsPage(): React.JSX.Element | null {
  const t = useTranslations('crm');
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [stage, setStage] = useState<CRMLeadStage | ''>('');
  const [page, setPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLead, setEditingLead] = useState<CRMLead | null>(null);
  const [newLead, setNewLead] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    source: CRMCustomerSource.MANUAL,
    stage: CRMLeadStage.NEW,
    notes: '',
  });

  const addModalTitleId = useId();
  const addModalRef = useModalA11y<HTMLDivElement>(showAddModal, () => setShowAddModal(false));

  const queryKey = ['crm', 'leads', { search, stage, page }];

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey,
    queryFn: () =>
      api.get(`/crm/leads?page=${page}&search=${encodeURIComponent(search)}&stage=${stage}`),
    staleTime: 30_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] });
    queryClient.invalidateQueries({ queryKey: ['crm', 'analytics'] });
  };

  const createMutation = useMutation({
    mutationFn: (dto: typeof newLead) => api.post('/crm/leads', dto),
    onSuccess: () => {
      invalidate();
      setShowAddModal(false);
      setNewLead({ name: '', email: '', phone: '', company: '', source: CRMCustomerSource.MANUAL, stage: CRMLeadStage.NEW, notes: '' });
      toast.success(t('leads_toast_added'));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...dto }: Partial<CRMLead> & { id: string }) =>
      api.put(`/crm/leads/${id}`, dto),
    onSuccess: () => { invalidate(); setEditingLead(null); toast.success(t('leads_toast_updated')); },
    onError: (e: Error) => toast.error(e.message),
  });

  const convertMutation = useMutation({
    mutationFn: (leadId: string) => api.post(`/crm/leads/${leadId}/convert`, {}),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['crm', 'customers'] });
      toast.success(t('leads_toast_converted'));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (leadId: string) => api.delete(`/crm/leads/${leadId}`),
    onSuccess: () => { invalidate(); toast.success(t('leads_toast_deleted')); },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleExport = () => {
    downloadCsv('/crm/leads/export/csv', 'leads.csv').catch((e) =>
      toast.error(e instanceof Error ? e.message : 'Export failed'),
    );
  };

  // Stage column counts
  const stageCounts = STAGE_OPTIONS.slice(1).reduce(
    (acc, s) => ({
      ...acc,
      [s.value]: data?.items.filter((l) => l.stage === s.value).length ?? 0,
    }),
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('leads_title')}</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {t('leads_total_count', { count: data?.total ?? 0 })}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={handleExport}>
            {t('export_csv')}
          </Button>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowAddModal(true)}>
            {t('leads_add_lead')}
          </Button>
        </div>
      </div>

      {/* Stage summary pills */}
      <div className="flex flex-wrap gap-2">
        {STAGE_OPTIONS.slice(1).map((s) => (
          <button
            key={s.value}
            onClick={() => { setStage((prev) => prev === s.value ? '' : s.value as CRMLeadStage); setPage(1); }}
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              stage === s.value
                ? 'bg-brand-600 text-white'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700'
            }`}
          >
            {t(s.labelKey)}
            <span className={`rounded-full px-1.5 py-0.5 text-xs ${stage === s.value ? 'bg-brand-700 text-white' : 'bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-400'}`}>
              {stageCounts[s.value] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder={t('leads_search_placeholder')}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full rounded-lg border border-stone-200 bg-white py-2 ps-9 pe-4 text-sm text-stone-900 placeholder-stone-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-700 dark:bg-stone-800 dark:text-white dark:placeholder-stone-500"
            />
          </div>
          <select
            value={stage}
            aria-label={t('filter_by_stage')}
            onChange={(e) => { setStage(e.target.value as CRMLeadStage | ''); setPage(1); }}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
          >
            {STAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
            ))}
          </select>
        </div>
      </Card>

      {/* Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-700 text-start text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                <th className="px-4 py-3">{t('leads_col_lead')}</th>
                <th className="px-4 py-3">{t('company')}</th>
                <th className="px-4 py-3">{t('source')}</th>
                <th className="px-4 py-3">{t('stage')}</th>
                <th className="px-4 py-3">{t('assigned_to')}</th>
                <th className="px-4 py-3">{t('created')}</th>
                <th className="px-4 py-3 text-end">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? [...Array(6)].map((_, i) => (
                    <tr key={i} className="border-b border-stone-100 dark:border-stone-800">
                      {[...Array(7)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 animate-pulse rounded bg-stone-200 dark:bg-stone-700" />
                        </td>
                      ))}
                    </tr>
                  ))
                : data?.items.map((lead) => (
                    <tr
                      key={lead.id}
                      className="group border-b border-stone-100 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50"
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-stone-900 dark:text-white">{lead.name}</p>
                          <p className="text-xs text-stone-500">{lead.email}</p>
                          {lead.phone && <p className="text-xs text-stone-400">{lead.phone}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-stone-600 dark:text-stone-300">
                        {lead.company ?? '—'}
                      </td>
                      <td className="px-4 py-3 capitalize text-stone-600 dark:text-stone-300">
                        {lead.source}
                      </td>
                      <td className="px-4 py-3">
                        {editingLead?.id === lead.id ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={editingLead.stage}
                              aria-label={t('stage')}
                              onChange={(e) => setEditingLead({ ...editingLead, stage: e.target.value as CRMLeadStage })}
                              className="rounded border border-stone-300 px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-800 dark:text-white"
                            >
                              {Object.values(CRMLeadStage).map((v) => (
                                <option key={v} value={v}>{v.replace('_', ' ')}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => updateMutation.mutate({ id: lead.id, stage: editingLead.stage })}
                              aria-label={t('leads_save_stage')}
                              title={t('leads_save_stage')}
                              className="text-brand-600 hover:text-brand-700"
                            >
                              <Save className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingLead(null)}
                              aria-label={t('leads_cancel_stage_edit')}
                              title={t('leads_cancel_stage_edit')}
                              className="text-stone-400 hover:text-stone-600"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <CRMStatusBadge value={lead.stage} type="lead" />
                            <button
                              type="button"
                              onClick={() => setEditingLead(lead)}
                              aria-label={t('leads_edit_stage')}
                              title={t('leads_edit_stage')}
                              className="text-stone-400 hover:text-stone-600 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100"
                            >
                              <Edit3 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-stone-600 dark:text-stone-300">
                        {lead.assignedToName ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-stone-500 dark:text-stone-400">
                        {safeFormat(lead.createdAt, 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<UserCheck className="h-3.5 w-3.5" />}
                            loading={convertMutation.isPending}
                            onClick={() => {
                              if (confirm(t('leads_convert_confirm', { name: lead.name }))) {
                                convertMutation.mutate(lead.id);
                              }
                            }}
                          >
                            {t('leads_convert')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm(t('leads_delete_confirm'))) deleteMutation.mutate(lead.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>

          {!isLoading && !data?.items.length && (
            <div className="flex flex-col items-center justify-center py-16 text-stone-500 dark:text-stone-400">
              <Target className="mb-3 h-10 w-10 opacity-30" />
              <p className="font-medium">{t('leads_empty_title')}</p>
              <p className="text-sm">{t('leads_empty_subtitle')}</p>
            </div>
          )}
        </div>

        {(data?.pages ?? 0) > 1 && (
          <div className="flex items-center justify-between border-t border-stone-200 px-4 py-3 dark:border-stone-700">
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {t('pagination_page_of', { current: data?.page ?? 0, total: data?.pages ?? 0 })}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" icon={<ChevronLeft className="h-4 w-4" />} disabled={page === 1} onClick={() => setPage((p) => p - 1)}>{t('prev')}</Button>
              <Button variant="secondary" size="sm" disabled={page >= (data?.pages ?? 1)} onClick={() => setPage((p) => p + 1)}>{t('next')} <ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </Card>

      {/* Add Lead Modal */}
      {showAddModal && (
        <div
          ref={addModalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={addModalTitleId}
          tabIndex={-1}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 outline-none"
        >
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h2 id={addModalTitleId} className="text-lg font-semibold text-stone-900 dark:text-white">{t('leads_add_lead')}</h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label={t('close')}
                title={t('close')}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(newLead); }} className="space-y-4">
              {[
                { field: 'name', labelKey: 'leads_form_name', type: 'text', required: true },
                { field: 'email', labelKey: 'leads_form_email', type: 'email', required: true },
                { field: 'phone', labelKey: 'phone', type: 'tel', required: false },
                { field: 'company', labelKey: 'company', type: 'text', required: false },
              ].map(({ field, labelKey, type, required }) => (
                <div key={field}>
                  <label htmlFor={`lead-${field}`} className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">{t(labelKey)}</label>
                  <input
                    id={`lead-${field}`}
                    type={type}
                    required={required}
                    value={(newLead as any)[field]}
                    onChange={(e) => setNewLead((p) => ({ ...p, [field]: e.target.value }))}
                    className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="lead-stage" className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">{t('stage')}</label>
                  <select
                    id="lead-stage"
                    value={newLead.stage}
                    onChange={(e) => setNewLead((p) => ({ ...p, stage: e.target.value as CRMLeadStage }))}
                    className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                  >
                    {Object.values(CRMLeadStage).map((v) => (
                      <option key={v} value={v}>{v.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="lead-source" className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">{t('source')}</label>
                  <select
                    id="lead-source"
                    value={newLead.source}
                    onChange={(e) => setNewLead((p) => ({ ...p, source: e.target.value as CRMCustomerSource }))}
                    className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                  >
                    {Object.values(CRMCustomerSource).map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="lead-notes" className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">{t('notes')}</label>
                <textarea
                  id="lead-notes"
                  rows={2}
                  value={newLead.notes}
                  onChange={(e) => setNewLead((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full resize-none rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={() => setShowAddModal(false)}>{t('cancel')}</Button>
                <Button type="submit" loading={createMutation.isPending}>{t('leads_add_lead')}</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
